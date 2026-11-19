import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import {
  configurationFromOllama,
  prepareNodeServiceHost,
  connectNodeServiceHost,
  openNodeServiceHost,
  nodeServiceHostStatus,
} from './node-service-host.mjs';

const fail = (code) => {
  throw Object.assign(Error(code), { code });
};
export function parseHostArguments(args) {
  const [command, ...flags] = args;
  if (!['setup', 'connect', 'run', 'status'].includes(command))
    fail('HOST_COMMAND_REQUIRED');
  const options = { command },
    allowed = new Set(
      command === 'setup'
        ? ['--state-dir', '--origin', '--name', '--model', '--agent-file']
        : command === 'status'
          ? ['--state-dir']
          : ['--state-dir', '--max-jobs'],
    );
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i],
      value = flags[i + 1];
    if (
      !allowed.has(key) ||
      !value ||
      value.startsWith('--') ||
      Object.hasOwn(options, key)
    )
      fail('INVALID_HOST_ARGUMENTS');
    options[key] = value;
  }
  if (!options['--state-dir']) fail('HOST_PRIVATE_DIRECTORY_REQUIRED');
  if (command === 'setup' && (!options['--name'] || !options['--model']))
    fail('HOST_MODEL_AND_NAME_REQUIRED');
  if (options['--max-jobs'] && !/^[1-8]$/.test(options['--max-jobs']))
    fail('INVALID_HOST_JOB_LIMIT');
  return options;
}
/** Read a new local unlock phrase from a terminal, never arguments/environment or echoed input. */
export function promptHostUnlock(
  prompt,
  { input = process.stdin, output = process.stderr } = {},
) {
  if (!input.isTTY || typeof input.setRawMode !== 'function')
    return Promise.reject(
      Object.assign(Error('LOCAL_TERMINAL_UNLOCK_REQUIRED'), {
        code: 'LOCAL_TERMINAL_UNLOCK_REQUIRED',
      }),
    );
  return new Promise((resolve, reject) => {
    const bytes = [],
      wasRaw = Boolean(input.isRaw),
      wasFlowing = input.readableFlowing;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      input.off('data', data);
      input.off('end', end);
      input.off('error', end);
      input.setRawMode(wasRaw);
      if (!wasFlowing) input.pause();
      output.write('\n');
      const value = Buffer.from(bytes);
      bytes.fill(0);
      if (error) {
        value.fill(0);
        reject(error);
      } else resolve(value);
    };
    const end = () =>
      finish(
        Object.assign(Error('UNLOCK_INPUT_CLOSED'), {
          code: 'UNLOCK_INPUT_CLOSED',
        }),
      );
    const data = (chunk) => {
      for (const b of chunk) {
        if (b === 3) {
          finish(
            Object.assign(Error('UNLOCK_CANCELLED'), {
              code: 'UNLOCK_CANCELLED',
            }),
          );
          return;
        }
        if (b === 13 || b === 10) {
          finish();
          return;
        }
        if (b === 127 || b === 8) {
          if (bytes.length) {
            let index = bytes.length - 1;
            while (index > 0 && (bytes[index] & 192) === 128) index--;
            bytes.splice(index);
          }
          continue;
        }
        if (b < 32) {
          finish(
            Object.assign(Error('INVALID_UNLOCK_INPUT'), {
              code: 'INVALID_UNLOCK_INPUT',
            }),
          );
          return;
        }
        bytes.push(b);
        if (bytes.length > 1024) {
          finish(
            Object.assign(Error('UNLOCK_INPUT_TOO_LARGE'), {
              code: 'UNLOCK_INPUT_TOO_LARGE',
            }),
          );
          return;
        }
      }
    };
    output.write(prompt);
    input.setRawMode(true);
    input.on('data', data);
    input.once('end', end);
    input.once('error', end);
    input.resume();
  });
}
const wait = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
export async function runNodeHostCli(
  args,
  {
    input = process.stdin,
    output = process.stdout,
    errors = process.stderr,
    signal,
    onSignal,
    unlock = (prompt) => promptHostUnlock(prompt, { input, output: errors }),
    emit = (value) => output.write(JSON.stringify(value) + '\n'),
    service = {
      configurationFromOllama,
      prepareNodeServiceHost,
      connectNodeServiceHost,
      openNodeServiceHost,
      nodeServiceHostStatus,
    },
  } = {},
) {
  const options = parseHostArguments(args),
    directory = options['--state-dir'];
  if (options.command === 'setup') {
    let recipe;
    if (options['--agent-file']) {
      const raw = await readFile(options['--agent-file']);
      if (raw.byteLength > 16000) fail('HOST_AGENT_FILE_TOO_LARGE');
      recipe = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(raw),
      );
    }
    const configuration = await service.configurationFromOllama({
      name: options['--name'],
      model: options['--model'],
      recipe,
    });
    emit(
      await service.prepareNodeServiceHost({
        directory,
        origin: options['--origin'] ?? 'https://avoado.si',
        configuration,
      }),
    );
    return;
  }
  if (options.command === 'status') {
    emit(await service.nodeServiceHostStatus(directory));
    return;
  }
  if (options.command === 'connect' && (!input.isTTY || !errors.isTTY))
    fail('OWNER_TERMINAL_REQUIRED');
  const controller = new AbortController();
  const stopped = () => controller.abort();
  signal?.addEventListener('abort', stopped, { once: true });
  if (signal?.aborted) stopped();
  const removeSignal = onSignal
    ? onSignal(stopped)
    : (() => {
        process.on('SIGINT', stopped);
        process.on('SIGTERM', stopped);
        return () => {
          process.off('SIGINT', stopped);
          process.off('SIGTERM', stopped);
        };
      })();
  let phrase, receiver;
  try {
    if (controller.signal.aborted) return;
    phrase = await unlock(
      options.command === 'connect'
        ? 'このMac用の解除句（15文字以上、入力は非表示）: '
        : 'このMacの解除句（入力は非表示）: ',
    );
    if (options.command === 'connect') {
      const confirmation = await unlock('確認のため、同じ解除句をもう一度: ');
      try {
        if (
          phrase.length !== confirmation.length ||
          !timingSafeEqual(phrase, confirmation)
        )
          fail('LOCAL_UNLOCK_CONFIRMATION_MISMATCH');
      } finally {
        confirmation.fill(0);
      }
      emit(
        await service.connectNodeServiceHost({
          directory,
          unlockPhrase: phrase,
          signal: controller.signal,
          onAuthorization: async (a) => {
            // The pairing code is displayed only in the owner's interactive terminal, never in JSON logs.
            if (!input.isTTY || !errors.isTTY) fail('OWNER_TERMINAL_REQUIRED');
            errors.write(
              `\n${a.name} を接続します。\n${a.verificationUri}\n端末コード: ${a.userCode}\n本人のブラウザで名前とアクセス範囲を確認し、承認してください。\n`,
            );
          },
        }),
      );
    }
    if (controller.signal.aborted) return;
    receiver = await service.openNodeServiceHost({
      directory,
      unlockPhrase: phrase,
    });
    phrase.fill(0);
    phrase = null;
    emit({
      phase: 'receiver_ready',
      name: receiver.name,
      deviceId: receiver.deviceId,
      scope: 'owner-approved local text preview',
    });
    let completed = 0,
      backoff = 5000;
    while (!controller.signal.aborted) {
      try {
        const results = await receiver.cycle({
          maximumJobs: options['--max-jobs']
            ? Number(options['--max-jobs']) - completed
            : 8,
        });
        backoff = 5000;
        for (const r of results) {
          emit({
            phase:
              r.reportState === 'review' ? 'draft_saved' : 'reconciliation',
            ...r,
          });
          completed++;
          if (r.state === 'unknown' || r.reportState === 'unknown') {
            emit({ phase: 'receiver_needs_attention', id: r.id });
            controller.abort();
          }
        }
        if (options['--max-jobs'] && completed >= Number(options['--max-jobs']))
          break;
      } catch (e) {
        const code =
          typeof e.code === 'string' && /^[A-Z0-9_]+$/.test(e.code)
            ? e.code
            : 'HOST_RECEIVER_UNAVAILABLE';
        emit({ phase: 'receiver_readback_wait', code });
        if (
          e.status === 401 ||
          ['RECONNECT_REQUIRED', 'SERVICE_IDENTITY_MISMATCH'].includes(code)
        )
          break;
        backoff = Math.min(backoff * 2, 30000);
      }
      await wait(backoff, controller.signal);
    }
    emit({ phase: 'receiver_closing', engineStopConfirmed: false });
  } finally {
    phrase?.fill(0);
    try {
      await receiver?.close();
    } finally {
      removeSignal?.();
      signal?.removeEventListener('abort', stopped);
    }
  }
}
// npm bin links and macOS /var aliases resolve to a different lexical path.
// Compare the actual entry file so an installed CLI runs, while imports do not.
const entryFile = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => null)
  : null;
if (entryFile && import.meta.url === pathToFileURL(entryFile).href) {
  try {
    await runNodeHostCli(process.argv.slice(2));
  } catch (error) {
    const code =
      typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : 'HOST_OPERATION_FAILED';
    console.error(code);
    process.exitCode = 1;
  }
}
