#!/usr/bin/env node
/**
 * Read-only preparation and scoring for task 127's 200-series human audit.
 *
 * This script deliberately does not import the card/label pipeline. It reads a
 * saved Noah intake export (or a small `series` fixture), includes every family
 * row before sampling, and records source evidence IDs for a reviewer. A score
 * is never presented as a 95% result unless the source hash is available,
 * every sampled series has a judgment, and every judgment cites source and
 * output evidence.
 *
 * Prepare:
 *   node scripts/noah-agent-human-audit.mjs prepare \
 *     --corpus work/noah-collector/import.json \
 *     --out work/noah-agent-human-audit/manifest.json
 *
 * Score a reviewer's separate JSON (see docs/noah/agent-human-audit.md):
 *   node scripts/noah-agent-human-audit.mjs score \
 *     --manifest work/noah-agent-human-audit/manifest.json \
 *     --judgments work/noah-agent-human-audit/judgments.json \
 *     --corpus work/noah-collector/import.json \
 *     --out work/noah-agent-human-audit/score.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const NOAH_HUMAN_AUDIT_SCHEMA = 'noah-agent-human-audit/1';
export const NOAH_LABEL_EXPORT_SCHEMA = 'noah-label-export/1';
export const NOAH_HUMAN_AUDIT_SEED = 'noah-task-127-series-audit-v1';
export const NOAH_HUMAN_AUDIT_SIZE = 200;
export const NOAH_HUMAN_AUDIT_MIN_RATIO = 0.95;

const JUDGMENTS = new Set(['match', 'mismatch', 'unclear']);
const HEX64 = /^[0-9a-f]{64}$/u;

const object = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const requiredString = (value, field) => {
  if (typeof value !== 'string' || !value.trim())
    throw Error(`audit_${field}_missing`);
  return value;
};
const optionalString = (value) =>
  typeof value === 'string' && value.length ? value : null;

/** Canonical JSON keeps the selection and source digests independent of key order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function sha256(value) {
  const bytes =
    typeof value === 'string' || value instanceof Uint8Array
      ? value
      : canonicalJson(value);
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonAt(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw Error(`audit_corpus_read_failed:${error.code ?? 'invalid_json'}`);
  }
}

function rowEvidence({
  family,
  familyIndex,
  candidate,
  candidateIndex,
  check,
  checkIndex,
  sourcePath,
}) {
  const evidence = [
    {
      id: `family:${family.id}`,
      kind: 'family',
      path: sourcePath,
      pointer: `/families/${familyIndex}`,
      sha256: sha256(family),
    },
  ];
  if (candidate)
    evidence.push({
      id: `candidate:${candidate.id}`,
      kind: 'candidate',
      path: sourcePath,
      pointer: `/candidates/${candidateIndex}`,
      sha256: sha256(candidate),
    });
  if (check)
    evidence.push({
      id: `check:${check.candidate_id}`,
      kind: 'handshake',
      path: sourcePath,
      pointer: `/checks/${checkIndex}`,
      sha256: sha256(check),
    });
  return evidence;
}

function normalizeImportCorpus(raw, sourcePath) {
  if (
    !Array.isArray(raw.families) ||
    !Array.isArray(raw.candidates) ||
    !Array.isArray(raw.checks)
  )
    throw Error('audit_corpus_arrays_missing');
  const candidates = new Map(),
    candidateIndexes = new Map();
  raw.candidates.forEach((row, index) => {
    if (!object(row)) throw Error('audit_candidate_not_object');
    const id = requiredString(row.id, 'candidate_id');
    if (candidates.has(id)) throw Error(`audit_duplicate_candidate:${id}`);
    candidates.set(id, row);
    candidateIndexes.set(id, index);
  });
  const checks = new Map(),
    checkIndexes = new Map();
  raw.checks.forEach((row, index) => {
    if (!object(row)) throw Error('audit_check_not_object');
    const id = requiredString(row.candidate_id, 'check_candidate_id');
    if (checks.has(id)) throw Error(`audit_duplicate_check:${id}`);
    checks.set(id, row);
    checkIndexes.set(id, index);
  });
  const seen = new Set();
  return raw.families.map((family, familyIndex) => {
    if (!object(family)) throw Error('audit_family_not_object');
    const id = requiredString(family.id, 'family_id');
    if (seen.has(id)) throw Error(`audit_duplicate_family:${id}`);
    seen.add(id);
    const representativeId = requiredString(
      family.representative_id,
      'representative_id',
    );
    const candidate = candidates.get(representativeId);
    if (!candidate) throw Error(`audit_representative_missing:${id}`);
    const check = checks.get(representativeId) ?? null;
    const evidence = rowEvidence({
      family: { ...family, id },
      familyIndex,
      candidate,
      candidateIndex: candidateIndexes.get(representativeId),
      check,
      checkIndex: check ? checkIndexes.get(representativeId) : null,
      sourcePath,
    });
    return {
      id,
      familyId: id,
      representativeId,
      name: optionalString(candidate.name),
      summary: optionalString(candidate.summary),
      summaryJa: optionalString(candidate.summary_ja),
      listed: typeof family.listed === 'number' ? family.listed === 1 : null,
      level: Number.isSafeInteger(family.level) ? family.level : null,
      members: Number.isSafeInteger(family.members) ? family.members : null,
      source: {
        path: sourcePath,
        familyPointer: `/families/${familyIndex}`,
        candidatePointer: `/candidates/${candidateIndexes.get(representativeId)}`,
        checkPointer: check
          ? `/checks/${checkIndexes.get(representativeId)}`
          : null,
      },
      facts: {
        candidateState: optionalString(candidate.state),
        reason: optionalString(candidate.reason),
        recordSha256:
          optionalString(candidate.record_sha256) ??
          sha256(optionalString(candidate.record_json) ?? ''),
        toolsSha256: check ? optionalString(check.tools_sha256) : null,
        toolCount:
          check && Number.isSafeInteger(check.tool_count)
            ? check.tool_count
            : null,
        formTools:
          check && Number.isSafeInteger(check.form_tools)
            ? check.form_tools
            : null,
        oneTapTools:
          check && Number.isSafeInteger(check.one_tap_tools)
            ? check.one_tap_tools
            : null,
      },
      evidence,
      evidenceIds: evidence.map((item) => item.id),
    };
  });
}

/**
 * Read the optional label export without treating it as the population. A
 * definition is usable only when all three version keys match the intake row.
 */
