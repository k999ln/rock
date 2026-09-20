import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const requireValue = (ok, message) => {
  if (!ok) throw new Error(`llm architecture: ${message}`);
};

const matrix = JSON.parse(read('data/llm-capabilities.json'));
requireValue(matrix.schemaVersion === 1, 'schemaVersion must be 1');
requireValue(matrix.product.displayName === 'avocadoOS', 'display name drift');
requireValue(matrix.product.internalId === 'dev.rock', 'internal ID drift');

const ids = new Set(matrix.capabilities.map((entry) => entry.id));
requireValue(ids.size === matrix.capabilities.length, 'duplicate capability id');
for (const id of [
  'native-local-planner',
  'sky-openai-legal',
  'sky-openai-patent',
  'sky-jev-evaluator',
  'canonical-long-term-memory',
])
  requireValue(ids.has(id), `missing ${id}`);

for (const entry of matrix.capabilities) {
  requireValue(
    matrix.statusVocabulary.includes(entry.status),
    `${entry.id}: unknown status ${entry.status}`,
  );
  for (const evidence of entry.evidence.filter(
    (value) => !value.startsWith('https://'),
  ))
    requireValue(existsSync(resolve(root, evidence)), `${entry.id}: missing ${evidence}`);
}

const local = matrix.capabilities.find(
  (entry) => entry.id === 'native-local-planner',
);
requireValue(local.role === 'local_planner', 'local model role drift');
requireValue(local.authority === 'plan_only', 'local LLM gained authority');
requireValue(local.network === 'prohibited', 'local LLM network boundary drift');
requireValue(local.automaticFallback === false, 'local fallback must be explicit');

const openAiConnections = matrix.capabilities.filter(
  (entry) => entry.provider === 'OpenAI',
);
requireValue(openAiConnections.length === 2, 'OpenAI connection count must be 2');
requireValue(
  openAiConnections.every((entry) => entry.surface === 'sky_tool'),
  'OpenAI connections must remain scoped to Sky tools',
);

const jev = matrix.capabilities.find((entry) => entry.id === 'sky-jev-evaluator');
requireValue(jev.model === 'typesafe-ai/jev', 'Jev model slug drift');
requireValue(jev.role === 'remote_evaluator', 'Jev must remain an evaluator');
requireValue(jev.surface === 'sky_tool', 'Jev must remain an explicit Sky tool');
requireValue(
  jev.status === 'designed_not_implemented',
  'Jev must not be marked implemented before runtime acceptance',
);
requireValue(jev.authority === 'advisory_only', 'Jev gained execution authority');
requireValue(jev.automaticFallback === false, 'Jev fallback must be explicit');

const ai = await import('ai');
const evaluateExportPresent = 'experimental_evaluate' in ai;
requireValue(
  evaluateExportPresent === matrix.sdk.experimentalEvaluateExportPresent,
  'installed AI SDK export and capability matrix disagree',
);

const routing = read('lib/sky-routing.ts');
const roleCount = (
  routing.slice(routing.indexOf('export const skyRoles')).match(/toolId:/g) || []
).length;
requireValue(roleCount === 10, `Sky routing roles must be 10, found ${roleCount}`);
requireValue(
  read('docs/sky-assistant-and-memory.md').includes('現在は次の10役'),
  'Sky assistant document role count is stale',
);

const architecture = read('docs/llm-evaluation-architecture.md');
for (const marker of [
  '非信頼planner',
  'OpenAI接続はSky',
  'typesafe-ai/jev',
  'advisory-only',
  'AI_GATEWAY_API_KEY',
  'designed_not_implemented',
])
  requireValue(architecture.includes(marker), `architecture missing ${marker}`);

for (const path of ['AGENTS.md', 'README.md', 'docs/prompt-playbook.md'])
  requireValue(
    !read(path).includes('codex/os-game-design-review-20260909'),
    `${path}: missing historical branch is still described as current`,
  );

const baseline = read('docs/product-baseline.md');
requireValue(
  !baseline.includes('端末内LLMは通信がない間も仕事分解、Tool実行'),
  'RQ47 still assigns Tool execution to the LLM',
);

console.log(
  `LLM設計: ${matrix.capabilities.length}能力、OpenAI ${openAiConnections.length}接続、Jev=${jev.status}、AI SDK evaluate export=${evaluateExportPresent}`,
);

