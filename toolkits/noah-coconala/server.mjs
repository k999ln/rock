import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { actionInput, validId, jobStore } from './jobs.mjs';
import { runBrowserJob } from './browser.mjs';

export const stateDirectory = () =>
  join(homedir(), 'Library', 'Application Support', 'Noah', 'coconala');
const str = { type: 'string' };
const fields = {
  requestId: str,
  target: str,
  message: str,
  price: { type: 'integer' },
  due: str,
  filename: str,
  sha256: str,
};
const actions = [
  ['reply', 'メッセージに返信', ['target', 'message']],
  ['room_reply', 'トークルームに返信', ['target', 'message']],
  ['apply', '公開依頼に応募', ['target', 'message', 'price', 'due']],
  [
    'deliver',
    'トークルームに正式な納品',
    ['target', 'message', 'filename', 'sha256'],
  ],
  ['status', '受付番号で結果を確認', []],
];
const tools = actions.map(([name, title, extra]) => {
  const required = ['requestId', ...extra];
  return {
    name,
    title,
    description: title,
    _meta: {
      'rockstaros.dev/pricing': {
        model: 'free',
        note: 'このMacでのTool実行料は0円です。応募額は取引相手に提示する条件です。',
      },
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required,
      properties: Object.fromEntries(required.map((key) => [key, fields[key]])),
    },
  };
});
export async function serve(
  root = stateDirectory(),
  execute = (job, begin) => runBrowserJob(root, job, begin),
) {
  process.umask(0o077);
  const store = await jobStore(root);
  store.recover();
  async function rpc(method, params) {
    if (method === 'initialize')
      return {
        protocolVersion: params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'noah-coconala', version: '0.1.0' },
      };
    if (method === 'ping') return {};
    if (method === 'tools/list') return { tools };
    if (method !== 'tools/call') throw Error('未対応の操作です。');
    const { name, arguments: args } = params;
    const value =
      name === 'status'
        ? store.status(validId(args.requestId))
        : await store.run(args.requestId, actionInput(name, args), execute);
    return {
      structuredContent: value,
      content: [{ type: 'text', text: value.message }],
    };
  }
  const io = createInterface({ input: process.stdin });
  io.on('line', async (line) => {
    let id = null;
    try {
      const msg = JSON.parse(line);
      if (!Object.hasOwn(msg, 'id')) return;
      id = msg.id;
      const result = await rpc(msg.method, msg.params ?? {});
      process.stdout.write(
        JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n',
      );
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: error.message },
        }) + '\n',
      );
    }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await serve();
