#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { buildMessages, draftJsonSchema, validateDraft, validatePacket } from './news-core.mjs';

const packetPath = process.argv[2];
if (!packetPath) {
  process.stderr.write('Usage: node toolkits/eve-news/draft.mjs <source-packet.json>\n');
  process.exit(2);
}

try {
  const packet = validatePacket(JSON.parse(await readFile(packetPath, 'utf8')));
  const model = process.env.EVE_NEWS_MODEL || 'qwen3:4b';
  const tagsResponse = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) });
  if (!tagsResponse.ok) throw new Error(`local model inventory failed: HTTP ${tagsResponse.status}`);
  const tags = await tagsResponse.json();
  const installed = tags.models?.find((item) => item.name === model);
  if (!installed?.digest) throw new Error(`model is not installed locally: ${model}`);
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: buildMessages(packet), format: draftJsonSchema(packet), stream: false, think: false, options: { temperature: 0, num_predict: 900 } }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`local inference failed: HTTP ${response.status}`);
  const body = await response.json();
  const afterResponse = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) });
  if (!afterResponse.ok || (await afterResponse.json()).models?.find((item) => item.name === model)?.digest !== installed.digest) throw new Error('local model alias changed or could not be rechecked after inference');
  const draft = validateDraft(packet, JSON.parse(body.message?.content || ''), `${model}@${installed.digest}`);
  process.stdout.write(`${JSON.stringify(process.argv.includes('--bundle') ? { packet, draft, modelLabel: draft.modelProfileIdAndHash } : draft, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Eve News draft failed: ${error.message}\n`);
  process.exitCode = 1;
}
