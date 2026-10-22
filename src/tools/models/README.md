# Model library

`models/` (site root) holds real-world-size GLBs made by `process.mjs` from the list in `spec.mjs`.
Sources (all redistributable): Kenney (CC0, via pmndrs/market-assets), KayKit packs (CC0, GitHub), NASA 3D Resources (NASA media guidelines).
Each model: scaled to real size ('h' height or 'l' longest side in metres), origin at the bottom centre, lit materials, WebP textures ≤1024 px, meshopt-compressed.
`models/catalog.json` lists id → category, size [w,h,d] m, source, KB. The build embeds the sizes in the engine and lists the names in the prompt kit.

Rebuild: clone the source repos into ../raw (see spec.mjs paths), `npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer sharp`, `node process.mjs`.
