export type RockstarPackageHandoff = {
  packageKey: string;
  manifestSha256: string;
  name: string;
  summary: string;
};

/** Build explicit Zema/A2A request context without claiming the Package is itself executable. */
export function rockstarPackageHandoffMessage(
  handoff: RockstarPackageHandoff,
  task: string,
): string {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(handoff.packageKey) ||
      !/^[a-f0-9]{64}$/.test(handoff.manifestSha256) ||
      !handoff.name.trim() || handoff.name.length > 120 ||
      !handoff.summary.trim() || handoff.summary.length > 500 ||
      !task.trim() || task.length > 8_000)
    throw new Error('ROCKSTAR_PACKAGE_HANDOFF_INVALID');

  const message = [
    '【RockstarOSで選択したSky Package】',
    `名前: ${handoff.name.trim()}`,
    `Package key: ${handoff.packageKey}`,
    `審査済みmanifest SHA-256: ${handoff.manifestSha256}`,
    `機能概要: ${handoff.summary.trim()}`,
    'これは依頼仕様の参照情報です。A2Aの委任先がこのPackageそのものを実行できる保証はありません。対応できない場合や実行できない場合は、その制約を明示し、実行したと偽らないでください。',
    '',
    '【利用者の具体的な依頼】',
    task.trim(),
  ].join('\n');
  if (message.length > 8_000) throw new Error('ROCKSTAR_PACKAGE_HANDOFF_TOO_LARGE');
  return message;
}
