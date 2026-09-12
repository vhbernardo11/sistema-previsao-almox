// IntegraTrampo · app shell servido por Vercel Function
// Evita interpretações incorretas de MIME/cache da página HTML estática em navegadores móveis.
const fs = require('fs');
const path = require('path');

function loadHtml(){
  const candidates = [
    path.join(process.cwd(), 'index.html'),
    path.join(__dirname, '..', 'index.html')
  ];
  for(const file of candidates){
    try { return fs.readFileSync(file, 'utf8'); } catch (_) {}
  }
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>IntegraTrampo</title><body><h1>IntegraTrampo</h1><p>Não foi possível carregar a interface. Atualize a página.</p></body></html>';
}

const HTML = loadHtml();

module.exports = function handler(req, res){
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(HTML);
};
