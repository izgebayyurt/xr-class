// Normalises the curated models: real-world scale, origin at the bottom centre, lit materials, meshopt-compressed GLB.
//   node process.mjs → ../out/models/<id>.glb + ../out/models/catalog.json
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, reorder, quantize, getBounds, textureCompress, simplify } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SPEC, SOURCES } from './spec.mjs';

const ROOT = '/home/claude/assets', OUT = join(ROOT, 'out/models');
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const catalog = { version: 1, sources: SOURCES, models: {} };
const fails = [];
for (const [id, src, file, category, kind, metres] of SPEC){
  try {
    const doc = await io.read(join(ROOT, file));
    const root = doc.getRoot();
    for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_unlit' || ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();   // lit shading; plain geometry
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const b = getBounds(scene); const size = [0, 1, 2].map(i => b.max[i] - b.min[i]);
    const s = kind === 'h' ? metres / size[1] : metres / Math.max(...size);
    const wrap = doc.createNode(id).setScale([s, s, s]).setTranslation([-(b.min[0] + b.max[0]) / 2 * s, -b.min[1] * s, -(b.min[2] + b.max[2]) / 2 * s]);
    for (const c of scene.listChildren()){ scene.removeChild(c); wrap.addChild(c); }
    scene.addChild(wrap);
    for (const m of root.listMaterials()){ if (m.getMetallicFactor() > 0.5 && !m.getMetallicRoughnessTexture()) m.setMetallicFactor(0.2); }   // avoid black metal with no environment map
    if (src === 'nasa') await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.002 }));   // scientific models are far denser than a headset needs
    await doc.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }), reorder({ encoder: MeshoptEncoder }), quantize());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const outFile = join(OUT, id + '.glb'); await io.write(outFile, doc);
    const nb = getBounds((await io.read(outFile)).getRoot().listScenes()[0]);
    const dims = [0, 1, 2].map(i => +(nb.max[i] - nb.min[i]).toFixed(2));
    catalog.models[id] = { category, size: dims, source: src, kb: Math.round(statSync(outFile).size / 1024) };
    process.stdout.write('.');
  } catch (e) { fails.push(id + ': ' + e.message); process.stdout.write('x'); }
}
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`\n${Object.keys(catalog.models).length} ok, ${fails.length} failed`); fails.forEach(f => console.log('  ' + f));
const tot = Object.values(catalog.models).reduce((a, m) => a + m.kb, 0); console.log('total', tot, 'KB');
console.log(Object.entries(catalog.models).filter(([, m]) => m.kb > 600).map(([k, m]) => k + ' ' + m.kb + 'KB').join(', '));
