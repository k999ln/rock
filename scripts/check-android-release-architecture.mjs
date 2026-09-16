import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAndroidReleaseArchitecture } from './android-release-architecture-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const result = validateAndroidReleaseArchitecture({
  policy: json('data/android-release-architecture-policy.json'),
  platform: json('contracts/platform-api.json'),
  localAi: json('contracts/local-ai-runtime.json'),
  emergency: json('data/device-emergency-access-policy.json'),
  backup: json('data/android-backup-recovery-policy.json'),
  firstFlash: json('data/android-first-flash-gate.json'),
  androidAudit: json('data/android-physical-release-audit.json'),
  readiness: json('data/release-readiness.json'),
  sepolicy: read('android/sepolicy/private/rockstar_platform.te'),
  seapp: read('android/sepolicy/private/seapp_contexts'),
  automationManifest: read('android/automation/src/main/AndroidManifest.xml'),
  platformService: read('android/automation/src/main/java/dev/rock/automation/RockPlatformService.java'),
});

console.log(
  `Android構成: ${result.decisionCount}/7仕様固定、${result.componentCount} component、source/runtime/実機は未完了として整合`,
);
