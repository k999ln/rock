import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

// These are entry points, not game APIs or evidence of title compatibility.
const sources = Object.freeze({
  ps5: 'https://www.playstation.com/ja-jp/support/games/playstation-remote-play-on-pc-and-mac/',
  xbox: 'https://www.xbox.com/en-US/consoles/remote-play',
  pro: 'https://www.rockstargames.com/VI',
});
const xboxPlay = 'https://www.xbox.com/remoteplay';
const psApp = '/Applications/PS Remote Play.app';
export const targets = Object.freeze(['ps5', 'xbox', 'pro']);

function validateTarget(target) {
  if (!targets.includes(target)) throw new Error('invalid_target');
}

function opener(platform) {
  if (platform === 'darwin') return '/usr/bin/open';
  if (platform === 'linux') return '/usr/bin/xdg-open';
  return null;
}

export function inspect(target, { platform = process.platform, exists = existsSync } = {}) {
  validateTarget(target);
  const command = opener(platform);
  const openerPresent = Boolean(command && exists(command));
  const clientPresent = target === 'ps5' && platform === 'darwin' && exists(psApp);
  const blockers = [];
  if (target === 'pro') blockers.push('gta6_pc_release_and_requirements_unconfirmed');
  if (target === 'ps5' && platform !== 'darwin') blockers.push('native_client_handoff_not_implemented_on_this_os');
  if (target === 'ps5' && platform === 'darwin' && !clientPresent) blockers.push('ps_remote_play_not_found_in_applications');
  if (!openerPresent) blockers.push('desktop_opener_unavailable');
  return {
    schemaVersion: 1,
    title: 'GTA VI',
    target,
    checkedPlatform: platform,
    platformSourceCheckedAt: '2026-10-05',
    platformSource: sources.pro,
    setupUrl: sources[target],
    officialEntryUrl: target === 'xbox' ? xboxPlay : null,
    clientPresent,
    canRequestClientHandoff: blockers.length === 0,
    blockers,
    // A local app/path check cannot observe console ownership, release, sign-in,
    // video/input, game availability, the account's entitlement, or game saves.
    consoleConnection: 'unknown',
    titleInstalledAndLicensed: 'unknown',
    controllerAndDisplayCompatibility: 'unknown',
    remotePlayTitleCompatibility: 'unverified',
    gameRunning: 'unknown',
    miniHardwareAccepted: false,
    requiredNextSteps: target === 'pro'
      ? ['Confirm an official PC release and requirements, then test the exact Pro hardware.']
      : ['Use your own PS5 or Xbox Series X|S with remote play enabled.',
         'Sign in and select the console in the official client.',
         'When the title is available and installed, verify video, audio, controller input and reconnect on the exact Mini device.'],
  };
}

function launch(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore' });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(new Error(error)); else resolve();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish('handoff_timeout');
    }, 10_000);
    child.once('error', () => finish('handoff_failed'));
    child.once('exit', (code) => finish(code === 0 ? null : 'handoff_failed'));
  });
}

// No arbitrary URL, executable, shell arguments, credentials or game automation.
// Input, streaming, disconnect and account switching belong to the official client.
export async function handoff(target, action, dependencies = {}) {
  validateTarget(target);
  if (!['setup', 'open'].includes(action)) throw new Error('invalid_action');
  const platform = dependencies.platform ?? process.platform;
  const exists = dependencies.exists ?? existsSync;
  const run = dependencies.run ?? launch;
  const report = inspect(target, { platform, exists });
  const command = opener(platform);
  if (!command || !exists(command)) return { ...report, state: 'blocked', reason: 'desktop_opener_unavailable' };
  if (action === 'open' && !report.canRequestClientHandoff) return { ...report, state: 'blocked', reason: report.blockers[0] };
  const destination = action === 'setup' ? sources[target] : target === 'ps5' ? psApp : xboxPlay;
  try {
    await run(command, [destination]);
    return { ...report, state: action === 'setup' ? 'setup_requested' : 'client_handoff_requested' };
  } catch {
    // Do not expose launcher stderr or retry an ambiguous handoff automatically.
    return { ...report, state: 'handoff_failed', reason: 'check_the_official_client_before_retrying' };
  }
}
