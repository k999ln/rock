#!/usr/bin/env node
/**
 * Noah operator label tools.
 *
 * The normal operator path is family-level:
 *   preflight <intake.json> <preflight.json> <capture-dir>
 *   prepare-families <preflight.json> <work-dir>
 *   run <preflight.json> <state-dir> [--codex|--replies <dir>]
 *   watch <intake.json> <capture-dir> <state-dir> --acquisition-state <rounds.json> [--codex|--replies <dir>]
 *
 * `preflight.json` is a noah-label-export/1 file and can be passed directly to
 * the 200-series human-audit command as its --definitions input. A family is
 * the model/concurrency unit. Raw model replies are never written to the
 * tracked repository; family receipts retain hashes, rows, judgments, and
 * distinct reject codes only.
 *
 * The established per-tool assemble/prepare/verify/save entrypoints remain
 * available unchanged. Their explicit aliases are prepare-tools/verify-tools/
 * save-tools. They are not used by the family-level operator path.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, sha256Hex } from '../lib/noah-connect-requirements.ts';
import {
  buildNoahLabelPrompt,
  labelNoahBatch,
  NOAH_LABEL_RUN_SCHEMA,
  parseNoahLabelBatch,
  parseNoahLabelRun,
  prepareNoahLabelBatch,
  prepareNoahLabelRun,
  splitNoahLabelBatches,
} from '../lib/noah-agent-labels.ts';
import {
  buildNoahFamilyLabelPrompt,
  labelNoahFamily,
  NOAH_LABEL_FAMILY_JOB_SCHEMA,
  NOAH_LABEL_OPERATOR_LIMITS,
  NOAH_LABEL_OPERATOR_REVISION,
} from '../lib/noah-label-operator.ts';
import { readOllamaModelInventory } from '../lib/ollama-model-inventory.ts';
import { generateText } from '../lib/llm-providers.ts';
import { NOAH_MATERIALS } from '../lib/noah-shelf.ts';

const HEX64 = /^[0-9a-f]{64}$/u;
const FAMILY_FILE = /^series-[a-f0-9]{64}\.json$/u;
const REPLY_FILE = /^family-[a-f0-9]{64}\.(?:label|verifier)\.json$/u;

const json = (file) => JSON.parse(readFileSync(resolve(file), 'utf8'));
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
const familyKey = (familyId) => hash(familyId);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function atomicJson(file, value) {
  const destination = resolve(file);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(destination), 0o700); } catch { /* best effort on non-POSIX filesystems */ }
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { chmodSync(temporary, 0o600); } catch { /* best effort */ }
  renameSync(temporary, destination);
  try { chmodSync(destination, 0o600); } catch { /* best effort */ }
}

function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  try { return json(file); } catch { return null; }
}

function currentPopulation(intake) {
  if (intake?.schema !== 'noah-intake-import/1' || !Array.isArray(intake.families) || !Array.isArray(intake.checks)) throw new Error('give a noah-intake-import/1 export');
  const checks = new Map(intake.checks.map((row) => [row.candidate_id, row]));
  const population = new Map();
  for (const family of intake.families) {
    if (family?.listed !== 1 || !Number.isSafeInteger(family.level) || family.level < 1) continue;
    const candidateId = typeof family.representative_id === 'string' ? family.representative_id : '';
    const check = checks.get(candidateId);
    if (candidateId && typeof check?.tools_sha256 === 'string' && HEX64.test(check.tools_sha256) && Number.isSafeInteger(check.tool_count)) population.set(family.id, { candidateId, check });
  }
  return population;
}

