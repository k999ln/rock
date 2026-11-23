#!/usr/bin/env node
// Prepare bounded model work and verify saved model replies on an operator machine.
// These commands never contact an Agent, a model, or production storage.
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildNoahLabelPrompt, labelNoahBatch, NOAH_LABEL_RUN_SCHEMA, NOAH_LABEL_UPSERT_SQL, parseNoahLabelBatch, prepareNoahLabelRun, splitNoahLabelBatches,
} from '../lib/noah-agent-labels.ts';

const [action, sourcePath, destPath, batchNumber, repliesPath] = process.argv.slice(2);
if (!['assemble', 'prepare', 'verify', 'save'].includes(action) || !sourcePath || !destPath) {
  throw Error('usage: noah-label-agent-tools.mjs assemble <intake-export.json> <run.json> <capture-directory> | prepare <run.json> <existing-work-directory> | verify <run.json> <rows.json> <batch-number> <replies.jsonl> | save <run.json> <local-intake.sqlite> <batch-number> <replies.jsonl>');
}

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, file);
};
if (action === 'assemble') {
  if (!batchNumber) throw Error('give the local capture directory');
  const intake = json(sourcePath);
  if (intake?.schema !== 'noah-intake-import/1' || !Array.isArray(intake.families) || !Array.isArray(intake.checks)) throw Error('give a noah-intake-import/1 export');
  const checks = new Map(intake.checks.map((row) => [row.candidate_id, row]));
  const population = new Map(intake.families.filter((row) => row.listed === 1 && row.level >= 1).map((row) => [row.id, row.representative_id]));
  const series = [];
  for (const file of readdirSync(batchNumber).sort()) {
    if (!/^series-[a-f0-9]{64}\.json$/u.test(file)) continue;
    const capture = parseNoahLabelBatch(json(join(batchNumber, file)));
    for (const item of capture.series) {
      const check = checks.get(item.candidateId);
      if (population.get(item.familyId) === item.candidateId && check?.tools_sha256 === item.toolsSha256 && check?.tool_count === item.tools.length) series.push(item);
    }
  }
  if (!series.length) throw Error(`No current captured tool definitions for ${population.size} eligible series.`);
  const runInput = { schema: NOAH_LABEL_RUN_SCHEMA, batchId: 'noah-intake-capture', series };
  await prepareNoahLabelRun(runInput);
  write(destPath, runInput);
  console.log(JSON.stringify({ eligibleSeries: population.size, capturedSeries: series.length }));
  process.exit(0);
}

const run = await prepareNoahLabelRun(json(sourcePath));
const batches = splitNoahLabelBatches(run);
if (action === 'prepare') {
  write(join(destPath, 'manifest.json'), run.manifest);
  for (const [index, batch] of batches.entries()) {
    const requests = batch.work.map((work) => ({ requestId: work.requestId, prompt: buildNoahLabelPrompt(work) }));
    write(join(destPath, `batch-${index + 1}.json`), { manifestSha256: run.manifest.manifestSha256, requests });
  }
  console.log(JSON.stringify({ series: run.manifest.seriesCount, tools: run.manifest.toolCount, batches: batches.length, manifestSha256: run.manifest.manifestSha256 }));
} else {
  const index = Number(batchNumber) - 1;
  const batch = batches[index];
  if (!Number.isSafeInteger(index) || !batch || !repliesPath) throw Error('give a valid batch number and a replies JSONL file');
  const ids = new Set(batch.work.map((work) => work.requestId));
  const replies = new Map();
  for (const line of readFileSync(repliesPath, 'utf8').split(/\r?\n/u).filter((line) => line.trim())) {
    const row = JSON.parse(line);
    if (!row || Object.keys(row).length !== 3 || row.manifestSha256 !== run.manifest.manifestSha256 || !ids.has(row.requestId) || typeof row.reply !== 'string') {
      throw Error('reply must contain the matching manifestSha256, requestId and raw reply string');
    }
    if (replies.has(row.requestId) && replies.get(row.requestId) !== row.reply) throw Error('conflicting replies for one request');
    replies.set(row.requestId, row.reply);
  }
  const pending = ids.size - replies.size;
  const result = await labelNoahBatch({ ...batch, work: batch.work.filter((item) => replies.has(item.requestId)) }, async (item) => replies.get(item.requestId));
  if (action === 'verify') write(destPath, { ...result, batchNumber: index + 1, pending });
  else {
    if (pending) throw Error(`Save requires the complete batch. ${pending} replies are missing.`);
    if (!/\.(?:sqlite|sqlite3)$/u.test(destPath) || !statSync(destPath).isFile()) throw Error('give an existing local intake SQLite file');
    const db = new DatabaseSync(destPath);
    try {
      db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
      const current = db.prepare(`SELECT 1 FROM noah_intake_families f JOIN noah_intake_checks k ON k.candidate_id=f.representative_id
        WHERE f.id=? AND f.representative_id=? AND f.listed=1 AND k.level>=1 AND k.tools_sha256=? AND k.tool_count=?`);
      if (batch.series.some((item) => !current.get(item.familyId, item.candidateId, item.toolsSha256, item.tools.length))) {
        throw Error('A series has changed since the capture. Use a fresh intake export and manifest.');
      }
      db.exec(readFileSync(new URL('../docs/noah/drafts/0059_noah_intake_tool_labels.sql', import.meta.url), 'utf8'));
      const upsert = db.prepare(NOAH_LABEL_UPSERT_SQL);
      for (const row of result.rows) upsert.run(row.schema, row.requestId, row.manifestSha256, row.familyId, row.candidateId, row.toolsSha256,
        row.toolDefinitionSha256, row.toolName, row.labelVersion, row.verifierVersion, row.status,
        row.consumes && JSON.stringify(row.consumes), row.produces, JSON.stringify(row.inputs), JSON.stringify(row.outputs), JSON.stringify(row.evidence), row.reason, row.createdAt);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* A failed BEGIN did not open a transaction. */ }
      throw error;
    } finally { db.close(); }
  }
  const accepted = result.rows.filter((row) => row.status === 'accepted');
  const acceptedBySeries = new Map();
  for (const row of accepted) acceptedBySeries.set(row.familyId, (acceptedBySeries.get(row.familyId) ?? 0) + 1);
  const labeledSeries = batch.series.filter((item) => acceptedBySeries.get(item.familyId) === item.tools.length).length;
  console.log(JSON.stringify({ batchNumber: index + 1, labeledSeries, batchSeries: batch.series.length, accepted: accepted.length, rejected: result.failed.length, pending }));
}
