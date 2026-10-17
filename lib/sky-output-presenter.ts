export type SavedAgentDocument = {
  artifacts: Array<{ name?: string; description?: string; textParts: string[] }>;
  omittedNonTextParts: number;
  truncated: boolean;
};

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
