// 起動引数の検査の正本は lib/noah-screenless-audit.mjs へ移した（L1）。面の見分けは下の参照実装を保持する。
/**
 * Noah 画面を取らない: 面の見分けと、隔離環境の起動引数の検査。
 *
 * Design contract only. No network calls, credentials or production mutations.
 * 仕様の本文は docs/noah/spec-84-screenless.md。
 */
import type { NoahMouthKind, NoahSurface } from './noah-connect-v1.ts';

/** 手がかり。依存の名前・import・コマンドの語と突き合わせる。説明文とは突き合わせない。 */
export const NOAH_SURFACE_SIGNS: { surface: Exclude<NoahSurface, 'none' | 'terminal'>; why: string; signs: RegExp }[] = [
  {
    surface: 'own-device',
    why: '本人が使っている端末のアプリを操作する',
    signs: /^(osascript|applescript|py-applescript|pyobjc(-.*)?|quartz|appkit|atomacos|appium(-.*)?|appium-python-client|uiautomator2?|adb|adbutils|pure-python-adb|pywinauto|uiautomation|pywin32|win32gui|win32api|autoit|pyautoit|keyboard|accessibility)$/i,
  },
  {
    surface: 'screen',
    why: '画面・キーボード・マウスを操作する',
    signs: /^(pyautogui|pynput|xdotool|wmctrl|mss|pyscreeze|pymsgbox|robotjs|@nut-tree\/nut-js|@nut-tree-fork\/nut-js|nut-js|screenshot-desktop|vncdotool|pyvirtualdisplay|xvfbwrapper|tkinter|computer-use|scrot|imagegrab)$/i,
  },
  {
    surface: 'browser',
    why: 'ブラウザを操作する',
    signs: /^(playwright|playwright-core|@playwright\/test|puppeteer|puppeteer-core|selenium|selenium-webdriver|webdriverio|browser-use|chromium|chromedriver|undetected-chromedriver|@browserbasehq\/stagehand|stagehand|pyppeteer|splinter|helium|nodriver|zendriver|crawl4ai)$/i,
  },
];
const RANK: NoahSurface[] = ['none', 'terminal', 'browser', 'screen', 'own-device'];

/**
 * 実行時の依存だけを取り出す。開発用（devDependencies）、任意（optionalDependencies・extras）、
 * 別の OS だけの物（`sys_platform == "win32"` など）は入れない。入れると、使えない機能のための依存で
 * 面が上がってしまう（実測: 調べた 33 件のうち 3 件が、試験用の playwright だけで browser になる）。
 */
