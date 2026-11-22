/** Actual official packages in an offline Linux guest; model responses are deterministic fixtures. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
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
for (const profile of ['time', 'thinking']) {
  await guest(async c => { const probe = await request(c, '/run', { profile, mode: 'probe' }).json(); assert.equal(probe.type, 'probe'); assert.equal(probe.profile, profile); });
  await guest(async c => {
    const response = request(c, '/run', { profile, mode: 'run', prompt: profile === 'time' ? '東京の現在時刻を確認して。' : '小さなプロジェクトを始める順番を考えて。' });
    let buffer = '', calls = 0, result;
    const name = profile === 'time' ? 'get_current_time' : 'sequentialthinking';
    for await (const chunk of response.body) {
      buffer += new TextDecoder().decode(chunk);
      while (buffer.includes('\n')) {
        const split = buffer.indexOf('\n'), event = JSON.parse(buffer.slice(0, split)); buffer = buffer.slice(split + 1);
        if (event.type === 'result') { result = event; continue; }
        assert.equal(event.type, 'model_request'); calls++;
        let message;
        if (calls === 1) {
          assert.ok(event.body.tools.some(t => t.function.name === name));
          const args = profile === 'time' ? { timezone: 'Asia/Tokyo' } : { thought: 'Define the task, then test one small working result.', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: false };
          message = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
        } else {
          const reply = event.body.messages.find(m => m.role === 'tool'); assert.ok(reply);
          const actual = JSON.parse(reply.content); assert.notEqual(actual.isError, true);
          assert.match(JSON.stringify(actual), profile === 'time' ? /Asia\/Tokyo/ : /thoughtNumber/);
          message = { role: 'assistant', content: 'Official MCP tool completed.' };
        }
        assert.ok(calls <= 2);
        await request(c, '/model-reply', { id: event.id, body: { choices: [{ message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }] } }).json();
      }
    }
    assert.equal(result?.exitCode, 0, JSON.stringify(result)); assert.equal(result.text, 'Official MCP tool completed.'); assert.equal(calls, 2);
    console.log(JSON.stringify({ profile, officialTool: name, network: 'none', model: 'fixture', probe: 'passed', run: 'passed', calls }));
  });
}
