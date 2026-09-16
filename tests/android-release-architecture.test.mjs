import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAndroidReleaseArchitecture } from '../scripts/android-release-architecture-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const fixture = () => ({
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

void test('selected Android production architecture is internally consistent and truthful', () => {
  assert.deepEqual(validateAndroidReleaseArchitecture(fixture()), {
    decisionCount: 7,
    componentCount: 8,
    specificationAligned: true,
    sourceAligned: false,
    runtimeAligned: false,
    physicalAcceptancePassed: false,
  });
});

void test('an unimplemented runtime cannot be marked aligned', () => {
  const input = fixture();
  input.policy.completion.runtimeAligned = true;
  assert.throws(() => validateAndroidReleaseArchitecture(input), /未実装を完了扱い/);
});

void test('Operator Dock cannot be placed in the user OS', () => {
  const input = fixture();
  input.policy.components.operatorDock.includedInUserOs = true;
  assert.throws(() => validateAndroidReleaseArchitecture(input), /利用者OSの外/);
});

void test('Local AI cannot receive a direct Tool Binder edge', () => {
  const input = fixture();
  input.policy.allowedBinderEdges.push('rock_local_ai_app->rock_tool_app');
  assert.throws(() => validateAndroidReleaseArchitecture(input), /許可Binder graph/);
});

void test('VTS HAL and kernel evidence cannot be removed from acceptance', () => {
  const input = fixture();
  input.policy.acceptance.compatibility.vtsKernelRequired = false;
  assert.throws(() => validateAndroidReleaseArchitecture(input), /CDD\/CTS\/CTS Verifier\/VTS/);
});

void test('SELinux package mapping cannot be granted only by runtime registration', () => {
  const input = fixture();
  input.platform.isolation.runtimeRegistrationCanGrantDomain = true;
  assert.throws(() => validateAndroidReleaseArchitecture(input), /Platform APIの現在地/);
});
