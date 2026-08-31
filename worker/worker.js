// XR class — scene short-link worker (Cloudflare Workers + KV).
// POST /  body = the compressed base64url scene payload (the part after #c= in a long link)
//         → { "id": "abc234" }   (same scene always gets the same id — ids are content-hashes)
// GET /:id → the payload, text/plain.
// Storage: a KV namespace bound as SCENES (see README-DEPLOY.md). No TTL — links persist.
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0/O/1/l/i — QR-friendly, unambiguous when read aloud
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (req.method === 'POST') {
      const body = (await req.text()).trim();
      // payload must look like base64url and stay a sane size (~90 KB ≈ a 4,000-line scene)
      if (!/^[A-Za-z0-9_-]{16,120000}$/.test(body)) return json({ error: 'not a scene payload' }, 400);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
      for (let len = 6; len <= 12; len += 2) {           // content-hash id; extend on the (astronomically rare) collision
        let id = '';
        for (let i = 0; i < len; i++) id += ALPHA[digest[i] % ALPHA.length];
        const existing = await env.SCENES.get(id);
        if (existing === null) { await env.SCENES.put(id, body); return json({ id }); }
        if (existing === body) return json({ id });      // same scene: same link, no duplicate stored
      }
      return json({ error: 'id space exhausted' }, 500);
    }

    if (req.method === 'GET') {
      const id = url.pathname.replace(/^\/+/, '');
      if (id === '') return json({ ok: true, service: 'xr-class scene links' });
      if (!/^[a-z2-9]{6,12}$/.test(id)) return json({ error: 'bad id' }, 404);
      const v = await env.SCENES.get(id);
      if (v === null) return json({ error: 'no such scene' }, 404);
      return new Response(v, { headers: { ...CORS, 'content-type': 'text/plain', 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
