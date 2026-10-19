# Source for the class site

Everything the site serves is built from here. Never edit the built files in the repo root by hand.

    cd src && npm install            # playwright + three (for tests)
    node build.mjs                   # rebuilds ../xr-engine.js ../brief.html ../make.html ../run.html ../student.html ../xr-log.js ../prompt-kit*.md
    node build.mjs --out /tmp/xr-out # build elsewhere (tests)

- `engine/xr-engine.js` — the engine (placement, text, interaction, audit, widgets, domain packs). `__KIT_VERSION__` is stamped from `engine/VERSION`.
- `engine/kit-rules.md` — the rules at the top of the prompt kit. `engine/cheatsheet.html` — the API text (`@@DOMAIN@@` marks where a field pack is inserted). `engine/domains/*.txt` — field packs.
- `engine/*.template.html` — brief / make / run pages. `engine/vendor/qrcode.js` — QR library (MIT), inlined into make.html.
- `engine/default-content.js` — the example block shown in the kit.

Tests
- `node tools/check-scene.mjs <scene.js> [outPrefix] --engine ../xr-engine.js` — boot + audit + fire every select + desktop screenshots.
- `node tools/shortlink-mock.mjs &` then `node tools/site-test.mjs /tmp/xr-out` — full student flow (brief → make → short link → run → logging → export) against a local mock of the worker.

Bump `engine/VERSION` whenever the kit or engine changes, so logged data can be split by version.
