/**
 * Private, offline handoff format for task-127 label preparation.
 *
 * The intake database intentionally stores only a tools hash and counts.  A
 * local patrol may opt in to writing the complete definitions to a private
 * per-series artifact after a representative handshake commits.  This module
 * keeps that artifact directly compatible with the offline label pipeline,
 * while making it impossible for the capture payload to acquire transport,
 * session, user, or credential fields.
 */
import { canonicalJson } from './noah-connect-requirements.ts';
import type { NoahToolDef } from './noah-mouth-mcp-remote.ts';

export const NOAH_LABEL_CAPTURE_SCHEMA = 'noah-label-batch/1' as const;
export const NOAH_LABEL_CAPTURE_BATCH_ID = 'noah-local-capture/1' as const;
/** One provider response is capped at 1 MiB; leave room for JSON framing. */
export const NOAH_LABEL_CAPTURE_MAX_BYTES = 4 * 1024 * 1024;

export type NoahLabelCaptureTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
};

export type NoahLabelCaptureSeries = {
  familyId: string;
  candidateId: string;
  toolsSha256: string;
  tools: readonly NoahLabelCaptureTool[];
};

/** The exact envelope accepted by lib/noah-agent-labels.ts. */
export type NoahLabelCaptureBatch = {
  schema: typeof NOAH_LABEL_CAPTURE_SCHEMA;
  batchId: typeof NOAH_LABEL_CAPTURE_BATCH_ID;
  series: readonly [NoahLabelCaptureSeries];
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const HEX64 = /^[a-f0-9]{64}$/u;
const CONTROL = /\p{Cc}/u;

function assertJson(value: unknown, name: string): void {
  try {
    const seen = new Set<object>();
    const visit = (item: unknown): void => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') throw new Error('non-json');
      if (!item || typeof item !== 'object') return;
      if (seen.has(item)) throw new Error('cyclic');
      seen.add(item);
      if (Array.isArray(item)) item.forEach(visit);
      else Object.values(item).forEach(visit);
      seen.delete(item);
    };
    visit(value);
    const encoded = canonicalJson(value);
    JSON.parse(encoded);
  } catch {
    throw new Error(`${name} is not JSON`);
  }
}

function captureTool(tool: NoahToolDef): NoahLabelCaptureTool {
  if (!tool || typeof tool.name !== 'string' || !tool.name || tool.name.length > 256 || CONTROL.test(tool.name)) throw new Error('tool.name is invalid');
  if (typeof tool.description !== 'string' || tool.description.length > 8_000 || CONTROL.test(tool.description)) throw new Error('tool.description is invalid');
  assertJson(tool.inputSchema, 'tool.inputSchema');
  if (tool.outputSchema !== undefined) assertJson(tool.outputSchema, 'tool.outputSchema');
  // `readOnly` is an intake decision, not label evidence.  Deliberately keep
  // it out so this artifact can be passed to the strict label-batch parser.
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
  };
}

/**
 * Build one directly consumable label-batch file from a committed handshake.
 * No URL, host, session id, headers, auth result, or owner data is accepted.
 */
export function noahLabelCaptureBatch(input: {
  familyId: string;
  candidateId: string;
  toolsSha256: string;
  tools: readonly NoahToolDef[];
}, maxBytes = NOAH_LABEL_CAPTURE_MAX_BYTES): NoahLabelCaptureBatch {
  if (typeof input.familyId !== 'string' || !input.familyId || input.familyId.length > 400 || CONTROL.test(input.familyId)) throw new Error('familyId is invalid');
  if (typeof input.candidateId !== 'string' || !input.candidateId || input.candidateId.length > 300 || CONTROL.test(input.candidateId)) throw new Error('candidateId is invalid');
  if (typeof input.toolsSha256 !== 'string' || !HEX64.test(input.toolsSha256)) throw new Error('toolsSha256 is invalid');
  if (!Array.isArray(input.tools) || input.tools.length < 1 || input.tools.length > 500) throw new Error('tools is invalid');
  const tools = input.tools.map(captureTool);
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new Error('tools has duplicate names');
  const batch: NoahLabelCaptureBatch = {
    schema: NOAH_LABEL_CAPTURE_SCHEMA,
    batchId: NOAH_LABEL_CAPTURE_BATCH_ID,
    series: [{ familyId: input.familyId, candidateId: input.candidateId, toolsSha256: input.toolsSha256, tools }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(batch)).byteLength;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes > maxBytes) throw new Error(`label capture exceeds ${maxBytes} bytes`);
  return batch;
}

/** Stable JSON bytes for atomic local writes and resumable comparisons. */
export function noahLabelCaptureJson(batch: NoahLabelCaptureBatch): string {
  return `${JSON.stringify(batch)}\n`;
}

/** A cheap check used by the local writer before replacing an existing file. */
export function isNoahLabelCaptureBatch(value: unknown, expected: Pick<NoahLabelCaptureSeries, 'familyId' | 'candidateId' | 'toolsSha256'>): value is NoahLabelCaptureBatch {
  if (!object(value) || value.schema !== NOAH_LABEL_CAPTURE_SCHEMA || value.batchId !== NOAH_LABEL_CAPTURE_BATCH_ID || !Array.isArray(value.series) || value.series.length !== 1) return false;
  const series = value.series[0];
  return object(series) && series.familyId === expected.familyId && series.candidateId === expected.candidateId && series.toolsSha256 === expected.toolsSha256;
}
