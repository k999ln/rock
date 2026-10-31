import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { osNavigationItems, osRouteHref } from '../lib/os-navigation.ts';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const token = (css, name) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
// WCAG 2.2 relative luminance; compare the unrounded ratio with the threshold.
const luminance = hex => {
  const rgb = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
};

void test('Home default tokens and workspace frame keep the same white, ink and focus values', () => {
  const defaults = read('app/os-design-tokens.css');
  const frame = read('app/os-shell.css');
  for (const name of ['bg', 'panel', 'raised', 'line', 'text', 'muted', 'accent', 'accent-ink', 'focus']) {
    const expected = token(frame, `os-shell-${name}`);
    assert.ok(expected, `Frame token missing: ${name}`);
    assert.equal(token(defaults, `os-${name}`), expected, `${name} changes between Home and an OS workspace`);
  }
  assert.equal(token(frame, 'os-shell-accent'), '#151515');
  assert.equal(token(frame, 'os-shell-focus'), '#215ac2');
  assert.match(read('components/home-screen.module.css'), /--home-accent: var\(--os-accent\)/);
});

void test('canonical frame text and focus colors retain their minimum contrast on both surfaces', () => {
  const frame = read('app/os-shell.css');
  for (const surface of ['bg', 'panel']) {
    const background = token(frame, `os-shell-${surface}`);
    for (const name of ['text', 'muted', 'accent'])
      assert.ok(contrast(token(frame, `os-shell-${name}`), background) >= 4.5, `${name}/${surface} text contrast`);
    assert.ok(contrast(token(frame, 'os-shell-focus'), background) >= 3, `focus/${surface} contrast`);
  }
  for (const path of ['components/home-screen.module.css', 'components/sky-social-timeline.module.css']) {
    const source = read(path);
    assert.match(source, /--tl-muted: var\(--os-shell-muted, #595959\)/);
    assert.doesNotMatch(source, /#778077/);
  }
});

void test('shared navigation preserves three primary destinations and protects links during work', () => {
  assert.deepEqual(osNavigationItems.map(item => item.id), ['stream', 'eve', 'communities']);
  assert.equal(osRouteHref('/os/eve', '/chat'), '/os/eve');
  assert.equal(osRouteHref('/os/eve', '/sky/agents'), '/#sky-manage');
  const header = read('components/os-header.tsx'), navigation = read('components/os-app-navigation.tsx');
  assert.match(header, /href=\{homeHref\}/);
  assert.match(header, /aria-label="RockstarOS ホーム"/);
  assert.match(header, /<OsAppNavigation running=\{running\}/);
  assert.match(navigation, /aria-current=\{selected === item\.id \? 'page' : undefined\}/);
  assert.match(navigation, /aria-disabled=\{running \|\| undefined\}/);
  assert.match(navigation, /if \(running\) event\.preventDefault\(\)/);
});

void test('installation guide returns to the OS and names the actual Mini domain', () => {
  const guide = read('app/rockstaros/guide/page.tsx');
  assert.match(guide, /<Link href="\/os" className=\{styles\.brand\} aria-label="RockstarOS ホームへ戻る"/);
  assert.match(guide, /href="https:\/\/avocadomini\.si\/"/);
  assert.doesNotMatch(guide, /href="\/rockstaros">avocadoMini製品ホームへ/);
  assert.match(guide, /Macの仮想端末/);
  assert.match(guide, /バックアップ|バックアップと復元|backup/);
});

void test('service claims return through the independent account screen and name Eve consistently', () => {
  const claim = read('components/rockstar-entitlement-claim.tsx');
  const account = read('components/rockstar-account.tsx');
  const onboarding = read('app/connect/page.tsx');
  assert.match(claim, /href="\/account\?returnTo=%2Fconnect"/);
  assert.doesNotMatch(claim, /signin-with-chatgpt/);
  assert.match(account, /ChatGPTアカウントは必要ありません/);
  assert.match(account, /ユーザーIDとパスワードを使う/);
  assert.match(onboarding, /Eve/);
  assert.doesNotMatch(onboarding, /Jennifer|Zema/);
  assert.match(onboarding, /<RockstarEntitlementClaim \/>/);
  assert.match(claim, /リンクを開いただけでは登録されません/);
});

void test('shared frame overrides legacy blue workspace surfaces without replacing Tool layouts', () => {
  const frame = read('app/os-shell.css');
  assert.match(frame, /\.rock-workspace\.rock-workspace :is\(\.rock-main-column, \.rock-main\)\s*\{[^}]*background:\s*var\(--os-bg\)/);
  assert.match(frame, /\.rock-workspace\.rock-workspace \.rock-bottom-note\s*\{[^}]*background:\s*var\(--os-shell-panel\)/);
});