export function normalizeDefinitions(raw, sourcePath = '(memory)') {
  if (
    !object(raw) ||
    raw.schema !== NOAH_LABEL_EXPORT_SCHEMA ||
    !Array.isArray(raw.series)
  )
    throw Error('audit_definitions_schema_invalid');
  const byKey = new Map();
  for (const [index, row] of raw.series.entries()) {
    if (!object(row) || !Array.isArray(row.tools))
      throw Error(`audit_definition_invalid:${index}`);
    const familyId = requiredString(row.familyId, 'definition_family_id');
    const candidateId = requiredString(
      row.candidateId,
      'definition_candidate_id',
    );
    const toolsSha256 = requiredString(
      row.toolsSha256,
      'definition_tools_sha256',
    );
    if (!HEX64.test(toolsSha256))
      throw Error(`audit_definition_tools_sha256_invalid:${index}`);
    const key = `${familyId}\u0000${candidateId}\u0000${toolsSha256}`;
    if (byKey.has(key)) throw Error(`audit_duplicate_definition:${key}`);
    const evidence = {
      id: `definition:${familyId}:${candidateId}:${toolsSha256}`,
      kind: 'tool-definition',
      path: sourcePath,
      pointer: `/series/${index}`,
      sha256: sha256({ familyId, candidateId, toolsSha256, tools: row.tools }),
    };
    byKey.set(key, {
      familyId,
      candidateId,
      toolsSha256,
      tools: row.tools,
      evidence,
    });
  }
  return {
    schema: raw.schema,
    path: sourcePath,
    sha256: sha256(raw),
    total: raw.series.length,
    byKey,
  };
}

