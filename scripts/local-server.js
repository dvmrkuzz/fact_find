const http = require('http');
const fs = require('fs');
const path = require('path');
const { handler } = require('../netlify/functions/submit-factfind');

const PORT = Number(process.env.PORT) || 8888;
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

loadEnvFile();

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && urlPath === '/.netlify/functions/submit-factfind') {
    try {
      const body = await readBody(req);
      const result = await handler({ httpMethod: 'POST', body });
      const headers = { ...(result.headers || {}), 'Access-Control-Allow-Origin': '*' };
      res.writeHead(result.statusCode || 500, headers);
      res.end(result.body || '');
    } catch (err) {
      console.error('Submit function error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Server error' }));
    }
    return;
  }

  if (req.method === 'OPTIONS' && urlPath === '/.netlify/functions/submit-factfind') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    });
    res.end();
    return;
  }

  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const safeRelative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, safeRelative);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  serveStatic(filePath, res);
});

server.listen(PORT, () => {
  const hasZapier = !!(process.env.ZAPIER_WEBHOOK_URL && process.env.UNIFIED_EMAIL);
  console.log('');
  console.log('  Trinity fact find — local server');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  Submit email:', hasZapier ? 'Zapier configured (.env)' : 'NOT configured — set ZAPIER_WEBHOOK_URL in .env');
  console.log('');
});
