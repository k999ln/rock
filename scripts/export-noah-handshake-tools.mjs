#!/usr/bin/env node
// Inputs are an already-public intake manifest and the committed handshake captures.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { noahHandshakeTool } from '../lib/noah-handshake-tools.ts';

const [manifestPath, captureRoot, outputPath] = process.argv.slice(2);
if (!manifestPath || !captureRoot || !outputPath) {
  throw new Error('Usage: node scripts/export-noah-handshake-tools.mjs <public-intake.json> <capture-directory> <output.json>');
}
const listed = new Set(JSON.parse(await readFile(manifestPath, 'utf8')).map(({ id }) => id));
const sources = new Map();
for (const filename of (await readdir(captureRoot)).filter((name) => name.endsWith('.json')).sort()) {
  const capture = JSON.parse(await readFile(join(captureRoot, filename), 'utf8'));
  if (capture.schema !== 'noah-label-batch/1' || capture.series?.length !== 1) continue;
  const { familyId, candidateId, toolsSha256, tools } = capture.series[0];
  if (!listed.has(familyId)) continue;
  if (sources.has(familyId)) throw new Error(`Duplicate public capture: ${familyId}`);
  if (!candidateId || !/^[a-f0-9]{64}$/u.test(toolsSha256) || !Array.isArray(tools) || !tools.length) {
    throw new Error(`Invalid public capture: ${familyId}`);
  }
  const view = tools.map(noahHandshakeTool);
  if (view.some(({ name }) => !name) || new Set(view.map(({ name }) => name)).size !== view.length) {
    throw new Error(`Invalid display names: ${familyId}`);
  }
  sources.set(familyId, { candidateId, toolsSha256, tools: view });
}
const entries = [...sources].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
await writeFile(outputPath, '{\n' + entries.map(([id, series]) => `  ${JSON.stringify(id)}: ${JSON.stringify(series)}`).join(',\n') + '\n}\n');
console.log(JSON.stringify({ listed: listed.size, captured: entries.length, tools: entries.reduce((total, [, { tools }]) => total + tools.length, 0) }));
