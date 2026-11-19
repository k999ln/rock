/** One removable input module. No execution, ownership proof, or actuator grant. */
export const SMIS_MODULE_MAX_AGE = 10_000;
export type SmisMotion = { x: number; y: number; z: number };
export type SmisModuleSnapshot = {
  schema: 'smis.module-observation/1'; owner: string; scope: string;
  objectId: string; objectName: string; moduleId: string; mountEpoch: number;
  receivedAt: number; sequence: number; motion: SmisMotion;
  source: 'microbit-ble'; method: 'module-accelerometer-raw';
  attachmentConfirmedBy: 'owner'; automaticDetachDetection: false;
};
const label = (s: string) => typeof s === 'string' && s.trim().length > 0 && s.length <= 40 && !Array.from(s).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
export function decodeMicrobitMotion(value: DataView): SmisMotion {
  if (!(value instanceof DataView) || value.byteLength !== 6) throw Error('部品の動きの情報を読み取れません。対応するプログラムを確認してください。');
  return { x: value.getInt16(0, true), y: value.getInt16(2, true), z: value.getInt16(4, true) };
}
export function createSmisModuleSession(options: { owner: string; now?: () => number; nonce?: () => string }) {
  if (typeof options.owner !== 'string' || !options.owner || options.owner.length > 256) throw Error('自分のアカウントを確認してください。');
  const now = options.now ?? Date.now, nonce = options.nonce ?? (() => crypto.randomUUID());
  let moduleId = '', connection = '', epoch = 0, objectId = '', objectName = '', checked = false;
  let sequence = 0, receivedAt = -1, motion: SmisMotion | null = null, reference: SmisMotion | null = null, changed = false;
  function fresh() { const t = now(); return !!connection && !!motion && Number.isSafeInteger(t) && receivedAt <= t && t - receivedAt < SMIS_MODULE_MAX_AGE; }
  function unbind() { epoch++; objectId = ''; objectName = ''; checked = false; reference = null; changed = false; }
  function disconnect() { unbind(); connection = ''; motion = null; receivedAt = -1; }
  function rejectObservation(message: string): never { disconnect(); throw Error(message); }
  function scope() { return JSON.stringify([options.owner, connection, moduleId, objectId, epoch]); }
  return {
    connect(id: string) {
      if (typeof id !== 'string' || !id || id.length > 512) throw Error('選んだ部品を確認してください。');
      unbind(); moduleId = id; connection = nonce(); sequence = 0; receivedAt = -1; motion = null;
    },
    observe(value: SmisMotion) {
      if (!connection || !value || Object.keys(value).sort().join(',') !== 'x,y,z' || ![value.x, value.y, value.z].every(n => Number.isInteger(n) && n >= -32768 && n <= 32767)) rejectObservation('部品から正しい動きの情報を受け取れません。');
      const t = now(); if (!Number.isSafeInteger(t) || t < 0 || t < receivedAt || sequence >= Number.MAX_SAFE_INTEGER) rejectObservation('部品の情報の時刻を確認できません。つなぎ直してください。');
      sequence++; receivedAt = t; motion = { ...value };
      if (reference && Math.max(...(['x', 'y', 'z'] as const).map(k => Math.abs(value[k] - reference![k]))) >= 64) changed = true;
    },
    attach(name: string) {
      if (!label(name)) throw Error('付ける物の名前を40文字以内で入力してください。');
      if (!fresh()) throw Error('部品から新しい情報が届いていません。接続を確認してください。');
      unbind(); objectId = nonce(); objectName = name.trim(); reference = { ...motion! };
    },
    confirmMovement() {
      if (!objectId || !fresh() || !changed) throw Error('取り付けた物をゆっくり傾け、値が変わることを確認してください。');
      checked = true;
    },
    detach() { unbind(); },
    disconnect,
    get view() { return { connected: !!connection, fresh: fresh(), moduleId, objectName, checked, changed, motion: motion ? { ...motion } : null }; },
    snapshot(): SmisModuleSnapshot {
      if (!fresh() || !objectId || !checked) throw Error('部品の接続と、取り付けた物の確認を先に行ってください。');
      return { schema: 'smis.module-observation/1', owner: options.owner, scope: scope(), objectId, objectName, moduleId, mountEpoch: epoch, receivedAt, sequence, motion: { ...motion! }, source: 'microbit-ble', method: 'module-accelerometer-raw', attachmentConfirmedBy: 'owner', automaticDetachDetection: false };
    },
    current(value: SmisModuleSnapshot) { return value.owner === options.owner && value.scope === scope() && checked && fresh(); },
  };
}
/** Explicit, visible historical input for the existing text job, never a tool instruction. */
export function smisModuleRequestSuffix(snapshot: SmisModuleSnapshot) {
  return `\n\n【本人が確認した物の観測】\n対象: ${snapshot.objectName}\n対象の記録番号: ${snapshot.objectId}\n取り付け番号: ${snapshot.mountEpoch}\n観測時刻: ${new Date(snapshot.receivedAt).toISOString()}\n部品自体の加速度の生値: X=${snapshot.motion.x}, Y=${snapshot.motion.y}, Z=${snapshot.motion.z}\nこれは観測時点の値です。物の位置・重さ・温度や内容物は測っていません。取り外しの自動検出、機器の操作権限はありません。`;
}
