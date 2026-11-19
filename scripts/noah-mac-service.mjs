import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile),
  label = 'si.avoado.noah.runner';
const xml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function runnerPlist({ root, node, entry }) {
  if (
    [root, node, entry].some(
      (v) => !path.isAbsolute(v) || [...v].some((c) => c.charCodeAt(0) < 32),
    )
  )
    throw new Error('起動するファイルの場所を確認してください。');
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(entry)}</string><string>run</string></array><key>EnvironmentVariables</key><dict><key>NOAH_RUNNER_HOME</key><string>${xml(root)}</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>StandardOutPath</key><string>${xml(path.join(root, 'logs/runner.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(root, 'logs/runner-error.log'))}</string></dict></plist>`;
}
export async function macService(
  action,
  {
    root,
    entry,
    node = process.execPath,
    home = os.homedir(),
    run = execute,
    uid = process.getuid(),
  },
) {
  const domain = `gui/${uid}`,
    file = path.join(home, 'Library/LaunchAgents', label + '.plist');
  if (action === 'status') {
    try {
      return (await run('launchctl', ['print', domain + '/' + label])).stdout;
    } catch {
      return 'Noah Runnerは停止しています。';
    }
  }
  if (action === 'stop') {
    await run('launchctl', ['bootout', domain + '/' + label]);
    return '停止を要求しました。Noahの仕事の終了状態を確認してください。';
  }
  if (action !== 'start')
    throw new Error('使用方法: noah start | stop | status');
  await mkdir(path.join(root, 'logs'), { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(file), { recursive: true });
  const value = runnerPlist({ root, node, entry });
  try {
    const old = await readFile(file, 'utf8');
    if (old !== value)
      throw new Error(
        '別のNoah Runnerが登録されています。停止してから保存先を変更してください。',
      );
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  try {
    await run('launchctl', ['print', domain + '/' + label]);
    await run('launchctl', ['kickstart', domain + '/' + label]);
    return 'Noah Runnerを起動しました。起動中ならそのまま継続します。';
  } catch {
    /* not loaded */
  }
  await writeFile(file, value, { mode: 0o600 });
  await run('launchctl', ['bootstrap', domain, file]);
  return 'Noah Runnerを起動しました。画面を閉じても処理します。Macのスリープ中は処理できません。';
}
export async function lockRunner(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, 'runner.pid');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, String(process.pid), { flag: 'wx', mode: 0o600 });
      return async () => {
        if (
          (await readFile(file, 'utf8').catch(() => null)) ===
          String(process.pid)
        )
          await unlink(file);
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const recovery = path.join(root, 'runner-recovery.lock');
      try {
        await writeFile(recovery, String(process.pid), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (recovering) {
        if (recovering.code === 'EEXIST')
          throw new Error(
            '別の起動処理がロックを確認中です。状態を確認して再試行してください。',
          );
        throw recovering;
      }
      try {
        const value = await readFile(file, 'utf8').catch((missing) => {
          if (missing.code === 'ENOENT') return null;
          throw missing;
        });
        if (value === null) continue;
        const pid = Number(value);
        if (!Number.isInteger(pid) || pid < 1)
          throw new Error('実行器のロックを確認してください。');
        try {
          process.kill(pid, 0);
          throw new Error('Noah Runnerは既に起動しています。');
        } catch (found) {
          if (found.code !== 'ESRCH') throw found;
        }
        await unlink(file);
      } finally {
        await unlink(recovery);
      }
    }
  }
  throw new Error('実行器の起動が競合しました。');
}
