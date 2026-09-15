type ReleaseGate = {
  id: string;
  required: boolean;
  status: string;
};

type ReleaseTarget = {
  id: string;
  label: string;
  declaredStatus: string;
  gates: ReleaseGate[];
};

type ReleaseMatrix = {
  targets: ReleaseTarget[];
};

export function releaseProgress(matrix: ReleaseMatrix, targetId: string) {
  const target = matrix.targets.find(({ id }) => id === targetId);
  if (!target) throw new Error(`Unknown release target: ${targetId}`);
  const required = target.gates.filter((gate) => gate.required);
  const passed = required.filter(({ status }) => status === 'pass').length;
  return {
    id: target.id,
    label: target.label,
    declaredStatus: target.declaredStatus,
    passed,
    required: required.length,
    text: `${passed}/${required.length}`,
    blockedIds: required.filter(({ status }) => status !== 'pass').map(({ id }) => id),
  };
}
