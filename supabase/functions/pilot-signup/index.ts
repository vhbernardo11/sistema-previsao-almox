import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  })
}

function normalizePhone(value: string) {
  let d = String(value || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`
  if (d.length === 10 || d.length === 11) return `+55${d}`
  return d ? `+${d}` : ''
}

function getAdminKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.default) return parsed.default
    } catch (_) {}
  }
  return ''
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function sourceKey(req: Request) {
  const direct = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || ''
  const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || ''
  const ip = (direct || forwarded).slice(0, 128)
  const ua = (req.headers.get('user-agent') || '').slice(0, 240)
  return ip ? `ip:${ip}` : `fallback:${ua || 'unknown-client'}`
}

async function takeLimit(admin: any, bucket: 'client'|'identifier'|'global', key: string, limit: number, seconds = 3600) {
  const keyHash = await sha256(key)
  const { data, error } = await admin.rpc('it_take_signup_rate_limit_v1', {
    p_bucket_type: bucket,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: seconds,
  })
  if (error) throw new Error(`rate_limit_${bucket}_unavailable`)
  return data || { allowed: false, retry_after_seconds: 60 }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405)

  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > 16384) {
    return json({ ok: false, code: 'payload_too_large' }, 413)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode === 'phone' ? 'phone' : 'email'
    const name = String(body?.name || '').trim().replace(/\s+/g, ' ')
    const password = String(body?.password || '')
    const identifier = String(body?.identifier || '').trim()

    if (name.length < 2 || name.length > 120) return json({ ok: false, code: 'invalid_name' }, 400)
    if (password.length < 10 || password.length > 128 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
      return json({ ok: false, code: 'weak_password' }, 400)
    }

    let loginIdentifier: string
    if (mode === 'email') {
      const email = identifier.toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ ok: false, code: 'invalid_email' }, 400)
      loginIdentifier = email
    } else {
      const phone = normalizePhone(identifier)
      const digits = phone.replace(/\D/g, '')
      if (digits.length < 12 || digits.length > 13) return json({ ok: false, code: 'invalid_phone' }, 400)
      loginIdentifier = phone
    }

    const adminKey = getAdminKey()
    const url = Deno.env.get('SUPABASE_URL') || ''
    if (!url || !adminKey) return json({ ok: false, code: 'server_config' }, 500)

    const admin = createClient(url, adminKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const budgets = [
      await takeLimit(admin, 'global', 'integratrampo:pilot-signup:global:v1', 120),
      await takeLimit(admin, 'client', `integratrampo:pilot-signup:${sourceKey(req)}`, 12),
      await takeLimit(admin, 'identifier', `integratrampo:pilot-signup:${mode}:${loginIdentifier}`, 6),
    ]
    const blocked = budgets.find((b: any) => b?.allowed === false)
    if (blocked) {
      const retry = Math.max(1, Number(blocked.retry_after_seconds || 60))
      return json({ ok: false, code: 'rate_limited', retry_after_seconds: retry }, 429, { 'Retry-After': String(retry) })
    }

    const metadata = {
      full_name: name,
      signup_source: 'integratrampo',
      auth_method: mode,
      pilot_no_verification: true,
    }

    const payload: Record<string, unknown> = mode === 'email'
      ? { email: loginIdentifier, password, email_confirm: true, user_metadata: metadata }
      : { phone: loginIdentifier, password, phone_confirm: true, user_metadata: metadata }

    const { data, error } = await admin.auth.admin.createUser(payload as any)
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || error.status === 422) {
        return json({ ok: false, code: 'already_exists' }, 409)
      }
      console.error('pilot-signup createUser', error)
      return json({ ok: false, code: 'create_failed' }, 400)
    }

    return json({ ok: true, user_id: data.user?.id || null, mode, identifier: loginIdentifier }, 201)
  } catch (error) {
    const msg = String((error as any)?.message || error || '')
    if (msg.startsWith('rate_limit_')) {
      console.error('pilot-signup rate limit', msg)
      return json({ ok: false, code: 'rate_limit_unavailable' }, 503, { 'Retry-After': '60' })
    }
    console.error('pilot-signup', error)
    return json({ ok: false, code: 'unexpected' }, 500)
  }
})
