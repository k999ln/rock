/** Actual official packages in an offline Linux guest; model responses are deterministic fixtures. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { noahCloudResult } from '../lib/noah-cloud-contract.ts';
const exec = promisify(execFile), image = process.env.NOAH_TEST_IMAGE ?? 'noah-cloud-agents:all-agents-20261122';
const script = 'import sys,urllib.request; b=sys.stdin.buffer.read(); r=urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8080"+sys.argv[1],data=b,headers={"Content-Type":"application/json"}),timeout=225)\nwhile True:\n b=r.read1(4096)\n if not b: break\n sys.stdout.buffer.write(b); sys.stdout.buffer.flush()';
const request = (container, path, body) => {
  const child = spawn('docker', ['exec', '-i', container, 'python', '-c', script, path], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdin.end(JSON.stringify(body));
  return new Response(Readable.toWeb(child.stdout));
};
async function guest(test) {
  const { stdout } = await exec('docker', ['run', '--rm', '-d', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '--pids-limit', '96', image]);
  const container = stdout.trim();
  try {
    for (let i = 0; i < 30; i++) {
      try { await exec('docker', ['exec', container, 'python', '-c', 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8080/health",timeout=1).read()']); break; }
      catch { if (i === 29) throw Error('Guest did not start'); await new Promise(r => setTimeout(r, 100)); }
    }
    return await test(container);
  } finally { await exec('docker', ['rm', '-f', container]); }
}
const cases = [
  { profile: 'time', steps: [{ name: 'get_current_time', args: { timezone: 'Asia/Tokyo' }, match: /Asia\/Tokyo/ }] },
  { profile: 'time', steps: [
    { modelText: 'The current time has been checked.' },
    { name: 'get_current_time', args: { timezone: 'Asia/Tokyo' }, match: /Asia\/Tokyo/ },
  ] },
  { profile: 'time', steps: [
    { name: 'get_current_time<|channel|>commentary', args: { timezone: 'Asia/Tokyo' }, unknown: true, denied: true, match: /No operation ran/ },
    { name: 'get_current_time', args: { timezone: 'Asia/Tokyo' }, match: /Asia\/Tokyo/ },
  ] },
  { profile: 'time', failure: true, steps: [{ modelText: 'Done.' }, { modelText: 'Done.' }] },
  { profile: 'thinking', steps: [{ name: 'sequentialthinking', args: { thought: 'Define the task, then test one small working result.', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: false }, match: /thoughtNumber/ }] },
  { profile: 'memory', file: 'memory.jsonl', steps: [
    { name: 'read_graph', args: {}, absent: /NoahQARecord/ },
    { name: 'create_entities', args: { entities: [{ name: 'NoahQARecord', entityType: 'task', observations: ['Write a small working result.'] }] }, match: /NoahQARecord/ },
    { name: 'read_graph', args: {}, match: /NoahQARecord/ },
  ] },
  { profile: 'filesystem', file: 'result.txt', steps: [
    { name: 'write_file', args: { path: '/workspace/result.txt', content: 'NoahQARecord' }, match: /success/i },
    { name: 'read_text_file', args: { path: '/workspace/result.txt' }, match: /NoahQARecord/ },
    { name: 'read_text_file', args: { path: '/etc/passwd' }, denied: true },
    { name: 'read_text_file', args: { path: '/workspace/escape/passwd' }, denied: true },
  ] },
  // A second new memory guest must not inherit the first request's graph.
  { profile: 'memory', steps: [{ name: 'read_graph', args: {}, absent: /NoahQARecord/ }] },
];
for (const { profile, steps, file, failure } of cases) {
  await guest(async c => { const probe = await request(c, '/run', { profile, mode: 'probe' }).json(); assert.equal(probe.type, 'probe'); assert.equal(probe.profile, profile); });
  await guest(async c => {
    if (profile === 'filesystem') await exec('docker', ['exec', c, 'python', '-c', "import os; os.symlink('/etc', '/workspace/escape')"]);
    const response = request(c, '/run', { profile, mode: 'run', prompt: '依頼の情報を公式ツールで確認して結果を保存して。' });
    let buffer = '', calls = 0, result;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      while (buffer.includes('\n')) {
        const split = buffer.indexOf('\n'), event = JSON.parse(buffer.slice(0, split)); buffer = buffer.slice(split + 1);
        if (event.type === 'result') { result = event; continue; }
        assert.equal(event.type, 'model_request'); calls++;
        if (calls > 1) {
          const previous = steps[calls - 2];
          if (previous.modelText) {
            assert.equal(event.body.messages.at(-1).role, 'user');
            assert.match(event.body.messages.at(-1).content, /No tool has run yet/);
          } else {
            const reply = event.body.messages.filter(m => m.role === 'tool').at(-1); assert.ok(reply);
            const actual = JSON.parse(reply.content);
            assert.equal(actual.isError === true, Boolean(previous.denied), JSON.stringify(actual));
            if (previous.match) assert.match(JSON.stringify(actual), previous.match);
            if (previous.absent) assert.doesNotMatch(JSON.stringify(actual), previous.absent);
          }
        }
        const step = steps[calls - 1];
        let message = { role: 'assistant', content: 'Official MCP tool completed.' };
        if (step?.modelText) {
          message = { role: 'assistant', content: step.modelText };
        } else if (step) {
          assert.equal(event.body.tools.some(t => t.function.name === step.name), !step.unknown, step.name);
          message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_' + calls, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }] };
        }
        assert.ok(calls <= steps.length + 1);
        await request(c, '/model-reply', { id: event.id, body: { choices: [{ message, finish_reason: step ? 'tool_calls' : 'stop' }] } }).json();
      }
    }
    if (failure) {
      assert.equal(result?.exitCode, 1, 'text-only claims cannot become successful work');
      assert.equal(calls, steps.length);
      assert.deepEqual(result.files, []);
      console.log(JSON.stringify({ profile, model: 'fixture', textOnlyCompletion: 'rejected', calls }));
      return;
    }
    assert.equal(result?.exitCode, 0, JSON.stringify(result)); assert.equal(result.text, 'Official MCP tool completed.'); assert.equal(calls, steps.length + 1);
    const verified = await noahCloudResult(result, calls);
    if (file) {
      const saved = verified.files.find(f => f.name === file); assert.ok(saved, JSON.stringify(verified.files));
      assert.match(Buffer.from(saved.base64, 'base64').toString(), /NoahQARecord/);
    } else assert.equal(verified.files.length, 0);
    console.log(JSON.stringify({ profile, officialTools: steps.filter(s => s.name && !s.unknown).map(s => s.name), recoveryCases: steps.filter(s => s.modelText || s.unknown).length, files: verified.files.map(f => f.name), network: 'none', model: 'fixture', probe: 'passed', run: 'passed', calls }));
  });
}