export function noahRuntimeDependencies(manifests: { packageJson?: string; requirementsTxt?: string; pyprojectToml?: string }): string[] {
  const names = new Set<string>();
  const add = (spec: string) => {
    const [requirement, marker = ''] = spec.split(';');
    if (/sys_platform|platform_system|os_name|extra\s*==/.test(marker)) return;
    const name = requirement.trim().split(/[<>=!~\s[(@]/)[0];
    if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) names.add(name);
  };
  if (manifests.packageJson) {
    try {
      const pkg = JSON.parse(manifests.packageJson) as { dependencies?: Record<string, string> };
      for (const name of Object.keys(pkg.dependencies ?? {})) names.add(name);
    } catch {
      // 読めない manifest は、依存なしとして扱う
    }
  }
  for (const line of (manifests.requirementsTxt ?? '').split(/\r?\n/)) {
    const spec = line.split('#')[0].trim();
    if (spec && !spec.startsWith('-')) add(spec);
  }
  if (manifests.pyprojectToml) {
    // [project] の dependencies = [ ... ] だけを読む。optional-dependencies と dependency-groups は読まない。
    const m = /^\[project\][\s\S]*?^dependencies\s*=\s*\[([\s\S]*?)^\s*\]/m.exec(manifests.pyprojectToml);
    for (const item of m?.[1].matchAll(/["']([^"']+)["']/g) ?? []) add(item[1]);
  }
  return [...names].sort();
}

/**
 * その Agent が使おうとする面（wants）を、依存・import・コマンドから読む。何も実行しない。
 * 強い方を採る（own-device ＞ screen ＞ browser ＞ terminal）。
 * これは手がかりで、決定ではない。依存にあっても、その機能を使わずに仕事ができる Agent が多い
 * （今の対応 13 件のうち 5 件が playwright か mss を依存に持つが、画面の無い隔離環境で成果を返している）。
 * 接続要件に書く面は decideNoahSurface で決める。
 */
export function classifyNoahSurface(input: { mouth: NoahMouthKind; dependencies?: string[]; imports?: string[]; commands?: string[] }): {
  surface: NoahSurface;
  reasons: string[];
} {
  if (input.mouth === 'mcp-remote' || input.mouth === 'space-mcp' || input.mouth === 'a2a') return { surface: 'none', reasons: ['相手のサーバーで動く'] };
  let surface: NoahSurface = 'terminal';
  const reasons: string[] = [];
  const names = [
    ...(input.dependencies ?? []).map((d) => d.trim().split(/[<>=!~\s;[]/)[0]),
    ...(input.imports ?? []).map((i) => (i.trim().startsWith('@') ? i.trim().split('/').slice(0, 2).join('/') : i.trim().split(/[./]/)[0])),
    ...(input.commands ?? []).map((c) => c.trim().split(/\s+/)[0].split('/').pop() ?? ''),
  ].filter(Boolean);
  for (const name of names) {
    for (const rule of NOAH_SURFACE_SIGNS) {
      if (!rule.signs.test(name)) continue;
      reasons.push(`${name}: ${rule.why}`);
      if (RANK.indexOf(rule.surface) > RANK.indexOf(surface)) surface = rule.surface;
    }
  }
  if (!reasons.length) reasons.push('画面を使う手がかりが無い');
  return { surface, reasons };
}

/**
 * 接続要件に書く面を決める。
 * 1) 相手のサーバーで動く口 → none。
 * 2) 審査済みの実行の定義がある（今の RECIPES、noah-terminal/1）、または、画面の無い隔離環境での見本の 1 往復が通った → terminal。
 *    使おうとした面が terminal より強ければ、動かない機能として notes に残す（カードに 1 行出す）。
 * 3) それ以外 → 使おうとする面のまま（browser・screen は専用の端末の中の画面が要る。own-device はつなげない）。
 */
export function decideNoahSurface(input: { mouth: NoahMouthKind; wants: NoahSurface; reviewedHeadless: boolean; sampleRunOk: boolean }): {
  surface: NoahSurface;
  note: string | null;
} {
  if (input.mouth === 'mcp-remote' || input.mouth === 'space-mcp' || input.mouth === 'a2a') return { surface: 'none', note: null };
  if (input.reviewedHeadless || input.sampleRunOk) {
    const lost = input.wants === 'browser' ? 'ブラウザを使う機能は動きません。' : input.wants === 'screen' || input.wants === 'own-device' ? '画面を操作する機能は動きません。' : null;
    return { surface: 'terminal', note: lost };
  }
  return { surface: input.wants === 'none' ? 'terminal' : input.wants, note: null };
}

/** 面ごとに、動かしてよい置き場所。own-device は置き場所が無い。 */
export function noahPlacesForSurface(surface: NoahSurface): ('provider' | 'home' | 'cloud' | 'pocket')[] {
  if (surface === 'none') return ['provider'];
  if (surface === 'terminal') return ['home', 'cloud', 'pocket'];
  if (surface === 'browser') return ['home', 'cloud'];   // 専用の端末の中のブラウザ。task 91 の後
  if (surface === 'screen') return ['home'];             // 専用の端末の中の仮想の画面。task 91 の後
  return [];
}

export { auditNoahContainerArgs, auditNoahVmArgs } from '../../lib/noah-screenless-audit.mjs';
