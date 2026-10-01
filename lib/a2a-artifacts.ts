export type StoredA2AArtifactDocument = {
  schemaVersion: 1;
  artifacts: Array<{
    name?: string;
    description?: string;
    textParts: string[];
  }>;
  omittedNonTextParts: number;
  truncated: boolean;
};

const encoder = new TextEncoder();
const maximumBytes = 32_000;
const maximumArtifacts = 16;
const maximumParts = 128;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function removeControls(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127);
    })
    .join('');
}

function cleanLabel(value: unknown, limit: number) {
  if (typeof value !== 'string') return undefined;
  const clean = removeControls(value).trim();
  if (!clean) return undefined;
  let result = clean;
  while (encoder.encode(result).byteLength > limit) result = result.slice(0, -1);
  return result || undefined;
}

function clippedText(value: string, limit: number) {
  let result = removeControls(value);
  while (encoder.encode(result).byteLength > limit) result = result.slice(0, -1);
  return result;
}

export function normalizeA2AArtifacts(value: unknown): StoredA2AArtifactDocument | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const artifacts: StoredA2AArtifactDocument['artifacts'] = [];
  let omittedNonTextParts = 0;
  let truncated = value.length > maximumArtifacts;
  let remainingTextBytes = 24_000;
  let seenParts = 0;

  for (const item of value.slice(0, maximumArtifacts)) {
    if (!object(item)) {
      truncated = true;
      continue;
    }
    const artifact: StoredA2AArtifactDocument['artifacts'][number] = {
      textParts: [],
    };
    const name = cleanLabel(item.name, 120);
    const description = cleanLabel(item.description, 512);
    if (name) artifact.name = name;
    if (description) artifact.description = description;
    if (Array.isArray(item.parts)) {
      for (const part of item.parts) {
        seenParts += 1;
        if (seenParts > maximumParts) {
          truncated = true;
          break;
        }
        if (object(part) && typeof part.text === 'string') {
          if (remainingTextBytes <= 0) {
            truncated = true;
            continue;
          }
          const sanitized = removeControls(part.text);
          const text = clippedText(sanitized, remainingTextBytes);
          if (text.length < sanitized.length) truncated = true;
          if (text) {
            artifact.textParts.push(text);
            remainingTextBytes -= encoder.encode(text).byteLength;
          }
        } else {
          // File bytes, data payloads and URIs are deliberately not fetched or
          // copied into the result store. They require a separately authorized
          // artifact transfer contract.
          omittedNonTextParts += 1;
        }
      }
    }
    artifacts.push(artifact);
  }

  const document: StoredA2AArtifactDocument = {
    schemaVersion: 1,
    artifacts,
    omittedNonTextParts,
    truncated,
  };
  while (encoder.encode(JSON.stringify(document)).byteLength > maximumBytes) {
    const lastArtifact = document.artifacts.at(-1);
    const lastPart = lastArtifact?.textParts.at(-1);
    if (!lastArtifact || lastPart === undefined) {
      document.artifacts.pop();
      document.truncated = true;
      continue;
    }
    lastArtifact.textParts[lastArtifact.textParts.length - 1] = clippedText(
      lastPart,
      Math.max(0, encoder.encode(lastPart).byteLength - 1024),
    );
    if (!lastArtifact.textParts.at(-1)) lastArtifact.textParts.pop();
    document.truncated = true;
  }
  return document.artifacts.length || document.omittedNonTextParts
    ? document
    : null;
}
