export type SavedAgentDocument = {
  artifacts: Array<{ name?: string; description?: string; textParts: string[] }>;
  omittedNonTextParts: number;
  truncated: boolean;
};

export function isSavedAgentDocument(value: unknown): value is SavedAgentDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<SavedAgentDocument>;
  if (!Array.isArray(document.artifacts) || document.artifacts.length > 64 ||
    !Number.isSafeInteger(document.omittedNonTextParts) ||
    document.omittedNonTextParts! < 0 || document.omittedNonTextParts! > 10_000 ||
    typeof document.truncated !== 'boolean') return false;
  let textLength = 0;
  return document.artifacts.every((artifact) => {
    if (!artifact || typeof artifact !== 'object' ||
      (artifact.name !== undefined && (typeof artifact.name !== 'string' || artifact.name.length > 200)) ||
      (artifact.description !== undefined && (typeof artifact.description !== 'string' || artifact.description.length > 1_000)) ||
      !Array.isArray(artifact.textParts) || artifact.textParts.length > 64) return false;
    return artifact.textParts.every((part) => {
      if (typeof part !== 'string') return false;
      textLength += part.length;
      return part.length <= 100_000 && textLength <= 200_000;
    });
  });
}

export function agentOutputText(document: SavedAgentDocument): string {
  return document.artifacts.map((artifact) => [
    artifact.name?.trim(),
    artifact.description?.trim(),
    ...artifact.textParts,
  ].filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n---\n\n');
}

export function agentOutputExportable(document: SavedAgentDocument): boolean {
  return !document.truncated && document.omittedNonTextParts === 0 &&
    document.artifacts.some((artifact) => artifact.textParts.some((part) => part.trim()));
}
