// Local server: serves public/ and runs api/claude.js, reading ANTHROPIC_API_KEY from .env.local.
// Usage: npm run dev            (then open http://localhost:3000)
// Test the fallbacks without a key or tokens (works in any shell): npm run dev -- --fake=bad
// or set the FAKE_CLAUDE environment variable:
//   FAKE_CLAUDE=good  echoes the plain wording back (passes the number checker)
//   FAKE_CLAUDE=bad   changes one number in Decision 1 and adds one to the draft (checker must catch it)
//   FAKE_CLAUDE=junk  replies with text that isn't JSON
//   FAKE_CLAUDE=slow  waits 20 seconds (the page gives up after 12)
//   FAKE_CLAUDE=down  answers 503, like a missing key
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;
const FAKE = process.env.FAKE_CLAUDE || (process.argv.find(a => a.startsWith('--fake=')) || '').slice(7);

const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
const handler = require('../api/claude.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function fake(body, res) {
  if (FAKE === 'down') return res.status(503).json({ error: 'AI not configured' });
  if (FAKE === 'slow') return setTimeout(() => res.status(200).json({ text: '{}' }), 20000);
  if (FAKE === 'junk') return res.status(200).json({ text: 'Sorry, here is some text that is not JSON.' });
  if (body.task === 'draft') {
    const p = body.payload || {};
    let text = 'Subject: Request for explanation\n\nHello,\n\nPlease explain: ' + (p.item || '') + '\nOrder IDs: ' + (p.orders || []).join(', ') + '\n\nThank you,\n[Your name]';
    if (FAKE === 'bad') text += '\nThe extra cost was ₹999.';
    return res.status(200).json({ text });
  }
  const out = JSON.parse(JSON.stringify(body.payload || {}));
  if (FAKE === 'bad' && out.d1 && out.d1.head) out.d1.head = out.d1.head.replace(/\d+/, n => String(+n + 7));
  return res.status(200).json({ text: JSON.stringify(out) });
}

http.createServer((req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.headersSent) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); } };
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/claude') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => {
      try { req.body = JSON.parse(raw || '{}'); } catch (e) { return res.status(400).json({ error: 'Bad JSON' }); }
      if (FAKE) return fake(req.body, res);
      handler(req, res);
    });
    return;
  }
  const file = path.join(PUB, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUB + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Payout Checker on http://localhost:' + PORT +
    (FAKE ? '  (FAKE_CLAUDE=' + FAKE + ')' : process.env.ANTHROPIC_API_KEY ? '  (Claude on)' : '  (no key: plain wording)'));
});
