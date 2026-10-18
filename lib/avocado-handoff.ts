export type AvocadoHandoffTarget = {
  kind: 'month' | 'amc';
  targetId: string;
  token: string;
  brief: string;
};

export function parseAvocadoBrief(value: unknown): AvocadoHandoffTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type !== 'avocado.sky.brief.v1' ||
    typeof message.token !== 'string' || !/^[a-f0-9-]{36}$/i.test(message.token) ||
    typeof message.brief !== 'string' || !message.brief.trim() || message.brief.length > 2000) return null;
  const monthId = typeof message.monthId === 'string' && /^y[1-4]m(?:[1-9]|1[0-2])$/.test(message.monthId) ? message.monthId : '';
  const taskId = typeof message.taskId === 'string' && /^m(?:[1-9]|1[0-2])t[1-6]$/.test(message.taskId) ? message.taskId : '';
  if (Boolean(monthId) === Boolean(taskId)) return null;
  return { kind: taskId ? 'amc' : 'month', targetId: taskId || monthId, token: message.token, brief: message.brief };
}

export function avocadoResultEnvelope(target: Pick<AvocadoHandoffTarget, 'kind' | 'targetId' | 'token'>, summary: string) {
  return {
    type: 'avocado.sky.result.v1',
    token: target.token,
    ...(target.kind === 'amc' ? { taskId: target.targetId } : { monthId: target.targetId }),
    summary: summary.trim().slice(0, 1800),
  };
}
