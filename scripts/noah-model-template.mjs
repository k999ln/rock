import { createHash } from 'node:crypto';
import { InstallError } from './noah-source-fetch.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');

// Only the reviewed, hash-pinned template may be transformed. No downloaded
// template code is executed on the host and no original model is overwritten.
export function deriveModelTemplate(model, template) {
  const source = model?.derivedFrom;
  if (source?.transform !== 'tool-functions-json/1' || typeof template !== 'string'
      || Buffer.byteLength(template) > 32768 || digest(template) !== source.templateSha256
      || template.split('{{ .Function }}').length !== 2)
    throw new InstallError('元モデルのTool定義を照合できません。自動変更せず停止しました。', 409);
  const result = template.replace('{{ .Function }}', '{{ json .Function }}');
  if (digest(result) !== source.resultTemplateSha256)
    throw new InstallError('モデルのTool修正版を照合できません。', 409);
  return result;
}
