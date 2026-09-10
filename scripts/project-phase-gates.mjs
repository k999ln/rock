// Pure validation/rendering. Filesystem observations are supplied by the caller.
export function validatePhaseGates(tasks, phaseGates, existingEvidence = new Set()) {
  if (phaseGates === undefined) return [];
  if (!Array.isArray(phaseGates)) throw new Error('phaseGatesは配列が必要です。');
  const taskIds = new Set(tasks.map((task) => task.id));
  const gates = new Map();
  for (const gate of phaseGates) {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate) ||
        typeof gate.id !== 'string' || !gate.id.trim())
      throw new Error('段階ゲートIDが不正です。');
    if (gates.has(gate.id)) throw new Error(`${gate.id}: 段階ゲートIDが重複しています。`);
    if (typeof gate.task !== 'string' || !taskIds.has(gate.task))
      throw new Error(`${gate.id}: 対象タスクがありません。`);
    if (!['planned', 'done'].includes(gate.status))
      throw new Error(`${gate.id}: 段階ゲートの状態が不正です。`);
    if (!Array.isArray(gate.dependsOn) || gate.dependsOn.some((id) => typeof id !== 'string' || !id.trim()))
      throw new Error(`${gate.id}: 段階ゲートの依存配列が不正です。`);
    if (new Set(gate.dependsOn).size !== gate.dependsOn.length)
      throw new Error(`${gate.id}: 段階ゲートの依存が重複しています。`);
    if (!Array.isArray(gate.evidence) || gate.evidence.some((file) => typeof file !== 'string' || !file.trim()))
      throw new Error(`${gate.id}: 段階ゲートの根拠配列が不正です。`);
    if (gate.title !== undefined && (typeof gate.title !== 'string' || !gate.title.trim()))
      throw new Error(`${gate.id}: 段階ゲートの題名が不正です。`);
    gates.set(gate.id, gate);
  }
  for (const gate of phaseGates) {
    if (gate.dependsOn.some((id) => !gates.has(id) || id === gate.id))
      throw new Error(`${gate.id}: 段階ゲートの依存先が不正です。依存先はgate IDだけにしてください。`);
    if (gate.status === 'done') {
      if (!gate.evidence.length || gate.dependsOn.some((id) => gates.get(id).status !== 'done'))
        throw new Error(`${gate.id}: 完了には根拠と依存ゲートの完了が必要です。`);
      if (gate.evidence.some((file) => !existingEvidence.has(file)))
        throw new Error(`${gate.id}: 完了ゲートの根拠ファイルがありません。`);
    }
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('段階ゲートの依存関係が循環しています。');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of gates.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of gates.keys()) visit(id);
  return phaseGates;
}

export function phaseGateEvidencePaths(phaseGates) {
  if (!Array.isArray(phaseGates)) return [];
  return [...new Set(phaseGates.flatMap((gate) => Array.isArray(gate?.evidence)
    ? gate.evidence.filter((file) => typeof file === 'string' && file.trim()) : []))];
}

const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

export function renderPhaseGates(phaseGates = []) {
  if (!phaseGates.length) return [];
  return [
    '段階ゲート（作業全体の完了とは別判定）',
    '',
    '| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...phaseGates.map((gate) =>
      `| ${cell(gate.id)} | ${cell(gate.task)} | ${cell(gate.title ?? gate.id)} | ${gate.status === 'done' ? '合格' : '未合格'} | ${gate.dependsOn.map(cell).join(' · ') || '—'} | ${gate.evidence.map((file) => `[記録](${file})`).join(' · ') || '—'} |`),
    '',
  ];
}
