/** Explicit local packaging, after the existing pinned installer. No camera, model download or upload. */
import { readFile, lstat, mkdir, mkdtemp, copyFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root,'systems/rock-star-os/targets/avocado-mini/gesture');
const destination = join(root,'public/mii-input-runtime');
try { await lstat(destination); throw Error('mii_input_runtime_already_exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const manifest = JSON.parse(await readFile(join(source,'runtime/model.json'),'utf8'));
const model = await readFile(join(source,'runtime/models/hand_landmarker.task'));
if (model.length > manifest.maxBytes || createHash('sha256').update(model).digest('hex') !== manifest.sha256) throw Error('model_digest_mismatch');
const pkg = JSON.parse(await readFile(join(source,'runtime/node_modules/@mediapipe/tasks-vision/package.json'),'utf8'));
if (pkg.version !== manifest.runtimeVersion) throw Error('runtime_version_mismatch');
const files = ['tracking-worker.js','runtime/models/hand_landmarker.task',
  'runtime/node_modules/@mediapipe/tasks-vision/vision_bundle.js',
  ...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm']
    .map(name => 'runtime/node_modules/@mediapipe/tasks-vision/wasm/' + name)];
const temp = await mkdtemp(join(root,'public/.mii-input-'));
try {
  for (const name of files) { const input = join(source,name); if (!(await lstat(input)).isFile()) throw Error('non_regular_asset');
    const target = join(temp,name); await mkdir(join(target,'..'),{recursive:true}); await copyFile(input,target); }
  await rename(temp,destination);
  console.log('Prepared local mii hand input assets. Camera remains off. Not a physical acceptance.');
} finally { await rm(temp,{recursive:true,force:true}); }
