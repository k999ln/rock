import path from 'node:path';
import os from 'node:os';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { installMacRunner } from './noah-mac-install.mjs';
import {
  createMacRunner,
  runnerDoctor,
  runnerClient,
  pairRunner,
  readRunnerConfig,
  runnerOrigin,
} from './noah-mac-runner.mjs';
import { lockRunner } from './noah-mac-service.mjs';
import { runCommand } from './noah-source-fetch.mjs';

export const MAC_SETUP_TOOLS = ['docker', 'colima', 'ollama', 'git'];
const brewPath = '/opt/homebrew/bin/brew';
const safeEnvironment = () => ({
  HOME: os.homedir(),
  PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  LANG: 'en_US.UTF-8',
  CI: '1',
  HOMEBREW_NO_ANALYTICS: '1',
  HOMEBREW_NO_AUTO_UPDATE: '1',
  HOMEBREW_NO_INSTALL_CLEANUP: '1',
});
// Native host owns these actions. No URL, source archive or Agent output selects a command.
export async function connectMacFromApp({
  source,
  root = path.join(os.homedir(), 'Library/Application Support/Noah/runner'),
  signal = new AbortController().signal,
  emit = () => {},
  doctor = runnerDoctor,
  run = runCommand,
  hasBrew = async () =>
    access(brewPath, constants.X_OK).then(
      () => true,
      () => false,
    ),
  hasDeveloperTools = async () =>
    runCommand('/usr/bin/xcode-select', ['-p'], {
      env: safeEnvironment(),
      timeout: 5000,
    }).then(
      () => true,
      () => false,
    ),
  install = installMacRunner,
  readConfig = readRunnerConfig,
  pair = pairRunner,
  createRunner = createMacRunner,
  lock = lockRunner,
} = {}) {
  if (!path.isAbsolute(source ?? ''))
    throw new Error('Noahアプリの配布物を確認できません。');
  const origin = runnerOrigin('https://avoado.si'),
    file = path.join(root, 'account.json');
  let runner, unlock;
  try {
    signal.throwIfAborted();
    unlock = await lock(root);
    emit({ state: 'preparing' });
    let health = await doctor();
    if (health.checks.some((c) => !MAC_SETUP_TOOLS.includes(c.name) && !c.ok))
      throw new Error('Apple Silicon Macで開いてください。');
    const missing = MAC_SETUP_TOOLS.filter(
      (name) => !health.checks.some((c) => c.name === name && c.ok),
    );
    if (missing.length) {
      if (!(await hasDeveloperTools())) {
        emit({ state: 'needs_developer_tools' });
        return;
      }
      if (!(await hasBrew())) {
        emit({ state: 'needs_installer' });
        return;
      }
      emit({ state: 'installing' });
      await run(brewPath, ['install', ...missing], {
        signal,
        env: safeEnvironment(),
        timeout: 1200000,
        maxOutput: 8 * 1024 * 1024,
      });
      health = await doctor();
      if (!health.ready)
        throw new Error('実行環境の準備を完了できませんでした。');
    }
    signal.throwIfAborted();
    await install({ source, target: root });
    let config;
    try {
      config = await readConfig(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (
      config &&
      (config.origin !== origin || !Number.isFinite(config.expiresAt))
    )
      throw new Error('接続情報を確認できません。');
    if (!config || config.expiresAt <= Date.now()) {
      emit({ state: 'authorizing' });
      await pair({
        origin,
        file,
        signal,
        print: () => {},
        onAuthorization: async (url) => emit({ state: 'authorizing', url }),
      });
      config = await readConfig(file);
    }
    signal.throwIfAborted();
    if (
      config.origin !== origin ||
      !Number.isFinite(config.expiresAt) ||
      config.expiresAt <= Date.now()
    )
      throw new Error('Macの本人確認を完了してください。');
    emit({ state: 'connecting' });
    runner = await createRunner({
      root,
      api: runnerClient(origin, config.token),
      signal,
    });
    signal.throwIfAborted();
    emit({ state: 'connected' });
    await runner.run();
  } finally {
    // Confirm owned processes are gone before the UI can report stopped.
    await runner?.close().catch((cause) => {
      throw Object.assign(
        new Error(
          '停止を確認できません。Noahを終了せず状態を確認してください。',
          { cause },
        ),
        { stopUnconfirmed: true },
      );
    });
    await unlock?.();
  }
}
export function onboardingErrorMessage(error) {
  if (error?.stopUnconfirmed)
    return '停止を確認できません。Noahを終了せず状態を確認してください。';
  const safe = new Set([
    'Noah Runnerは既に起動しています。',
    'Apple Silicon Macで開いてください。',
    '実行環境の準備を完了できませんでした。',
    '接続情報を確認できません。',
    'Macの本人確認を完了してください。',
    'Macの承認が終了しました。再度接続してください。',
    'Mac承認の期限が切れました。',
    'Macの認証をやり直してください。',
    'Noahとの接続が切れました。仕事は再実行しません。再接続してください。',
  ]);
  return safe.has(error?.message)
    ? error.message
    : '接続できませんでした。通信とMacの準備を確認し、もう一度お試しください。';
}
export async function appMain() {
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  process.once('SIGINT', () => controller.abort());
  const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
  try {
    await connectMacFromApp({
      source: process.env.NOAH_APP_SOURCE,
      signal: controller.signal,
      emit,
    });
    if (controller.signal.aborted) emit({ state: 'stopped' });
  } catch (error) {
    if (controller.signal.aborted && !error.stopUnconfirmed)
      emit({ state: 'stopped' });
    else {
      emit({
        state: 'error',
        message: onboardingErrorMessage(error),
      });
      process.exitCode = 1;
    }
  }
}
if (
  process.argv[1] &&
  path.basename(process.argv[1]) === 'noah-mac-onboarding.mjs' &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  await appMain();