function definitionFor(item, definitions) {
  if (!definitions || !item.facts?.toolsSha256) return null;
  return (
    definitions.byKey.get(
      `${item.familyId}\u0000${item.representativeId}\u0000${item.facts.toolsSha256}`,
    ) ?? null
  );
}

function normalizeSeriesCorpus(raw, sourcePath) {
  const rows = Array.isArray(raw) ? raw : (raw.series ?? raw.items);
  if (!Array.isArray(rows)) throw Error('audit_corpus_series_missing');
  const seen = new Set();
  return rows.map((row, index) => {
    if (!object(row)) throw Error('audit_series_not_object');
    const id = requiredString(row.id ?? row.familyId, 'series_id');
    if (seen.has(id)) throw Error(`audit_duplicate_series:${id}`);
    seen.add(id);
    const sourceEvidence = {
      id: `series:${id}`,
      kind: 'series',
      path: sourcePath,
      pointer: `/${Array.isArray(raw) ? index : 'series/' + index}`,
      sha256: sha256(row),
    };
    return {
      id,
      familyId: id,
      representativeId: optionalString(
        row.representativeId ?? row.representative_id,
      ),
      name: optionalString(row.name),
      summary: optionalString(row.summary),
      summaryJa: optionalString(row.summaryJa ?? row.summary_ja),
      listed: typeof row.listed === 'boolean' ? row.listed : null,
      level: Number.isSafeInteger(row.level) ? row.level : null,
      members: Number.isSafeInteger(row.members) ? row.members : null,
      source: {
        path: sourcePath,
        familyPointer: sourceEvidence.pointer,
        candidatePointer: null,
        checkPointer: null,
      },
      facts: object(row.facts) ? row.facts : {},
      evidence: [sourceEvidence],
      evidenceIds: [sourceEvidence.id],
    };
  });
}

/**
 * Normalize an intake export or a minimal `series` fixture without looking at
 * labels, summary_ja, listed state, or any other pipeline output.
 */
export function normalizeAuditCorpus(raw, sourcePath = '(memory)') {
  if (!object(raw) && !Array.isArray(raw))
    throw Error('audit_corpus_not_object');
  if (!Array.isArray(raw) && Array.isArray(raw.families))
    return {
      schema: raw.schema ?? null,
      items: normalizeImportCorpus(raw, sourcePath),
    };
  return {
    schema: Array.isArray(raw) ? null : (raw.schema ?? null),
    items: normalizeSeriesCorpus(raw, sourcePath),
  };
}

function selectionRank(seed, id) {
  return sha256(`${seed}\u0000${id}`);
}

