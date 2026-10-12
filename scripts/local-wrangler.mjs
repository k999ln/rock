import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionWrangler } from './spider-web-runtime.mjs';

// Build and local preview must use the same runtime even when npm installs an
// older Wrangler at the application root.
export async function runLocalWrangler(commands) {
  const { cli } = productionWrangler();
  let child;
  let interrupted;
  const handlers = new Map(['SIGINT', 'SIGTERM'].map((signal) => [signal, () => {
    interrupted ??= signal;
    child?.kill(signal);
  }]));
  for (const [signal, handler] of handlers) process.on(signal, handler);

  function run({ args, env = process.env }) {
    return new Promise((resolve, reject) => {
      child = spawn(process.execPath, [cli, ...args], { env, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        child = undefined;
        resolve({ code, signal });
      });
    });
  }

  let result = { code: 0 };
  try {
    for (const command of commands) {
      result = await run(command);
      if (result.code !== 0 || result.signal || interrupted) break;
    }
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }

  const signal = interrupted ?? result.signal;
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = result.code ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runLocalWrangler([{ args: ['dev', ...process.argv.slice(2)] }]);
}
