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

export type SkyResultSection = { title: string; lines: string[] };
/** Text is preserved verbatim. Missing fields are missing records, never invented facts. */
export function skyAppSections(request: import('./sky-app-contract.ts').SkyAppRequest,
  result: import('./sky-app-contract.ts').SkyAppResult): SkyResultSection[] {
  if (request.appId !== 'zoom') return [{ title: '作業の準備', lines: [result.body] }];
  const sections: SkyResultSection[] = [];
  if (result.notes?.summary) sections.push({ title: '概要', lines: [result.notes.summary] });
  for (const [key, title] of [['decisions', '決まったこと'], ['owners', '担当']] as const) {
    if (result.notes?.[key] !== undefined) sections.push({ title, lines: result.notes[key]!.length ? result.notes[key]! : ['読み取った内容には記載がありません。'] });
  }
  const undecided = request.input.split(/\r?\n/u).flatMap((row) => {
    const match = row.trim().match(/^([^「」"<>:：]{1,32}?)は(?:まだ)?(?:未定|未決定)(?:です)?[。.]?$/u);
    return match ? [`${match[1]}はまだ決まっていません。`] : [];
  });
  if (undecided.length) sections.push({ title: 'まだ決まっていないこと', lines: undecided });
  return sections;
}
