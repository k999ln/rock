/** Tab-local, short-lived selection. No photo, model instruction or execution grant. */
export const SMIS_OBJECT_HANDOFF_KEY = 'smis.object.handoff.v1';
export type SmisObjectHandoff = { schema: 'smis.object-handoff/1'; owner: string; agentId: string; agentRevision: number; objectName: string; observedAt: number; confirmedAt: number; source: 'browser-camera' | 'mini-camera' };
export function readSmisObjectHandoff(storage: Pick<Storage, 'getItem'>, owner: string, agent: { id: string; revision: number; enabled: boolean; attachment?: { objectName: string } }, now: number): SmisObjectHandoff | null {
  try {
    if (!Number.isSafeInteger(now) || now < 0) return null;
    const raw = storage.getItem(SMIS_OBJECT_HANDOFF_KEY);
    if (!raw || raw.length > 2000) return null;
    const value = JSON.parse(raw) as SmisObjectHandoff;
    if (!value || Object.keys(value).length !== 8 || !['schema','owner','agentId','agentRevision','objectName','observedAt','confirmedAt','source'].every(k => Object.hasOwn(value,k)) || value.schema !== 'smis.object-handoff/1' || value.owner !== owner || value.agentId !== agent.id || value.agentRevision !== agent.revision || !agent.enabled || !agent.attachment || typeof value.objectName !== 'string' || value.objectName.length > 40 || value.objectName !== agent.attachment.objectName ||
        !['browser-camera', 'mini-camera'].includes(value.source) || !Number.isSafeInteger(value.observedAt) || !Number.isSafeInteger(value.confirmedAt) || value.observedAt > value.confirmedAt || value.confirmedAt - value.observedAt > 10_000 || value.confirmedAt > now || now - value.confirmedAt > 120_000) return null;
    return value;
  } catch { return null; }
}
export function smisObjectHandoffPrompt(value: SmisObjectHandoff) {
  return `カメラの見た目の照合候補を本人が確認した対象は「${value.objectName}」です。この担当に何を任せられるか、役割と使える機能の範囲で教えてください。写真の内容や現在の状態、温度・量などを測定した情報は渡していません。外部操作はまだ承認していません。`;
}