/** Prepare a deterministic sample; no current time or random device is used. */
export function prepareAudit({
  corpus,
  corpusPath = '(memory)',
  definitions,
  definitionsPath = '(memory)',
  seed = NOAH_HUMAN_AUDIT_SEED,
  sampleSize = NOAH_HUMAN_AUDIT_SIZE,
} = {}) {
  if (typeof seed !== 'string' || !seed.trim())
    throw Error('audit_seed_missing');
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1)
    throw Error('audit_sample_size_invalid');
  const sourcePath = corpusPath;
  const raw =
    corpus ??
    (typeof corpusPath === 'string' && corpusPath !== '(memory)'
      ? jsonAt(corpusPath)
      : null);
  if (!raw) throw Error('audit_corpus_missing');
  const normalized = normalizeAuditCorpus(raw, sourcePath);
  if (normalized.items.length < sampleSize)
    throw Error(
      `audit_population_too_small:${normalized.items.length}<${sampleSize}`,
    );
  const definitionsRaw =
    definitions ??
    (typeof definitionsPath === 'string' && definitionsPath !== '(memory)'
      ? jsonAt(definitionsPath)
      : null);
  const definitionsIndex = definitionsRaw
    ? normalizeDefinitions(definitionsRaw, definitionsPath)
    : null;
  const withDefinitions = normalized.items.map((item) => {
    const definition = definitionFor(item, definitionsIndex);
    if (!definition) return item;
    return {
      ...item,
      definition: {
        familyId: definition.familyId,
        candidateId: definition.candidateId,
        toolsSha256: definition.toolsSha256,
        tools: definition.tools,
        evidence: definition.evidence,
      },
      definitionEvidenceIds: [definition.evidence.id],
      evidence: [...item.evidence, definition.evidence],
      evidenceIds: [...item.evidenceIds, definition.evidence.id],
    };
  });
  const sourceSha256 = sha256(raw);
  const ranked = withDefinitions
    .map((item) => ({ ...item, selectionRank: selectionRank(seed, item.id) }))
    .sort(
      (a, b) =>
        a.selectionRank.localeCompare(b.selectionRank) ||
        a.id.localeCompare(b.id),
    );
  const sample = ranked.slice(0, sampleSize).map((item, index) => ({
    auditId: `audit:${seed}:${item.id}`,
    sampleIndex: index + 1,
    familyId: item.familyId,
    representativeId: item.representativeId,
    name: item.name,
    summary: item.summary,
    summaryJa: item.summaryJa,
    listed: item.listed,
    level: item.level,
    members: item.members,
    facts: item.facts,
    definition: item.definition ?? null,
    definitionEvidenceIds: item.definitionEvidenceIds ?? [],
    source: item.source,
    evidence: item.evidence,
    evidenceIds: item.evidenceIds,
    selectionRank: item.selectionRank,
  }));
  const selectedIds = sample.map((item) => item.familyId);
  return {
    schema: NOAH_HUMAN_AUDIT_SCHEMA,
    kind: 'manifest',
    seed,
    sampleSize,
    threshold: Math.ceil(sampleSize * NOAH_HUMAN_AUDIT_MIN_RATIO),
    source: {
      path: sourcePath,
      schema: normalized.schema,
      sha256: sourceSha256,
    },
    definitions: definitionsIndex
      ? {
          status: 'provided',
          path: definitionsIndex.path,
          schema: definitionsIndex.schema,
          sha256: definitionsIndex.sha256,
          total: definitionsIndex.total,
        }
      : { status: 'absent', path: null, schema: null, sha256: null, total: 0 },
    population: {
      total: normalized.items.length,
      included: normalized.items.length,
      excluded: 0,
      includesUnlabeled: true,
      selection: 'all source series/families before deterministic hash ranking',
      idsSha256: sha256(normalized.items.map((item) => item.id)),
    },
    selection: {
      seed,
      size: sampleSize,
      ids: selectedIds,
      idsSha256: sha256(selectedIds),
    },
    items: sample,
  };
}

function readManifest(value) {
  if (
    !object(value) ||
    value.schema !== NOAH_HUMAN_AUDIT_SCHEMA ||
    value.kind !== 'manifest'
  )
    throw Error('audit_manifest_schema_invalid');
  if (!Array.isArray(value.items) || value.items.length !== value.sampleSize)
    throw Error('audit_manifest_items_invalid');
  if (
    !Number.isSafeInteger(value.sampleSize) ||
    value.sampleSize < 1 ||
    !Number.isSafeInteger(value.threshold)
  )
    throw Error('audit_manifest_size_invalid');
  if (!object(value.source) || !HEX64.test(String(value.source.sha256)))
    throw Error('audit_manifest_source_invalid');
  const byId = new Map();
  for (const item of value.items) {
    const id = requiredString(item.auditId, 'audit_id');
    if (byId.has(id)) throw Error(`audit_manifest_duplicate:${id}`);
    if (!Array.isArray(item.evidenceIds) || !item.evidenceIds.length)
      throw Error(`audit_manifest_evidence_missing:${id}`);
    if (!Array.isArray(item.definitionEvidenceIds ?? []))
      throw Error(`audit_manifest_definition_evidence_invalid:${id}`);
    if (
      (item.definitionEvidenceIds ?? []).some(
        (evidenceId) => !item.evidenceIds.includes(evidenceId),
      )
    )
      throw Error(`audit_manifest_definition_evidence_unbound:${id}`);
    byId.set(id, item);
  }
  return { value, byId };
}

