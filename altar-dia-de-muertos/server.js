// Altar de Día de Muertos — servidor sin dependencias (solo Node 18+).
//   node server.js            → abre http://localhost:3000 en la TV
//   PORT=8080 PIN=1234 PUBLIC_URL=https://mi-tunel.example node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('./lib/qrcode');

const PORT = Number(process.env.PORT) || 3000;
const PIN = process.env.PIN || String(Math.floor(1000 + Math.random() * 9000));
const MAX_BYTES = 15 * 1024 * 1024;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PHOTOS_DIR = path.join(__dirname, 'fotos');
const DB_FILE = path.join(PHOTOS_DIR, 'ofrendas.json');

fs.mkdirSync(PHOTOS_DIR, { recursive: true });

let ofrendas = [];
try { ofrendas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { ofrendas = []; }
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(ofrendas, null, 2));

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return 'localhost';
}
const uploadUrl = () => (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/$/, '') + '/subir';

// --- Live updates (Server-Sent Events) ---
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, file, cache = 'no-cache') {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'No encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error('too_big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Accept only real image bytes (JPEG / PNG / WebP) — the phone converts everything else.
function imageExt(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.slice(0, 4).toString('hex') === '89504e47') return '.png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'GET' && (p === '/' || p === '/altar')) return serveFile(res, path.join(PUBLIC_DIR, 'altar.html'));
    if (req.method === 'GET' && p === '/subir') return serveFile(res, path.join(PUBLIC_DIR, 'subir.html'));
    if (req.method === 'GET' && p === '/admin') return serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));

    if (req.method === 'GET' && p === '/qr.svg') {
      const qr = qrcode(0, 'M');
      qr.addData(uploadUrl());
      qr.make();
      return send(res, 200, qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }), 'image/svg+xml');
    }

    if (req.method === 'GET' && p === '/api/info') return send(res, 200, { uploadUrl: uploadUrl() });
    if (req.method === 'GET' && p === '/api/ofrendas') return send(res, 200, ofrendas);

    if (req.method === 'GET' && p === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && p === '/api/ofrendas') {
      const buf = await readBody(req);
      const ext = imageExt(buf);
      if (!ext) return send(res, 415, { error: 'Formato no reconocido' });
      const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      const file = id + ext;
      fs.writeFileSync(path.join(PHOTOS_DIR, file), buf);
      const ofrenda = {
        id, file,
        nombre: clean(url.searchParams.get('nombre'), 60),
        mensaje: clean(url.searchParams.get('mensaje'), 120),
        creado: new Date().toISOString(),
      };
      ofrendas.push(ofrenda);
      save();
      broadcast('nueva', ofrenda);
      console.log(`🕯️  Nueva ofrenda: ${ofrenda.nombre || '(sin nombre)'}`);
      return send(res, 201, ofrenda);
    }

    if (req.method === 'DELETE' && p.startsWith('/api/ofrendas/')) {
      if (url.searchParams.get('pin') !== PIN) return send(res, 403, { error: 'PIN incorrecto' });
      const id = p.split('/').pop();
      const o = ofrendas.find((x) => x.id === id);
      if (!o) return send(res, 404, { error: 'No encontrada' });
      ofrendas = ofrendas.filter((x) => x.id !== id);
      save();
      fs.rm(path.join(PHOTOS_DIR, o.file), () => {});
      broadcast('borrada', { id });
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && p.startsWith('/fotos/')) {
      const name = path.basename(p);
      if (!/^[a-z0-9]+\.(jpg|png|webp)$/.test(name)) return send(res, 404, { error: 'No encontrado' });
      return serveFile(res, path.join(PHOTOS_DIR, name), 'public, max-age=31536000, immutable');
    }

    if (req.method === 'GET' && p.startsWith('/vendor/')) {
      return serveFile(res, path.join(PUBLIC_DIR, 'vendor', path.basename(p)), 'public, max-age=86400');
    }

    send(res, 404, { error: 'No encontrado' });
  } catch (err) {
    if (err.message === 'too_big') return send(res, 413, { error: 'La foto es demasiado grande' });
    console.error(err);
    send(res, 500, { error: 'Error del servidor' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log('\n  🌼  Altar de Día de Muertos listo\n');
  console.log(`  Pantalla (TV):     ${lan}/`);
  console.log(`  Subir fotos (QR):  ${uploadUrl()}`);
  console.log(`  Moderar:           ${lan}/admin   PIN: ${PIN}\n`);
});
