#!/usr/bin/env node
// macOS operator service. Secrets stay in the untracked, mode-0600 runtime env file.
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

export const COLLECTOR_SERVICE_LABEL = 'si.avoado.noah-agent-collector';
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function collectorServicePlist({ node, script, directory, envFile, origin }) {
  const args = [node, `--env-file=${envFile}`, '--experimental-strip-types', script, '--watch', '--dir', directory, '--publish', origin];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${COLLECTOR_SERVICE_LABEL}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(dirname(script))}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>60</integer><key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(join(directory, 'service.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(directory, 'service-error.log'))}</string>
</dict></plist>\n`;
}

function main() {
  const { values } = parseArgs({ options: { install: { type: 'boolean' }, stop: { type: 'boolean' }, status: { type: 'boolean' }, dir: { type: 'string' }, 'env-file': { type: 'string' }, origin: { type: 'string' } } });
  if (process.platform !== 'darwin') throw Error('collector_service_requires_macos');
  const target = `gui/${process.getuid()}/${COLLECTOR_SERVICE_LABEL}`;
  if (values.status) { execFileSync('launchctl', ['print', target], { stdio: 'inherit' }); return; }
  if (values.stop) { execFileSync('launchctl', ['bootout', target], { stdio: 'inherit' }); return; }
  if (!values.install || !values.dir || !values['env-file'] || !values.origin) throw Error('collector_service_arguments');
  const directory = resolve(values.dir), envFile = resolve(values['env-file']);
  const file = statSync(envFile);
  if (!file.isFile() || file.mode & 0o077) throw Error('collector_service_env_permissions');
  const origin = new URL(values.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('collector_service_origin');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const plist = join(homedir(), 'Library/LaunchAgents', `${COLLECTOR_SERVICE_LABEL}.plist`);
  mkdirSync(dirname(plist), { recursive: true });
  const script = fileURLToPath(new URL('./noah-agent-collector.mjs', import.meta.url));
  const content = collectorServicePlist({ node: process.execPath, script, directory, envFile, origin: origin.origin });
  writeFileSync(plist, content, { mode: 0o600 });
  try { execFileSync('launchctl', ['bootout', target], { stdio: 'ignore' }); } catch { /* first installation */ }
  execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plist], { stdio: 'inherit' });
  console.log(JSON.stringify({ installed: true, label: COLLECTOR_SERVICE_LABEL, directory }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message.startsWith('collector_service_') ? error.message : 'collector_service_failed'); process.exitCode = 1; }
}
