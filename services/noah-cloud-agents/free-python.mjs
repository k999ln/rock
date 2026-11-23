import { RpcTarget } from 'cloudflare:workers';
import { noahCloudDigest } from '../../lib/noah-cloud-contract.ts';

export const pythonProfiles = new Set(['time', 'boss', 'hermes']);
export class PythonModelBridge extends RpcTarget {
  #job;
  constructor(job) { super(); this.#job = job; }
  async live() { await this.#job.live(); return true; }
  async complete(encoded) {
    if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).length > 131072) throw Error('model_input_limit');
    return JSON.stringify(await this.#job.runModel(JSON.parse(encoded)));
  }
}
export function pythonJob(env, job) {
  const binding = { time: 'PYTHON', boss: 'PYTHON_BOSS', hermes: 'PYTHON_HERMES' }[job.profile];
  if (!binding || !env[binding]) throw Error('Python実行器が接続されていません。');
  return env[binding].getByName(`${job.owner}:${job.id}`);
}
export async function timeSession(stub) {
  const listing = JSON.parse(await stub.tools());
  if (!Array.isArray(listing) || !listing.length || listing.some(t => !['get_current_time', 'convert_time', 'get_time_ago'].includes(t.name))) throw Error('official_time_tools_missing');
  let closed = false;
  const results = [];
  return {
    tools: listing.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
    async call(name, args) {
      if (closed || !listing.some(t => t.name === name)) throw Error('unsupported_time_operation');
      const encoded = JSON.stringify(args);
      if (new TextEncoder().encode(encoded).length > 16384) throw Error('tool_input_limit');
      const result = JSON.parse(await stub.call(name, encoded));
      if (closed) throw Error('stopped');
      results.push({ name, arguments: args, result });
      return result;
    },
    async files() {
      if (!results.length) return [];
      const text = JSON.stringify(results, null, 2), bytes = new TextEncoder().encode(text);
      if (bytes.length > 32768) throw Error('Timeの成果が保存上限を超えました。');
      return [{ name: 'time-results.json', base64: Buffer.from(bytes).toString('base64'), bytes: bytes.length, sha256: await noahCloudDigest(text) }];
    },
    async close() { closed = true; },
  };
}
export function validatePythonResult(profile, raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 100000) throw Error('python_result_limit');
  const value = JSON.parse(raw), names = profile === 'hermes' ? ['todo', 'memory'] : ['ai-interview-prep'];
  if (typeof value.text !== 'string' || !value.text.trim() || !Array.isArray(value.files) || !Array.isArray(value.operations) || !value.operations.length || value.operations.length > 12 || !value.operations.some(o => o.ok === true) || value.operations.some(o => !names.includes(o.name) || typeof o.ok !== 'boolean' || !/^[a-f0-9]{64}$/.test(o.inputSha256) || !/^[a-f0-9]{64}$/.test(o.resultSha256)) || value.files.some(f => f.name === 'noah-execution.json')) throw Error('公式Pythonの処理結果を確認できませんでした。');
  return value;
}
