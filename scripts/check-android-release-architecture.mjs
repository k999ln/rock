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
  shellManifest: read('android/shell/src/main/AndroidManifest.xml'),
  shellSource: read('android/shell/src/main/java/dev/rock/shell/MainActivity.java'),
  shellService: read('android/automation/src/main/java/dev/rock/automation/RockShellService.java'),
  platformService: read('android/automation/src/main/java/dev/rock/automation/RockPlatformService.java'),
  operatorManifest: read('android/operator-agent/src/main/AndroidManifest.xml'),
  operatorVerifier: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java'),
  operatorClient: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorDockClient.java'),
  operatorConfig: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentConfig.java'),
  operatorIdentity: read('android/operator-agent/src/main/java/dev/rock/operator/agent/DeviceIdentity.java'),
  operatorExecutor: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandExecutor.java'),
  operatorJob: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentJobService.java'),
  operatorDatabase: read('android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentDatabase.java'),
  operatorOverlayable: read('android/operator-agent/src/main/res/values/overlayable.xml'),
  operatorOverlayStager: read('scripts/stage-operator-agent-overlay.py'),
  phoneInputFreezer: read('scripts/freeze-phone-build-inputs.py'),
  phoneBuild: read('scripts/build-phone-bringup.sh'),
  androidBp: read('android/Android.bp'),
  physicalProduct: read('os/physical/rockstaros.mk'),
});

console.log(
  `Android構成: ${result.decisionCount}/7仕様固定、${result.componentCount} component、source/runtime/実機は未完了として整合`,
);
