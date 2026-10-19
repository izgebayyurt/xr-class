// Local stand-in for worker/worker.js (scene short links + study log). Same routes, in-memory store.
//   node tools/shortlink-mock.mjs            → http://localhost:8127   (EXPORT_KEY = "testkey")
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const EXPORT_KEY = process.env.EXPORT_KEY || 'testkey';
const PID = /^[A-Za-z0-9_-]{2,32}$/;
const store = new Map(); const log = [];
const logEvent = (pid, event, data) => {
  if (!PID.test(pid || '') || typeof event !== 'string' || event.length > 32) return false;
  log.push({ pid, event, t: Date.now(), data: data ?? null }); return true;
};
const read = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS'){ res.end(); return; }
  const url = new URL(req.url, 'http://x'); const path = url.pathname.replace(/^\/+/, '');
  const json = (o, s = 200) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (req.method === 'POST' && path === 'log'){
    let b; try { b = JSON.parse(await read(req)); } catch { return json({ error: 'bad json' }, 400); }
    return json({ ok: logEvent(b.pid, b.event, b.data) });
  }
  if (req.method === 'POST'){
    const body = (await read(req)).trim();
    if (!/^[A-Za-z0-9_-]{16,120000}$/.test(body)) return json({ error: 'bad' }, 400);
    const h = createHash('sha256').update(body).digest();
    let id = ''; for (let i = 0; i < 6; i++) id += ALPHA[h[i] % ALPHA.length];
    store.set(id, body);
    const pid = url.searchParams.get('pid'); if (pid) logEvent(pid, 'link', { id, bytes: body.length, kit: url.searchParams.get('kit') || null });
    return json({ id });
  }
  if (path === 'export'){
    if (url.searchParams.get('key') !== EXPORT_KEY) return json({ error: 'forbidden' }, 403);
    res.setHeader('content-type', 'application/x-ndjson'); res.end(log.map(e => JSON.stringify(e)).join('\n') + '\n'); return;
  }
  if (path === '') return json({ ok: true, service: 'mock' });
  if (store.has(path)){ res.setHeader('content-type', 'text/plain'); res.end(store.get(path)); }
  else json({ error: 'no' }, 404);
}).listen(8127, () => console.log('mock shortlink+log on 8127'));
