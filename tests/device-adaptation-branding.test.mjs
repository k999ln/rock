import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const text = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bytes = (p) => readFileSync(new URL('../' + p, import.meta.url));
const contract = JSON.parse(text('data/rockstaros-device-adaptation.json'));

void test('current redesign selectively reuses legacy OS and does not transfer hardware acceptance', () => {
  assert.match(contract.designAuthority, /legacy Buildroot is a selective reuse source/);
  assert.equal(contract.hardwareAcceptanceTransferred, false);
  assert.equal(contract.newRuntimeAdapterImplemented, false);
  assert.deepEqual(contract.profiles.map((p) => p.id), [
    'pixel-10-frankel', 'avocado-mini-r5', 'avocado-pro', 'avocado-schoolbag-safety-p0',
  ]);
});

void test('company logo bytes are identical across existing company site, web and Android', () => {
  const logo = bytes(contract.brand.logoSource);
  assert.deepEqual(bytes(contract.brand.companyLogo), logo);
  assert.deepEqual(bytes('android/shell/src/main/res/drawable-nodpi/company_mark.png'), logo);
  assert.equal(createHash('sha256').update(logo).digest('hex'), contract.brand.logoSha256);
  assert.equal(contract.brand.product, 'RockstarOS');
  assert.match(text('app/layout.tsx'), /apple: '\/company-mark.png'/);
  assert.match(text('app/manifest.ts'), /name: 'RockstarOS'/);
  assert.match(text('app/layout.tsx'), /apple: '\/company-mark.png'/);
  assert.match(text('android/shell/src/main/res/values/branding.xml'), />RockstarOS</);
});

void test('company mark and exact name reach native header and both build manifests', () => {
  assert.match(text('android/shell/src/main/java/dev/rock/shell/MainActivity.java'), /companyMark.setImageResource\(R.drawable.company_mark\)/);
  for (const path of ['android/shell/src/main/AndroidManifest.xml', 'android/shell/src/aosp/AndroidManifest.xml']) {
    assert.match(text(path), /android:label="@string\/rockstaros_brand_name"/);
    assert.match(text(path), /android:icon="@drawable\/ic_rockstar"/);
  }
  assert.match(text('android/shell/src/main/res/values/service_setup.xml'), /name="rockstar_service_setup_enabled">false</);
  const setup = text('android/shell/src/main/java/dev/rock/shell/ServiceSetupActivity.java');
  assert.match(setup, /telephony\.hasCarrierPrivileges\(\)/);
  assert.match(setup, /if \(!systemAuthority && !carrierAuthority\)/);
  assert.match(setup, /ACTION_MANAGE_EMBEDDED_SUBSCRIPTIONS/);
});

void test('multiple endpoints do not duplicate base fee and safety is independent of SI billing', () => {
  assert.equal(contract.billing.monthlyBaseMinor, 1600);
  assert.equal(contract.billing.duplicateBaseFeePerDevice, false);
  assert.equal(contract.billing.extraComputeRequiresQuoteCapAndVerifiedUsage, true);
  const companion = contract.profiles.find((p) => p.id === 'avocado-schoolbag-safety-p0');
  assert.ok(companion.mustPreserve.includes('local SOS/alarm independent of LLM network and subscription'));
  assert.ok(companion.mustPreserve.includes('no purchase/payment/send authority from child voice'));
  assert.equal(companion.physicalAccepted, false);
});

void test('Mini remains self-contained and Pro hardware is not assumed from Pixel', () => {
  const mini = contract.profiles.find((p) => p.id === 'avocado-mini-r5');
  assert.ok(mini.mustPreserve.includes('no external compute hub requirement'));
  assert.equal(mini.physicalAccepted, false);
  const pro = contract.profiles.find((p) => p.id === 'avocado-pro');
  assert.equal(pro.hardwareSpecsConfirmed, false);
  assert.equal(pro.physicalAccepted, false);
});
