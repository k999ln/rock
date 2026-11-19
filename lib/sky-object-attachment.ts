import { negotiateCapabilityAdapters } from './rockstar-adapters.ts';

export const skyObjectInputs = [
  { id: 'text', label: 'Eveに入力した文章', capability: 'input.text', processing: 'text.generate' },
  { id: 'audio', label: '部品のマイクからの音声', capability: 'input.audio', processing: 'audio.transcribe' },
  { id: 'image', label: '接続したカメラからの写真', capability: 'input.image', processing: 'image.describe' },
  { id: 'sensor', label: '部品のセンサーの値', capability: 'input.sensor', processing: 'sensor.interpret' },
  { id: 'button', label: '部品のボタン操作', capability: 'input.button', processing: 'event.interpret' },
] as const;
export const skyObjectOutputs = [
  { id: 'text', label: 'Eveの画面に返す', capability: 'output.text' },
  { id: 'audio', label: '接続したスピーカーで伝える', capability: 'output.audio' },
  { id: 'signal', label: '部品の光や振動で知らせる', capability: 'output.signal' },
] as const;
/** A desired connection, not evidence that an object has sensors or an authorized module. */
export type SkyObjectAttachment = {
  schema: 'sky.object-attachment/1';
  objectName: string;
  input: typeof skyObjectInputs[number]['id'];
  output: typeof skyObjectOutputs[number]['id'];
};
function hasControl(text: string) {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32 || text.charCodeAt(i) === 127) return true;
  return false;
}
export function parseSkyObjectAttachment(value: unknown): SkyObjectAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('つなぐ対象と使い方を確認してください。');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || !['schema', 'objectName', 'input', 'output'].every(k => Object.hasOwn(v, k)) ||
      v.schema !== 'sky.object-attachment/1' || typeof v.objectName !== 'string' || !v.objectName.trim() || v.objectName.length > 40 ||
      hasControl(v.objectName) ||
      !skyObjectInputs.some(i => i.id === v.input) || !skyObjectOutputs.some(o => o.id === v.output)) throw new Error('対象の名前と、受け取る情報・伝え方を確認してください。');
  return { schema: 'sky.object-attachment/1', objectName: v.objectName.trim(), input: v.input as SkyObjectAttachment['input'], output: v.output as SkyObjectAttachment['output'] };
}
export function skyObjectRequirements(value: SkyObjectAttachment) {
  const attachment = parseSkyObjectAttachment(value);
  const input = skyObjectInputs.find(i => i.id === attachment.input)!;
  const output = skyObjectOutputs.find(o => o.id === attachment.output)!;
  return {
    host: ['identity.owner-local', 'store.cas', input.capability],
    executor: [...new Set(['text.generate', 'model.pin', input.processing])],
    output: [output.capability],
  };
}
export function negotiateSkyObjectAttachment(value: SkyObjectAttachment, adapters: { host: unknown; executor: unknown; output: unknown }, now: number) {
  const attachment = parseSkyObjectAttachment(value);
  const connection = negotiateCapabilityAdapters(adapters.host, adapters.executor, adapters.output, skyObjectRequirements(attachment), now);
  return { ...connection, attachment, physicalAcceptance: false as const, executionAuthorized: false as const };
}
export function skyObjectAttachmentLabels(value: SkyObjectAttachment) {
  const attachment = parseSkyObjectAttachment(value);
  return { input: skyObjectInputs.find(i => i.id === attachment.input)!.label, output: skyObjectOutputs.find(o => o.id === attachment.output)!.label };
}
export function skyObjectEntryPath(agentId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/.test(agentId)) throw new Error('担当を確認してください。');
  return `/sky/objects/${encodeURIComponent(agentId)}`;
}