/** Read complete captures without making a provider request. */
export function collectNoahLabelCaptures(intake, captureDirectory) {
  const population = currentPopulation(intake);
  const captures = new Map();
  let retryableFiles = 0;
  let conflictingFiles = 0;
  const directory = resolve(captureDirectory);
  let files = [];
  try { files = readdirSync(directory).filter((file) => FAMILY_FILE.test(file)).sort(); } catch (error) {
    if (error?.code === 'ENOENT') return { population, captures, retryableFiles: 0, conflictingFiles: 0 };
    throw error;
  }
  for (const file of files) {
    const value = readJsonIfPresent(join(directory, file));
    if (!value) { retryableFiles++; continue; }
    let capture;
    try { capture = parseNoahLabelBatch(value); } catch { retryableFiles++; continue; }
    for (const item of capture.series) {
      const expected = population.get(item.familyId);
      if (!expected || expected.candidateId !== item.candidateId || expected.check.tools_sha256 !== item.toolsSha256 || expected.check.tool_count !== item.tools.length) continue;
      const previous = captures.get(item.familyId);
      if (previous && canonicalJson(previous) !== canonicalJson(item)) { conflictingFiles++; continue; }
      captures.set(item.familyId, item);
    }
  }
  return { population, captures, retryableFiles, conflictingFiles };
}

/** Build a noah-label-export/1 file reusable by the 200-series human audit. */
export function preflightNoahLabelRun(intake, captureDirectory) {
  const found = collectNoahLabelCaptures(intake, captureDirectory);
  const series = [...found.captures.values()].sort((a, b) => a.familyId.localeCompare(b.familyId));
  const run = series.length ? {
    schema: NOAH_LABEL_RUN_SCHEMA,
    batchId: `noah-preflight-${hash(series.map((item) => `${item.familyId}\u0000${item.toolsSha256}`))}`,
    series,
  } : null;
  return {
    run,
    eligibleSeries: found.population.size,
    capturedSeries: series.length,
    missingSeries: Math.max(0, found.population.size - series.length),
    retryableFiles: found.retryableFiles,
    conflictingFiles: found.conflictingFiles,
  };
}

function writePreflight(outputPath, result) {
  if (!result.run) throw new Error(`No current captured tool definitions for ${result.eligibleSeries} eligible series.`);
  atomicJson(outputPath, result.run);
  console.log(JSON.stringify({ step: 'preflight', output: resolve(outputPath), eligibleSeries: result.eligibleSeries, capturedSeries: result.capturedSeries, missingSeries: result.missingSeries, retryableFiles: result.retryableFiles, conflictingFiles: result.conflictingFiles }));
}

async function familyManifestFor(run, family) {
  return prepareNoahLabelBatch({ schema: 'noah-label-batch/1', batchId: run.batchId, series: [family] });
}

/** Write one redacted prompt artifact per family; no per-tool prompt is made. */
export async function prepareNoahFamilyWork(runValue, workDirectory) {
  const run = parseNoahLabelRun(runValue);
  const prepared = await prepareNoahLabelRun(run);
  const output = resolve(workDirectory);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  atomicJson(join(output, 'manifest.json'), prepared.manifest);
  for (const family of prepared.series) {
    const prompt = buildNoahFamilyLabelPrompt(family);
    const single = await familyManifestFor(run, family);
    atomicJson(join(output, `family-${familyKey(family.familyId)}.json`), {
      schema: NOAH_LABEL_FAMILY_JOB_SCHEMA,
      familyId: family.familyId,
      candidateId: family.candidateId,
      toolsSha256: family.toolsSha256,
      manifestSha256: single.manifest.manifestSha256,
      promptSha256: await sha256Hex(prompt),
      prompt,
    });
  }
  return { families: prepared.series.length, tools: prepared.manifest.toolCount, manifestSha256: prepared.manifest.manifestSha256 };
}

function receiptDirectory(stateDirectory, familyId) {
  return join(resolve(stateDirectory), 'families', familyKey(familyId));
}

