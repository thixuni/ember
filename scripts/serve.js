#!/usr/bin/env node
/*
 * A tiny static server for src/, so the planner can be opened in a real
 * browser over http rather than file://. Development only — the shipped
 * app never needs a server.
 *
 *   node scripts/serve.js [port]
 *
 * Google sign-in in the browser needs a Web application client that lists
 * http://localhost:<port> as an authorised JavaScript origin. Its Client ID
 * is read from src/google-web-client.json (git-ignored) or from
 * ORBIT_GOOGLE_WEB_CLIENT_ID; without either, the sign-in page asks for it.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const port = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.join(root, rel);

  if (rel === 'google-web-client.json' && process.env.ORBIT_GOOGLE_WEB_CLIENT_ID) {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ clientId: process.env.ORBIT_GOOGLE_WEB_CLIENT_ID }));
    return;
  }

  // Never serve outside src/.
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(buf);
  });
}).listen(port, () => {
  console.log('Ember dev server on http://localhost:' + port);
});
