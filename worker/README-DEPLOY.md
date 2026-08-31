# Deploying the short-link worker (~10 minutes, free)

The worker turns any scene into a 6-character link (`run.html?p=abc234`) whose QR always fits. Everything runs under YOUR Cloudflare account; the class site only needs its URL.

1. Create a free account at dash.cloudflare.com (no domain or card needed).
2. In the dashboard: **Workers & Pages → Create → Create Worker**. Name it something like `xr-links`. Deploy the hello-world it offers, then click **Edit code**, replace everything with the contents of `worker.js` from this folder, and **Deploy**.
3. Create the storage: **Storage & Databases → KV → Create namespace**, name it `SCENES`.
4. Bind it to the worker: your worker → **Settings → Bindings → Add → KV namespace** — Variable name exactly `SCENES`, select the namespace you just made. Save (it redeploys).
5. Copy the worker's URL (looks like `https://xr-links.YOURNAME.workers.dev`) and put it in the class site's `shortlink-config.js`:
   `window.SHORTLINK_URL = 'https://xr-links.YOURNAME.workers.dev';`
   Commit/push that one file. Done — make.html now offers short links and small QR codes automatically; if the worker is ever unreachable, it falls back to the long self-contained links.

Sanity check: open `https://xr-links.YOURNAME.workers.dev/` in a browser — you should see `{"ok":true,"service":"xr-class scene links"}`.

Notes: links are permanent (no expiry); the same scene always maps to the same id, so re-submitting is harmless; the free tier allows ~1,000 new links and ~100k opens per day — a 50-student class won't get near it. Scene payloads are public-but-unlisted, same trust model as the long links.
