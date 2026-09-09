# Deploying the short-link + study-log worker (~10 minutes, free)

The worker turns any scene into a 6-character link (`run.html?p=abc234`) whose QR always fits, and — for students who enter a study code on brief.html — records what they did. Everything runs under YOUR Cloudflare account; the class site only needs its URL.

1. Create a free account at dash.cloudflare.com (no domain or card needed).
2. In the dashboard: **Workers & Pages → Create → Create Worker**. Name it something like `xr-links`. Deploy the hello-world it offers, then click **Edit code**, replace everything with the contents of `worker.js` from this folder, and **Deploy**.
3. Create the storage: **Storage & Databases → KV → Create namespace**, name it `SCENES`.
4. Bind it to the worker: your worker → **Settings → Bindings → Add → KV namespace** — Variable name exactly `SCENES`, select the namespace you just made. Save (it redeploys).
5. Set the export password: your worker → **Settings → Variables and Secrets → Add** — Type **Secret**, name exactly `EXPORT_KEY`, value = a long random string you keep (a password-manager-generated one is ideal). Save. Without it, `/export` refuses everyone.
6. Copy the worker's URL (looks like `https://xr-links.YOURNAME.workers.dev`) and put it in the class site's `shortlink-config.js`:
   `window.SHORTLINK_URL = 'https://xr-links.YOURNAME.workers.dev';`
   Commit/push that one file. Done — make.html now offers short links and small QR codes automatically; if the worker is ever unreachable, it falls back to the long self-contained links.

Sanity check: open `https://xr-links.YOURNAME.workers.dev/` in a browser — you should see `{"ok":true,"service":"xr-class scene links"}`.

## Getting the study data out

Open `https://xr-links.YOURNAME.workers.dev/export?key=YOUR_EXPORT_KEY` in a browser (or `curl -o xr-class-log.ndjson '…/export?key=…'`). You get one JSON object per line:

```
{"pid":"K7Q2","event":"brief","t":1757400000000,"data":{"tier":"2","field":"Geography","packs":["phys"],"brief":"A. The idea …","kit":"2026-09-09.1","page":"brief.html"}}
{"pid":"K7Q2","event":"link","t":…,"data":{"id":"gfpper","bytes":994,"kit":"2026-09-09.1"}}
{"pid":"K7Q2","event":"open","t":…,"data":{"scene":"p:gfpper","bytes":1404,"lines":22,"kit":"…","page":"run.html"}}
{"pid":"K7Q2","event":"scene-check","t":…,"data":{"errors":0,"warnings":1,"objects":18,"flags":[],…}}
{"pid":"K7Q2","event":"chip-open","t":…,"data":{"errors":0,"warnings":1,…}}
{"pid":"K7Q2","event":"report","t":…,"data":{"errors":0,"warnings":1,"text":"…the audit report they copied for Claude…",…}}
```

`pid` is the study code the student typed, `t` is the server time in ms, `kit` is the prompt-kit/engine version they were using (so scenes made with different kit versions can be separated). Events per participant, in order, give the whole trajectory: brief → link(s) → open(s) → scene checks → whether they looked at the warnings → whether they copied the report back to Claude. Iterations show up as several `link` events with different ids; `run.html?p=<id>` reopens any of them.

Keep `EXPORT_KEY` private — anyone with it can download the log. The class site never sees it.

## What gets recorded, and what doesn't

Nothing is sent unless the student types a study code on brief.html (it is remembered in that browser's localStorage until cleared). No names, emails, IPs or device identifiers are stored by the worker — only the code, the event, the time and the fields shown above. The brief text itself is stored (first 6,000 characters) because it is the input to the experiment; tell participants that in the consent form. The scene code is stored only as the public-but-unlisted short-link payload, exactly as it would be without the study.

Notes: links are permanent (no expiry); the same scene always maps to the same id, so re-submitting is harmless; the free tier allows ~1,000 KV writes and ~100k reads per day — a 50-student class producing a few hundred events won't get near it. Log entries are KV keys prefixed `log:`; you can browse them in the dashboard too (KV → SCENES → View).
