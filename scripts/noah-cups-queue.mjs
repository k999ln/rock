import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
async function execute(program, args, timeout) {
  const { stdout } = await exec(program, args, {
    encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LC_ALL: 'C', LANG: 'C' },
  });
  return stdout;
}

const scheduler = ['-h', '127.0.0.1:631'];
const validQueue = /^[a-z0-9][a-z0-9_-]{0,62}$/i;
const source = 'https://openprinting.github.io/cups/doc/man-cupsenable.html';

export async function resumeQueue(queue, { apply = false, run = execute, platform = process.platform } = {}) {
  const result = { agent: 'cups-resume-queue', source };
  if (!validQueue.test(queue ?? '')) return { ...result, status: 'invalid-queue', writes: 'none' };
  if (platform !== 'linux') return { ...result, status: 'unsupported-platform', writes: 'none' };
  const read = async () => {
    const output = await run('/usr/bin/lpstat', [...scheduler, '-p', queue], 5_000);
    return queueState(output, queue);
  };
  let before;
  try {
    before = await read();
  } catch {
    return { ...result, status: 'precheck-failed', writes: 'none' };
  }
  if (before !== 'disabled') {
    return { ...result, status: before === 'unknown' ? 'unknown-state' : 'already-enabled', writes: 'none' };
  }
  if (!apply) return { ...result, status: 'ready-to-resume', writes: 'none', effect: 'キューに残っているジョブが印刷される場合があります。' };
  try {
    await run('/usr/sbin/cupsenable', [...scheduler, queue], 8_000);
    const after = await read();
    if (after === 'idle' || after === 'processing') {
      return { ...result, status: 'queue-resumed', writes: 'queue-state' };
    }
  } catch {
    // The scheduler may have received the change even if the command failed or timed out.
  }
  return { ...result, status: 'result-unverified', writes: 'unknown' };
}

function queueState(output, queue) {
  for (const line of output.split(/\r?\n/)) {
    const match = /^printer (\S+) (disabled since|is idle|now printing)\b/.exec(line);
    if (!match || match[1].toLowerCase() !== queue.toLowerCase()) continue;
    if (match[2] === 'disabled since') return 'disabled';
    return match[2] === 'is idle' ? 'idle' : 'processing';
  }
  return 'unknown';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [target, ...flags] = process.argv.slice(2);
  const allowed = '--apply-and-allow-printing';
  if (target === '--help' || !target || flags.length > 1 || (flags.length === 1 && flags[0] !== allowed)) {
    console.log('Usage: node scripts/noah-cups-queue.mjs <queue> [--apply-and-allow-printing]');
    console.log('Linux CUPS on 127.0.0.1:631. The apply flag can resume queued jobs.');
    if (target !== '--help') process.exitCode = 2;
  } else {
    const result = await resumeQueue(target, { apply: flags.length === 1 });
    console.log(JSON.stringify(result, null, 2));
    if (!['ready-to-resume', 'already-enabled', 'queue-resumed'].includes(result.status)) process.exitCode = 1;
  }
}