function readJudgments(value) {
  const rows = Array.isArray(value) ? value : value?.judgments;
  if (!Array.isArray(rows)) throw Error('audit_judgments_missing');
  return rows;
}

/** Score only recorded human judgments; incomplete or unverified work cannot claim 95%. */
export function scoreAudit({
  manifest,
  judgments,
  sourceVerified = false,
  sourceStatus = sourceVerified ? 'verified' : 'unverified',
  definitionsStatus = manifest?.definitions?.status === 'provided'
    ? 'unverified'
    : 'absent',
} = {}) {
  const checked = readManifest(manifest),
    rows = readJudgments(judgments),
    invalid = [],
    seen = new Set(),
    counts = { match: 0, mismatch: 0, unclear: 0 };
  for (const row of rows) {
    if (!object(row)) {
      invalid.push('judgment_not_object');
      continue;
    }
    const id = typeof row.auditId === 'string' ? row.auditId : '';
    if (!id || !checked.byId.has(id)) {
      invalid.push(`judgment_unknown:${id || '(missing)'}`);
      continue;
    }
    if (seen.has(id)) {
      invalid.push(`judgment_duplicate:${id}`);
      continue;
    }
    seen.add(id);
    if (!JUDGMENTS.has(row.judgment)) {
      invalid.push(`judgment_value:${id}`);
      continue;
    }
    const sourceEvidenceIds = row.sourceEvidenceIds,
      outputEvidenceIds = row.outputEvidenceIds,
      definitionEvidenceIds = row.definitionEvidenceIds;
    const expected = new Set(checked.byId.get(id).evidenceIds);
    if (
      !Array.isArray(sourceEvidenceIds) ||
      !sourceEvidenceIds.length ||
      sourceEvidenceIds.some((e) => typeof e !== 'string' || !expected.has(e))
    )
      invalid.push(`source_evidence:${id}`);
    if (
      !Array.isArray(outputEvidenceIds) ||
      !outputEvidenceIds.length ||
      outputEvidenceIds.some((e) => typeof e !== 'string' || !e.trim())
    )
      invalid.push(`output_evidence:${id}`);
    const expectedDefinitions =
      checked.byId.get(id).definitionEvidenceIds ?? [];
    if (!expectedDefinitions.length && row.judgment !== 'mismatch')
      invalid.push(`missing_definition_not_mismatch:${id}`);
    if (
      !Array.isArray(definitionEvidenceIds) ||
      definitionEvidenceIds.some(
        (e) => typeof e !== 'string' || !expectedDefinitions.includes(e),
      )
    )
      invalid.push(`definition_evidence:${id}`);
    if (
      row.judgment === 'match' &&
      (!expectedDefinitions.length ||
        !definitionEvidenceIds?.length ||
        definitionEvidenceIds.some((e) => !sourceEvidenceIds?.includes(e)))
    )
      invalid.push(`match_without_definition:${id}`);
    if (
      typeof row.note !== 'undefined' &&
      (typeof row.note !== 'string' || row.note.length > 2_000)
    )
      invalid.push(`judgment_note:${id}`);
    counts[row.judgment]++;
  }
  const total = checked.value.sampleSize,
    judged = seen.size,
    unreviewed = total - judged,
    complete = judged === total && invalid.length === 0,
    reviewed = counts.match + counts.mismatch;
  const everySampleHasDefinition = checked.value.items.every(
    (item) =>
      Array.isArray(item.definitionEvidenceIds) &&
      item.definitionEvidenceIds.length > 0,
  );
  const threshold = checked.value.threshold,
    claimEligible =
      complete &&
      sourceStatus === 'verified' &&
      definitionsStatus === 'verified' &&
      everySampleHasDefinition &&
      reviewed === total;
  const claim = claimEligible
    ? counts.match >= threshold
      ? 'pass_95_percent'
      : 'fail_below_95_percent'
    : 'not_claimed';
  return {
    schema: NOAH_HUMAN_AUDIT_SCHEMA,
    kind: 'score',
    seed: checked.value.seed,
    sampleSize: total,
    threshold,
    populationTotal: checked.value.population?.total ?? null,
    source: {
      path: checked.value.source.path,
      sha256: checked.value.source.sha256,
      status: sourceStatus,
    },
    definitions: {
      path: checked.value.definitions?.path ?? null,
      sha256: checked.value.definitions?.sha256 ?? null,
      status: definitionsStatus,
    },
    counts: {
      ...counts,
      judged,
      reviewed,
      unreviewed,
      invalid: invalid.length,
    },
    matchRateAmongSample: total ? counts.match / total : 0,
    matchRateAmongReviewed: reviewed ? counts.match / reviewed : null,
    complete,
    claimEligible,
    claim,
    invalid,
  };
}

