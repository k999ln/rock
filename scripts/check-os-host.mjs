import { platform, arch, totalmem } from 'node:os';
import { accessSync, constants, statfsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(process.argv[2] || '.');
const fs = statfsSync(target);
let kvm = false;
try { accessSync('/dev/kvm', constants.R_OK | constants.W_OK); kvm = true; } catch { /* Report missing capability, never install/elevate automatically. */ }
const checks = {
  linux: platform() === 'linux',
  x86_64: arch() === 'x64',
  ram64GiB: totalmem() >= 64 * 1024 ** 3,
  free400GB: fs.bavail * fs.bsize >= 400 * 1000 ** 3,
  kvm,
};
console.log(JSON.stringify({ scope: 'AOSP build + local Cuttlefish, not Android APK development', checks, ready: Object.values(checks).every(Boolean) }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
