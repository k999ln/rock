import path from 'node:path';
import os from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const NOAH_SERVICE_LABEL = 'si.avokado.noah.local';
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

// Preparation only: installing/loading this user service remains a separate,
// reviewable action. No root service, LAN bind, credentials or job auto-resume.
export function noahLaunchAgent({ home, node = process.execPath } = {}) {
  if (!path.isAbsolute(home || '') || !path.isAbsolute(node) || Array.from(home + node).some(c => c.charCodeAt(0) < 32)) throw new Error('本人のホームとNodeの絶対パスを確認してください。');
  const support = path.join(home, 'Library/Application Support/avokado/Noah');
  const logs = path.join(home, 'Library/Logs/avokado/Noah');
  const launcher = path.join(support, 'noah-workspace-recovery.mjs');
  const plistPath = path.join(home, 'Library/LaunchAgents', NOAH_SERVICE_LABEL + '.plist');
  const env = { PATH: [...new Set([path.dirname(node), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':'),
    NOAH_WORKSPACE: '/Volumes/avokado', NOAH_WORKSPACE_IMAGE: '/Volumes/Extreme SSD/avokado/avokado.sparsebundle', SKY_LINUX_PRIVATE_PREVIEW: '1' };
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${NOAH_SERVICE_LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(launcher)}</string></array>
<key>WorkingDirectory</key><string>${xml(home)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ExitTimeOut</key><integer>30</integer><key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(logs,'stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs,'stderr.log'))}</string>
</dict></plist>
`;
  return { label: NOAH_SERVICE_LABEL, plistPath, launcher, logs, plist };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('準備ファイルの出力フォルダを1つ指定してください。');
    const output = path.resolve(process.argv[2]);
    const spec = noahLaunchAgent({ home: os.homedir(), node: process.env.NOAH_NODE || process.execPath });
    await mkdir(output,{recursive:true,mode:0o700});
    await writeFile(path.join(output,spec.label+'.plist'),spec.plist,{mode:0o600});
    await writeFile(path.join(output,'noah-workspace-recovery.mjs'),await readFile(new URL('./noah-workspace-recovery.mjs',import.meta.url)),{mode:0o600});
    console.log(JSON.stringify({label:spec.label,plistPath:spec.plistPath,launcher:spec.launcher,logs:spec.logs,preparedAt:output},null,2));
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