function writeJson(path, value) {
  if (!path) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sourceStatus(manifest, overridePath) {
  const path = overridePath ?? manifest.source?.path;
  if (!path || path === '(memory)') return 'unavailable';
  try {
    return sha256(JSON.parse(readFileSync(resolve(path), 'utf8'))) ===
      manifest.source.sha256
      ? 'verified'
      : 'mismatch';
  } catch {
    return 'unavailable';
  }
}

function definitionsStatus(manifest, overridePath) {
  if (manifest.definitions?.status !== 'provided') return 'absent';
  const path = overridePath ?? manifest.definitions?.path;
  if (!path || path === '(memory)') return 'unavailable';
  try {
    const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
    return raw.schema === NOAH_LABEL_EXPORT_SCHEMA &&
      sha256(raw) === manifest.definitions.sha256
      ? 'verified'
      : 'mismatch';
  } catch {
    return 'unavailable';
  }
}

export function auditArguments(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      corpus: { type: 'string' },
      definitions: { type: 'string' },
      out: { type: 'string' },
      manifest: { type: 'string' },
      judgments: { type: 'string' },
      seed: { type: 'string' },
      size: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const command = positionals[0] ?? 'help';
  if (!['prepare', 'score', 'help'].includes(command))
    throw Error('audit_command_invalid');
  return {
    command,
    corpus: values.corpus,
    definitions: values.definitions,
    out: values.out,
    manifest: values.manifest,
    judgments: values.judgments,
    seed: values.seed ?? NOAH_HUMAN_AUDIT_SEED,
    size:
      values.size === undefined ? NOAH_HUMAN_AUDIT_SIZE : Number(values.size),
    help: !!values.help,
  };
}

async function main(args = process.argv.slice(2)) {
  const options = auditArguments(args);
  if (options.help || options.command === 'help') {
    console.log(
      'Noah task 127 human audit: prepare --corpus <import.json> [--definitions label-export.json] [--size 200] [--seed fixed] [--out manifest.json] | score --manifest <manifest.json> --judgments <judgments.json> [--corpus import.json] [--definitions label-export.json] [--out score.json]',
    );
    return 0;
  }
  if (options.command === 'prepare') {
    if (!options.corpus) throw Error('audit_corpus_required');
    writeJson(
      options.out,
      prepareAudit({
        corpusPath: options.corpus,
        definitionsPath: options.definitions ?? '(memory)',
        seed: options.seed,
        sampleSize: options.size,
      }),
    );
    return 0;
  }
  if (!options.manifest || !options.judgments)
    throw Error('audit_manifest_and_judgments_required');
  const manifest = jsonAt(options.manifest),
    judgments = jsonAt(options.judgments),
    status = sourceStatus(manifest, options.corpus),
    definitionStatus = definitionsStatus(manifest, options.definitions);
  const report = scoreAudit({
    manifest,
    judgments,
    sourceStatus: status,
    definitionsStatus: definitionStatus,
  });
  writeJson(options.out, report);
  return report.claim === 'pass_95_percent' ? 0 : 2;
}

if (process.argv[1]?.endsWith('noah-agent-human-audit.mjs'))
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        error.message.startsWith('audit_') ? error.message : 'audit_failed',
      );
      process.exitCode = 1;
    });
