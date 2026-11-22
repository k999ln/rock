import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { draftRunner } from './draft-runner.mjs';

process.umask(0o077);
const root = join(
  homedir(),
  'Library',
  'Application Support',
  'Noah',
  'coconala',
);
mkdirSync(root, { recursive: true, mode: 0o700 });
const runner = draftRunner(join(root, 'anicca-drafts.sqlite'));
const titles = {
  start: '公開案件を探して提案を下書き',
  status: '実行状況と下書きを受け取る',
  stop: '探索を停止',
};
const tools = Object.entries(titles).map(([name, title]) => ({
  name,
  title,
  description: title,
  inputSchema: {
    type: 'object',
    required: ['requestId'],
    additionalProperties: false,
    properties: { requestId: { type: 'string' } },
  },
  _meta: {
    'rockstaros.dev/pricing': {
      model: 'free',
      note: '本人のMac上で実行します。',
    },
  },
}));
const lines = createInterface({ input: process.stdin });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await runner.close();
  process.exit(0);
}
lines.once('close', close);
process.once('SIGTERM', close);
process.once('SIGINT', close);
lines.on('line', async (line) => {
  let id = null;
  try {
    const msg = JSON.parse(line);
    if (!Object.hasOwn(msg, 'id') || closing) return;
    id = msg.id;
    let result;
    if (msg.method === 'initialize')
      result = {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'noah-anicca-draft', version: '1.0.0' },
      };
    else if (msg.method === 'ping') result = {};
    else if (msg.method === 'tools/list') result = { tools };
    else if (
      msg.method === 'tools/call' &&
      Object.hasOwn(titles, msg.params.name) &&
      Object.keys(msg.params.arguments ?? {}).join(',') === 'requestId'
    ) {
      const report = await runner[msg.params.name](
        msg.params.arguments.requestId,
      );
      result = {
        structuredContent: report,
        content: [{ type: 'text', text: report.state }],
      };
    } else throw Error('未対応の操作です。');
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: err.message },
      }) + '\n',
    );
  }
});
