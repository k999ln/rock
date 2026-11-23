// Opt-in, local-only sink for the task-127 label input.  Nothing in this file
// talks to a provider or to D1; createIntakeProbe calls the returned writer
// only after a representative handshake has committed.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  isNoahLabelCaptureBatch,
  noahLabelCaptureBatch,
  noahLabelCaptureJson,
  NOAH_LABEL_CAPTURE_MAX_BYTES,
} from '../lib/noah-intake-capture.ts';

const SECRET_VALUE = /(?:^|[^A-Za-z0-9])(?:sk-|ghp_|gho_|github_pat_|xox[abp]-|AKIA|hf_|AIza|eyJ)[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._-]{12,}/iu;
const SENSITIVE_VALUE_KEY = /^(?:authorization|cookie|credential|password|secret|token|api[-_]?key|access[-_]?token|session(?:[-_]?id)?)$/iu;
const CONTROL = /\p{Cc}/gu;

function scrub(value, key = '') {
  if (typeof value === 'string') {
    const clean = value.replace(CONTROL, ' ');
    return SECRET_VALUE.test(clean) || (SENSITIVE_VALUE_KEY.test(key) && clean.length > 0) ? '[redacted]' : clean;
  }
  if (Array.isArray(value)) return value.map((item) => scrub(item, key));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, scrub(item, name)]));
}

/** Remove credential-like values without dropping schema property names. */
export function redactNoahCaptureTool(tool) {
  return {
    name: scrub(tool.name),
    description: scrub(tool.description),
    inputSchema: scrub(tool.inputSchema),
    ...(tool.outputSchema === undefined ? {} : { outputSchema: scrub(tool.outputSchema) }),
  };
}

function familyFileName(familyId) {
  return `series-${createHash('sha256').update(familyId, 'utf8').digest('hex')}.json`;
}

/**
 * Return a resumable writer.  One file is kept per family; a later handshake
 * with a new tools hash atomically replaces that family's old snapshot.  The
 * filename is content-addressed so provider IDs never become path segments.
 */
export function createNoahLocalCaptureWriter(directory, options = {}) {
  const root = resolve(directory);
  const maxBytes = options.maxBytes ?? NOAH_LABEL_CAPTURE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('capture maxBytes is invalid');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try { chmodSync(root, 0o700); } catch { /* platform may not expose chmod */ }

  return async function writeCapture(input) {
    const batch = noahLabelCaptureBatch({
      familyId: input.familyId,
      candidateId: input.candidateId,
      toolsSha256: input.toolsSha256,
      tools: input.tools.map(redactNoahCaptureTool),
    }, maxBytes);
    const json = noahLabelCaptureJson(batch);
    if (Buffer.byteLength(json, 'utf8') > maxBytes) throw new Error(`label capture exceeds ${maxBytes} bytes`);
    const path = join(root, familyFileName(input.familyId));
    if (existsSync(path)) {
      try {
        const previous = JSON.parse(readFileSync(path, 'utf8'));
        if (isNoahLabelCaptureBatch(previous, input) && noahLabelCaptureJson(previous) === json) return { path, status: 'resumed' };
      } catch { /* replace a partial/invalid local artifact atomically */ }
    }
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporary, json, { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(temporary, 0o600); } catch { /* platform may not expose chmod */ }
    renameSync(temporary, path);
    try { chmodSync(path, 0o600); } catch { /* platform may not expose chmod */ }
    return { path, status: 'written' };
  };
}
