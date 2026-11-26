import { parseNoahAgentManifest, type NoahAgentManifest } from './noah-agent-upload.ts';

export const NOAH_TRAINING_PROJECT = 'project-777248dbd7e37423d0bae088fc9201cfec479dd305b7d94a544cd22face444ad';
/** A saved, private MCP definition. Adding it never grants permission to execute. */
export const noahTrainingPlugin: NoahAgentManifest = {
  schema: 'noah-agent/1', id: 'noah-business-training', version: '1.0.0',
  name: '法人のsi導入準備', author: 'Noah', license: 'Private',
  summary: '業務の整理票と研修で聞くことを作ります。必要に合う場合に、広告を含む相談先をご案内します。',
  sourceUrl: 'https://avoado.si/noah/business-si', adapter: 'mcp_http',
  endpointUrl: 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp',
  permissions: ['read_input', 'network'],
  priceNote: '準備票の作成は無料。相談先への申込・契約・料金は別途確認してください。',
  guideMarkdown: '業務内容・回数・所要時間を入力すると、整理票と研修で聞くことを受け取れます。入力はNoahの研修準備サービスへ送られます。相談や申込は自分で選べます。',
};

export function isNoahTrainingPlugin(manifest: unknown): boolean {
  try { return JSON.stringify(parseNoahAgentManifest(manifest)) === JSON.stringify(parseNoahAgentManifest(noahTrainingPlugin)); }
  catch { return false; }
}
