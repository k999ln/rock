import { writeNoahArchive } from './noah-source-archive.ts';
import type { NoahAgentManifest } from './noah-agent-upload.ts';

// The same runnable source is offered in the author form and used by integration
// checks. It is a starting point, not a claim that an external Agent was ported.
export function noahTerminalTemplate(language: 'node' | 'python') {
  const manifest: NoahAgentManifest = { schema: 'noah-agent/1', id: `my-${language}-agent`, version: '1.0.0',
    name: language === 'node' ? '文章作成Agent（Node）' : '文章作成Agent（Python）',
    summary: '依頼文をローカルモデルへ渡し、回答とresult.txtを返す画面なしのテンプレートです。agentの処理と固定テストを書き換えて、自分の仕事に合わせられます。',
    author: '自分', license: 'Private', sourceUrl: null, adapter: 'source', endpointUrl: null,
    permissions: ['read_input', 'write_files'], priceNote: '固定ローカルモデルを使用します。外部APIへの送信は行いません。',
    runtime: { schema: 'noah-terminal/1', language, entrypoint: language === 'node' ? 'main.mjs' : 'main.py', model: 'qwen3:4b' } };
  const files: Record<string, string> = language === 'node' ? {
    'agent.mjs': `export function messages(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('依頼文が必要です');
  return [{role:'system',content:'依頼に沿って簡潔に回答してください。実行していない外部操作を完了したと書かないでください。'}, {role:'user',content:prompt}];
}
`,
    'main.mjs': `import {createInterface} from 'node:readline';
import {randomUUID,createHash} from 'node:crypto';
import {messages} from './agent.mjs';
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const input=JSON.parse((await lines.next()).value);
if(input.schema!=='noah-terminal-input/1') throw new Error('Invalid input protocol');
const id=randomUUID().replaceAll('-','');
console.log(JSON.stringify({type:'model_request',id,body:{messages:messages(input.prompt)}}));
const reply=JSON.parse((await lines.next()).value);
if(reply.id!==id) throw new Error('Invalid model response');
const text=reply.body.choices[0].message.content, bytes=Buffer.from(text);
console.log(JSON.stringify({type:'result',text,exitCode:0,files:[{name:'result.txt',base64:bytes.toString('base64'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
process.exit(0);
`,
    'agent.test.mjs': `import test from 'node:test';
import assert from 'node:assert/strict';
import {messages} from './agent.mjs';
test('日本語の依頼を変更せずモデルへ渡す',()=>assert.equal(messages('請求書の説明を書いて')[1].content,'請求書の説明を書いて'));
test('空の依頼を拒否する',()=>assert.throws(()=>messages('  ')));
`,
  } : {
    'agent.py': `def messages(prompt):
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('依頼文が必要です')
    return [{'role': 'system', 'content': '依頼に沿って簡潔に回答してください。実行していない外部操作を完了したと書かないでください。'}, {'role': 'user', 'content': prompt}]
`,
    'main.py': `import base64, hashlib, json, sys, uuid
from agent import messages
request = json.loads(sys.stdin.readline())
if request.get('schema') != 'noah-terminal-input/1':
    raise ValueError('Invalid input protocol')
call_id = uuid.uuid4().hex
print(json.dumps({'type': 'model_request', 'id': call_id, 'body': {'messages': messages(request['prompt'])}}), flush=True)
reply = json.loads(sys.stdin.readline())
if reply.get('id') != call_id:
    raise ValueError('Invalid model response')
text = reply['body']['choices'][0]['message']['content']
data = text.encode('utf-8')
print(json.dumps({'type': 'result', 'text': text, 'exitCode': 0, 'files': [{'name': 'result.txt', 'base64': base64.b64encode(data).decode('ascii'), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}]}), flush=True)
`,
    'test_agent.py': `import unittest
from agent import messages
class AgentTests(unittest.TestCase):
    def test_preserves_request(self):
        self.assertEqual(messages('請求書の説明を書いて')[1]['content'], '請求書の説明を書いて')
    def test_empty_request(self):
        with self.assertRaises(ValueError): messages('  ')
`,
  };
  files['noah-agent.json'] = JSON.stringify(manifest, null, 2);
  files['README.md'] = '# 画面を使わないAgentテンプレート\n\nagentの処理と固定テストを編集し、ZIPとnoah-agent.jsonをNoahへ登録します。mainはstdinの依頼を読み、model_requestとresultをstdoutへ返します。標準ライブラリのみ使用し、ログはstderrへ出します。\n\nNoahから接続・依頼・停止します。モデルは本人のMacの固定ローカルモデルです。hostの画面・ブラウザ・入力を使いません。外部アカウントやネットワーク通信には別途対応adapterが必要です。\n';
  return { manifest, name: `noah-${language}-agent.zip`, bytes: writeNoahArchive(Object.entries(files).map(([name, content]) => ({ name, bytes: new TextEncoder().encode(content), os: 0, attrs: 0 }))) };
}
