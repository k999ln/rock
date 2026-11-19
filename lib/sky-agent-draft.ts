import { defaultSkyAgentSettings, parseSkyAgentSettings, SkyAgentLibraryError } from './sky-agent-library.ts';
import { parseSkyObjectAttachment, skyObjectAttachmentLabels } from './sky-object-attachment.ts';

/** A transparent template, requiring owner review; this function calls no model or device. */
export function draftSkyObjectAgent(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkyAgentLibraryError('困っていることを入力してください。');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 5 || Object.keys(v).some(k => !['objectName', 'problem', 'result', 'input', 'output'].includes(k))) throw new SkyAgentLibraryError('つなぐ対象と困りごと、欲しい結果を確認してください。');
  for (const key of ['problem', 'result']) {
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > 240) throw new SkyAgentLibraryError('困りごとと欲しい結果を、それぞれ240文字以内で入力してください。');
    const content = v[key] as string;
    for (let i = 0; i < content.length; i++) { const code = content.charCodeAt(i); if ((code < 32 && ![9, 10, 13].includes(code)) || code === 127) throw new SkyAgentLibraryError('入力に使えない文字が含まれています。'); }
  }
  let attachment;
  try { attachment = parseSkyObjectAttachment({ schema: 'sky.object-attachment/1', objectName: v.objectName, input: v.input, output: v.output }); }
  catch (error) { throw new SkyAgentLibraryError(error instanceof Error ? error.message : '対象の使い方を確認してください。'); }
  const labels = skyObjectAttachmentLabels(attachment);
  const instructions = `対象: ${attachment.objectName}\n困っていること: ${(v.problem as string).trim()}\n欲しい結果: ${(v.result as string).trim()}\n\n受け取る情報: ${labels.input}\n伝え方: ${labels.output}\n\n実際に受け取った情報から、欲しい結果を短く分かる言葉で返してください。情報が足りない場合は本人に確認してください。取り付けただけで未知の情報が分かると主張せず、外部送信・機器の操作・費用は本人の確認と既存の権限検査を通してください。`;
  return parseSkyAgentSettings({ ...defaultSkyAgentSettings(`${attachment.objectName}の担当`, instructions), attachment });
}