function existingReceipt(stateDirectory, family, manifestSha256, retryRejected) {
  const directory = receiptDirectory(stateDirectory, family.familyId);
  let files = [];
  try { files = readdirSync(directory).filter((file) => file.endsWith('.receipt.json')).sort(); } catch { return null; }
  for (const file of files.reverse()) {
    const value = readJsonIfPresent(join(directory, file));
    if (!value || value.schema !== 'noah-label-family-receipt/1' || value.generation?.familyId !== family.familyId || value.generation?.candidateId !== family.candidateId || value.generation?.toolsSha256 !== family.toolsSha256 || value.generation?.manifestSha256 !== manifestSha256) continue;
    if (value.status === 'ready' || (!retryRejected && value.status !== 'blocked' && value.generation.operatorRevision === NOAH_LABEL_OPERATOR_REVISION)) return value;
  }
  return null;
}

/** Save generation metadata and the receipt as two atomic local artifacts. */
export function saveNoahFamilyReceipt(stateDirectory, receipt) {
  const directory = receiptDirectory(stateDirectory, receipt.generation.familyId);
  atomicJson(join(directory, `${receipt.generation.generationId}.generation.json`), receipt.generation);
  atomicJson(join(directory, `${receipt.generation.generationId}.receipt.json`), receipt);
  return directory;
}

async function boundedFamilies(series, workerCount, work) {
  const results = [];
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= series.length) return;
      results[index] = await work(series[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workerCount, series.length) }, () => worker()));
  return results;
}

/** Process each family once, resuming only matching generations. */
export async function runNoahLabelOperator(runValue, stateDirectory, options = {}) {
  const run = parseNoahLabelRun(runValue);
  const concurrency = Math.min(options.concurrency ?? NOAH_LABEL_OPERATOR_LIMITS.concurrentFamilies, NOAH_LABEL_OPERATOR_LIMITS.concurrentFamilies);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('operator_concurrency_invalid');
  const retryRejected = options.retryRejected === true;
  const series = [...run.series].sort((a, b) => a.familyId.localeCompare(b.familyId));
  const outcomes = await boundedFamilies(series, concurrency, async (family) => {
    const prepared = await familyManifestFor(run, family);
    const existing = existingReceipt(stateDirectory, family, prepared.manifest.manifestSha256, retryRejected);
    if (existing) return { familyId: family.familyId, status: 'skipped', receipt: existing };
    const receipt = await labelNoahFamily(family, options.models ?? {}, { now: options.now });
    saveNoahFamilyReceipt(stateDirectory, receipt);
    return { familyId: family.familyId, status: 'saved', receipt };
  });
  const saved = outcomes.filter((item) => item.status === 'saved').length;
  const skipped = outcomes.length - saved;
  const accepted = outcomes.reduce((sum, item) => sum + (item.receipt.acceptedTools ?? 0), 0);
  const rejected = outcomes.reduce((sum, item) => sum + (item.receipt.rejectedTools ?? 0), 0);
  const rejectCounts = {};
  for (const outcome of outcomes) for (const [code, count] of Object.entries(outcome.receipt.rejectCounts ?? {})) rejectCounts[code] = (rejectCounts[code] ?? 0) + count;
  return { schema: 'noah-label-operator-run/1', families: outcomes.length, saved, skipped, accepted, rejected, rejectCounts: Object.fromEntries(Object.entries(rejectCounts).sort(([a], [b]) => a.localeCompare(b))), outcomes };
}

function safeCodexEnvironment() {
  return Object.fromEntries(['PATH', 'HOME', 'CODEX_HOME', 'TMPDIR', 'LANG'].filter((key) => typeof process.env[key] === 'string').map((key) => [key, process.env[key]]));
}

function runCodexProcess(args, options, prompt) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn('codex', args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'ignore', 'ignore'] });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* process may already be gone */ }
      rejectProcess(new Error('codex_timeout'));
    }, options.timeoutMs);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectProcess(error); else resolveProcess();
    };
    child.once('error', () => finish(new Error('codex_spawn_failed')));
    child.once('close', (code) => finish(code === 0 ? null : new Error('codex_failed')));
    child.stdin.once('error', () => finish(new Error('codex_input_failed')));
    child.stdin.end(prompt);
  });
}

