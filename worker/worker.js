// XR class — scene short-link + study-log worker (Cloudflare Workers + KV).
//   POST /            body = compressed base64url scene payload (the part after #c= in a long link) → { "id": "abc234" }
//                     add ?pid=CODE to also log the creation for the study
//   GET  /:id         → the payload, text/plain
//   POST /log         body = JSON { pid, event, data } → logged with a server timestamp (only when pid is present)
//   GET  /export?key=EXPORT_KEY → all log events as JSON lines (set EXPORT_KEY as a secret variable on the worker)
// Storage: a KV namespace bound as SCENES. No TTL — links and logs persist.
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0/O/1/l/i — QR-friendly, unambiguous when read aloud
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const PID = /^[A-Za-z0-9_-]{2,32}$/;

async function logEvent(env, pid, event, data){
  if (!PID.test(pid || '') || typeof event !== 'string' || event.length > 32) return false;
  const t = Date.now(); const key = `log:${pid}:${String(t).padStart(14, '0')}:${Math.random().toString(36).slice(2, 7)}`;
  const body = JSON.stringify({ pid, event, t, data: data ?? null });
  if (body.length > 60000) return false;
  await env.SCENES.put(key, body);
  return true;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (req.method === 'POST' && path === 'log') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const ok = await logEvent(env, b.pid, b.event, b.data);
      return json({ ok });
    }

    if (req.method === 'POST') {
      const body = (await req.text()).trim();
      if (!/^[A-Za-z0-9_-]{16,120000}$/.test(body)) return json({ error: 'not a scene payload' }, 400);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
      for (let len = 6; len <= 12; len += 2) {
        let id = ''; for (let i = 0; i < len; i++) id += ALPHA[digest[i] % ALPHA.length];
        const existing = await env.SCENES.get(id);
        if (existing === null || existing === body) {
          if (existing === null) await env.SCENES.put(id, body);
          const pid = url.searchParams.get('pid'); if (pid) await logEvent(env, pid, 'link', { id, bytes: body.length, kit: url.searchParams.get('kit') || null });
          return json({ id });
        }
      }
      return json({ error: 'id space exhausted' }, 500);
    }

    if (req.method === 'GET' && path === 'export') {
      if (!env.EXPORT_KEY || url.searchParams.get('key') !== env.EXPORT_KEY) return json({ error: 'forbidden' }, 403);
      const lines = []; let cursor;
      do { const page = await env.SCENES.list({ prefix: 'log:', cursor, limit: 1000 }); for (const k of page.keys){ const v = await env.SCENES.get(k.name); if (v) lines.push(v); } cursor = page.list_complete ? undefined : page.cursor; } while (cursor);
      return new Response(lines.join('\n') + '\n', { headers: { ...CORS, 'content-type': 'application/x-ndjson', 'content-disposition': 'attachment; filename="xr-class-log.ndjson"' } });
    }

    if (req.method === 'GET') {
      if (path === '') return json({ ok: true, service: 'xr-class scene links' });
      if (!/^[a-z2-9]{6,12}$/.test(path)) return json({ error: 'bad id' }, 404);
      const v = await env.SCENES.get(path);
      if (v === null) return json({ error: 'no such scene' }, 404);
      return new Response(v, { headers: { ...CORS, 'content-type': 'text/plain', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
