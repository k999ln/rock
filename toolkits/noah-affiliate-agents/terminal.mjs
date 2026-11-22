import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fromPrompt, runAction, render } from './core.mjs';

export async function terminal(role, readCatalog = () => readFile(new URL('./catalog.json', import.meta.url), 'utf8')) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    const first = await lines[Symbol.asyncIterator]().next();
    if (first.done || first.value.length > 20000) throw new Error('依頼の形式を確認してください。');
    const request = JSON.parse(first.value);
    if (request.schema !== 'noah-terminal-input/1') throw new Error('入力protocolが一致しません。');
    const result = runAction(role, fromPrompt(request.prompt, role), JSON.parse(await readCatalog()));
    const text = render(result);
    const file = (name, body) => { const b = Buffer.from(body); return { name, bytes: b.length, base64: b.toString('base64'), sha256: createHash('sha256').update(b).digest('hex') }; };
    console.log(JSON.stringify({ type: 'result', text, exitCode: 0, files: [file('result.md', text), file('result.json', JSON.stringify(result, null, 2))] }));
  } catch {
    console.log(JSON.stringify({ type: 'result', text: '入力または台帳の形式を確認してください。処理は完了していません。', exitCode: 1, files: [] }));
    process.exitCode = 1;
  } finally { lines.close(); process.stdin.destroy(); }
}