const CARD_PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    schema: { type: 'string', const: 'noah-card/1' },
    consumes: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: Object.keys(NOAH_MATERIALS) } },
    produces: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string', enum: Object.keys(NOAH_MATERIALS) } },
  },
  required: ['schema', 'consumes', 'produces'],
};
const LABEL_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { schema: { type: 'string', const: 'noah-label-family-reply/1' }, tools: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { toolName: { type: 'string' }, proposal: CARD_PROPOSAL_SCHEMA }, required: ['toolName', 'proposal'] } } },
  required: ['schema', 'tools'],
};
const VERIFIER_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { schema: { type: 'string', const: 'noah-label-verifier-reply/1' }, judgments: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { toolName: { type: 'string' }, input: { type: 'boolean' }, output: { type: 'boolean' }, noInventedWords: { type: 'boolean' } }, required: ['toolName', 'input', 'output', 'noInventedWords'] } } },
  required: ['schema', 'judgments'],
};

function codexModel(model, outputSchema, reasoningEffort) {
  return async (prompt) => {
    const scratch = join(tmpdir(), `noah-label-codex-${process.pid}-${randomUUID()}`);
    mkdirSync(scratch, { recursive: true, mode: 0o700 });
    const schemaPath = join(scratch, 'output-schema.json');
    const outputPath = join(scratch, 'last-message.json');
    atomicJson(schemaPath, outputSchema);
    try {
      await runCodexProcess([
        '-a', 'never', 'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
        '--disable', 'apps', '--disable', 'shell_tool', '--disable', 'multi_agent', '--disable', 'skill_mcp_dependency_install',
        '-c', 'plugins={}',
        '-c', 'mcp_servers={canva={url="https://disabled.invalid/mcp",enabled=false},notion={url="https://disabled.invalid/mcp",enabled=false},stripe={url="https://disabled.invalid/mcp",enabled=false},cua_repl={url="https://disabled.invalid/mcp",enabled=false},mercari={url="https://disabled.invalid/mcp",enabled=false},node_repl={url="https://disabled.invalid/mcp",enabled=false},vercel={url="https://disabled.invalid/mcp",enabled=false},whatsapp_local={url="https://disabled.invalid/mcp",enabled=false}}',
        '-c', 'web_search="disabled"', '-c', `model_reasoning_effort="${reasoningEffort}"`, '-s', 'read-only', '--model', model,
        '--output-schema', schemaPath, '--output-last-message', outputPath, '-C', scratch, '-',
      ], { cwd: scratch, env: safeCodexEnvironment(), timeoutMs: 120_000 }, prompt);
      const reply = readFileSync(outputPath, 'utf8').trim();
      if (!reply) throw new Error('codex_empty_reply');
      return reply;
    } catch {
      throw new Error('codex_model_unavailable');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  };
}

/** Optional sanctioned backends. Codex checks local login state first. */
export async function createNoahLabelModels(options = {}) {
  if (options.codex) {
    try { execFileSync('codex', ['login', 'status'], { env: safeCodexEnvironment(), stdio: 'ignore', timeout: 15_000 }); }
    catch { throw new Error('codex_auth_unavailable'); }
    return {
      label: codexModel(options.labelModel ?? 'gpt-5.6-luna', LABEL_OUTPUT_SCHEMA, 'low'),
      verifier: codexModel(options.verifierModel ?? 'gpt-5.6-sol', VERIFIER_OUTPUT_SCHEMA, 'high'),
    };
  }
  if (options.ollama) {
    const runtime = { SKY_OLLAMA_BASE_URL: options.ollamaBase ?? 'http://127.0.0.1:11434' };
    const inventory = await readOllamaModelInventory(runtime);
    const labelModel = options.labelModel ?? inventory[0]?.name;
    const verifierModel = options.verifierModel ?? inventory[0]?.name;
    if (!labelModel || !verifierModel || !inventory.some((item) => item.name === labelModel) || !inventory.some((item) => item.name === verifierModel)) throw new Error('local_model_unavailable');
    const textModel = (model) => async (prompt) => (await generateText({ provider: 'ollama', model, prompt, maxOutputTokens: 2_048, jsonOutput: true, disableThinking: true, ollamaLocalTimeoutMs: 40_000 }, runtime)).text;
    return { label: textModel(labelModel), verifier: textModel(verifierModel) };
  }
  return null;
}

function replyModels(directory) {
  const root = resolve(directory);
  const model = (suffix) => async (_prompt, context) => {
    if (!context?.familyId) throw new Error('operator_reply_family_missing');
    const expected = `family-${familyKey(context.familyId)}${suffix}.json`;
    if (!REPLY_FILE.test(expected) || !existsSync(join(root, expected))) throw new Error('operator_reply_missing');
    return readFileSync(join(root, expected), 'utf8');
  };
  return { label: model('.label'), verifier: model('.verifier') };
}

async function runCommand(runPath, stateDirectory, flags) {
  const run = json(runPath);
  let models = null;
  let blocker = null;
  try {
    if (flags.replies) models = replyModels(flags.replies);
    else models = await createNoahLabelModels({ codex: flags.codex, ollama: flags.ollama, labelModel: flags.labelModel, verifierModel: flags.verifierModel, ollamaBase: flags.ollamaBase });
  } catch { blocker = 'label_model_unavailable'; }
  const result = await runNoahLabelOperator(run, stateDirectory, { models, concurrency: flags.codex ? 4 : undefined, retryRejected: flags.retryRejected });
  const receipts = result.outcomes.map(({ receipt }) => receipt);
  const readyFamilies = receipts.filter(({ status }) => status === 'ready').length;
  const labeledFamilies = receipts.filter(({ acceptedTools }) => acceptedTools > 0).length;
  const verifierRejectedFamilies = receipts.filter(({ rejectCounts }) => rejectCounts.verifier_insufficient_judgments > 0).length;
  const blockedFamilies = receipts.filter(({ status }) => status === 'blocked').length;
  console.log(JSON.stringify({ schema: result.schema, families: result.families, saved: result.saved, skipped: result.skipped, readyFamilies, labeledFamilies, verifierRejectedFamilies, blockedFamilies, accepted: result.accepted, rejected: result.rejected, rejectCounts: result.rejectCounts, ...(blocker || !models ? { blocker: blocker ?? 'label_model_unavailable' } : {}) }));
  return result;
}

async function watchCommand(intakePath, captureDirectory, stateDirectory, flags) {
  if (!flags.acquisitionState) throw new Error('watch_requires_completed_acquisition_rounds');
  const statePath = join(stateDirectory, 'acquisition-progress.json');
  const previous = readJsonIfPresent(statePath);
  const seen = new Set(previous?.seen ?? []);
  let lastRound = previous?.lastRound ?? 0;
  let dryRounds = previous?.dryRounds ?? 0;
  let newPasses = previous?.newPasses ?? 0;
  let previousSignature = null;
  const save = () => atomicJson(statePath, { lastRound, dryRounds, newPasses, seen: [...seen].sort((a, b) => a.localeCompare(b)) });
  for (;;) {
    const acquisition = readJsonIfPresent(flags.acquisitionState);
    const round = acquisition?.schema === 'noah-label-acquisition/1' ? acquisition.completedRounds : 0;
    const stat = existsSync(intakePath) ? statSync(intakePath) : null;
    const signature = stat ? `${stat.ino}:${stat.mtimeMs}:${stat.size}` : null;
    if (stat && (signature !== previousSignature || round > lastRound)) {
      const preflight = preflightNoahLabelRun(json(intakePath), captureDirectory);
      previousSignature = signature;
      let blocked = false;
      if (preflight.run) {
        const path = resolve(stateDirectory, 'preflight.json');
        atomicJson(path, preflight.run);
        const result = await runCommand(path, stateDirectory, flags);
        for (const { receipt } of result.outcomes) {
          blocked ||= receipt.status === 'blocked';
          if (receipt.status !== 'ready' || seen.has(receipt.generation.generationId)) continue;
          seen.add(receipt.generation.generationId);
          newPasses++;
        }
      }
      if (Number.isSafeInteger(round) && round > lastRound) {
        dryRounds = !blocked && !newPasses && round === lastRound + 1 ? dryRounds + 1 : 0;
        lastRound = round;
        newPasses = 0;
      }
      save();
    }
    if (dryRounds >= NOAH_LABEL_OPERATOR_LIMITS.maxReacquireDryRounds) {
      console.log(JSON.stringify({ step: 'reacquire_stop', reason: 'two_dry_rounds', dryRounds, completedRounds: lastRound }));
      return;
    }
    await sleep(flags.intervalMs);
  }
}

// Legacy per-tool commands remain offline and are not used by `prepare`.
async function legacyPrepare(runPath, workDirectory) {
  const run = await prepareNoahLabelRun(json(runPath));
  const batches = splitNoahLabelBatches(run);
  atomicJson(join(workDirectory, 'manifest.json'), run.manifest);
  for (const [index, batch] of batches.entries()) atomicJson(join(workDirectory, `batch-${index + 1}.json`), { manifestSha256: run.manifest.manifestSha256, requests: batch.work.map((work) => ({ requestId: work.requestId, prompt: buildNoahLabelPrompt(work) })) });
  console.log(JSON.stringify({ series: run.manifest.seriesCount, tools: run.manifest.toolCount, batches: batches.length, manifestSha256: run.manifest.manifestSha256 }));
}

async function legacyVerifyOrSave(action, runPath, destination, batchNumber, repliesPath) {
  const run = await prepareNoahLabelRun(json(runPath));
  const batches = splitNoahLabelBatches(run);
  const index = Number(batchNumber) - 1;
  const batch = batches[index];
  if (!Number.isSafeInteger(index) || !batch || !repliesPath) throw new Error('give a valid batch number and a replies JSONL file');
  const ids = new Set(batch.work.map((work) => work.requestId));
  const replies = new Map();
  for (const line of readFileSync(repliesPath, 'utf8').split(/\r?\n/u).filter((item) => item.trim())) {
    const row = JSON.parse(line);
    if (!row || Object.keys(row).length !== 3 || row.manifestSha256 !== run.manifest.manifestSha256 || !ids.has(row.requestId) || typeof row.reply !== 'string') throw new Error('reply must contain matching manifestSha256, requestId and raw reply string');
    if (replies.has(row.requestId) && replies.get(row.requestId) !== row.reply) throw new Error('conflicting replies for one request');
    replies.set(row.requestId, row.reply);
  }
  const pending = ids.size - replies.size;
  const result = await labelNoahBatch({ ...batch, work: batch.work.filter((item) => replies.has(item.requestId)) }, async (item) => replies.get(item.requestId));
  if (action === 'verify-tools') atomicJson(destination, { ...result, batchNumber: index + 1, pending });
  else {
    if (pending) throw new Error(`Save requires complete batch; ${pending} replies are missing.`);
    if (!/\.(?:sqlite|sqlite3)$/u.test(destination) || !statSync(destination).isFile()) throw new Error('give an existing local intake SQLite file');
    const db = new DatabaseSync(destination);
    try {
      db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
      const current = db.prepare(`SELECT 1 FROM noah_intake_families f JOIN noah_intake_checks k ON k.candidate_id=f.representative_id WHERE f.id=? AND f.representative_id=? AND f.listed=1 AND k.level>=1 AND k.tools_sha256=? AND k.tool_count=?`);
      if (batch.series.some((item) => !current.get(item.familyId, item.candidateId, item.toolsSha256, item.tools.length))) throw new Error('A series has changed since capture; use a fresh intake export and manifest.');
      db.exec(readFileSync(new URL('../docs/noah/drafts/0059_noah_intake_tool_labels.sql', import.meta.url), 'utf8'));
      const upsert = db.prepare(`INSERT INTO noah_intake_tool_labels (schema,request_id,manifest_sha256,family_id,candidate_id,tools_sha256,tool_definition_sha256,tool_name,label_version,verifier_version,status,consumes_json,produces,inputs_json,outputs_json,evidence_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(family_id,candidate_id,tool_name,tools_sha256,tool_definition_sha256,manifest_sha256,label_version,verifier_version) DO UPDATE SET request_id=excluded.request_id,status=excluded.status,consumes_json=excluded.consumes_json,produces=excluded.produces,inputs_json=excluded.inputs_json,outputs_json=excluded.outputs_json,evidence_json=excluded.evidence_json,reason=excluded.reason`);
      for (const row of result.rows) upsert.run(row.schema, row.requestId, row.manifestSha256, row.familyId, row.candidateId, row.toolsSha256, row.toolDefinitionSha256, row.toolName, row.labelVersion, row.verifierVersion, row.status, row.consumes && JSON.stringify(row.consumes), row.produces, JSON.stringify(row.inputs), JSON.stringify(row.outputs), JSON.stringify(row.evidence), row.reason, row.createdAt);
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch { /* transaction may not have opened */ } throw error; }
    finally { db.close(); }
  }
  const accepted = result.rows.filter((row) => row.status === 'accepted');
  console.log(JSON.stringify({ batchNumber: index + 1, accepted: accepted.length, rejected: result.failed.length, pending }));
}

function flagValue(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

async function main(argv = process.argv.slice(2)) {
  const [action, first, second, third, fourth] = argv;
  if (action === 'preflight' || action === 'assemble') return writePreflight(second, preflightNoahLabelRun(json(first), third));
  if (action === 'prepare-families') {
    const result = await prepareNoahFamilyWork(json(first), second);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === 'prepare' || action === 'prepare-tools') return legacyPrepare(first, second);
  if (action === 'verify' || action === 'verify-tools') return legacyVerifyOrSave('verify-tools', first, second, third, fourth);
  if (action === 'save' || action === 'save-tools') return legacyVerifyOrSave('save-tools', first, second, third, fourth);
  if (action === 'run') return runCommand(first, second, { codex: argv.includes('--codex'), ollama: argv.includes('--ollama'), replies: flagValue(argv, '--replies'), labelModel: flagValue(argv, '--label-model'), verifierModel: flagValue(argv, '--verifier-model'), ollamaBase: flagValue(argv, '--ollama-base'), retryRejected: argv.includes('--retry-rejected') });
  if (action === 'watch') return watchCommand(first, second, third, { codex: argv.includes('--codex'), ollama: argv.includes('--ollama'), replies: flagValue(argv, '--replies'), labelModel: flagValue(argv, '--label-model'), verifierModel: flagValue(argv, '--verifier-model'), ollamaBase: flagValue(argv, '--ollama-base'), retryRejected: argv.includes('--retry-rejected'), acquisitionState: flagValue(argv, '--acquisition-state'), intervalMs: Math.max(250, Math.min(60_000, Number(flagValue(argv, '--interval-ms', '5000')) || 5000)) });
  throw new Error('usage: preflight <intake.json> <preflight.json> <capture-dir> | prepare-families <preflight.json> <work-dir> | run <preflight.json> <state-dir> [--codex|--ollama|--replies DIR] | watch <intake.json> <capture-dir> <state-dir> [--codex|--ollama|--replies DIR] | assemble|prepare|verify|save ...');
}

export { main };

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) main().catch(() => { console.error('noah_label_operator_failed'); process.exitCode = 1; });
