// 本番の一周（spec-90 の 5 章の表）のうち、アカウントを作らずにできる行を、スマホ幅（iPhone 13）のブラウザで行う。
// scripts/noah-prod-check.mjs の loop から呼ぶ（--write の時だけ。ブラウザだけの本人を 1 つ作る）。
// 2026-11-27 の本番では、Agent の詳細の「接続」は、Noah のアカウント（パスキー・ログイン）が要る（ブラウザだけの本人は、
// 利用開始の画面へ進む）。アカウントの作成とパスワード・パスキーの入力は、この道具ではしない。だから:
// - 1: 最初の画面が横に動かず、押す所が 44px 以上。
// - 8 の前半: サインインしていない人が「接続」を押すと、利用開始の画面（パスキーで新しく始める・ログイン）へ進み、行き止まりにならない。
// - 2〜7・9〜13: アカウントが要る・審査者・実機なので、本人の端末で行う（PR 本文の表に書く）。
//   接続 → 道具 → 頼む → 成果 → 切る の流れそのものは、accept（API。ブラウザだけの本人）で毎回確かめる。

export async function noahProdLoop({ origin, outDir, playwright, measure }) {
  const { chromium, devices } = playwright;
  const rows = {};
  const notes = [];
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  const page = await context.newPage();
  const shot = async (name) => { if (outDir) await page.screenshot({ path: `${outDir}/loop-${name}.png` }).catch(() => undefined); };
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined); await page.waitForTimeout(1500); };
  try {
    // 1: 最初の画面。
    await page.goto(`${origin}/noah`, { waitUntil: 'domcontentloaded' });
    await settle();
    const first = await page.evaluate(measure);
    rows[1] = { overflow: first.overflow, small: first.small, ok: first.overflow === 0 && first.small.length === 0 };
    await shot('r1');

    // 8 の前半: 押すだけで試せる物の詳細で「接続」→ 利用開始の画面。
    const listed = await context.request.get(`${origin}/api/noah/discover?source=noah&firstJobs=1`, { headers: { Accept: 'application/json' } });
    const items = listed.ok() ? ((await listed.json()).items ?? []) : [];
    const id = items.find((item) => item.oneTap && !item.external)?.id ?? null;
    if (!id) throw new Error('押すだけで試せる物が、一覧に無い');
    const detail = `${origin}/noah/ready/agent?id=${encodeURIComponent(id)}`;
    await page.goto(detail, { waitUntil: 'domcontentloaded' });
    await settle();
    await page.getByRole('button', { name: '接続', exact: true }).first().click();
    const confirmation = page.locator('[data-noah-connect-confirmation] button', { hasText: '接続' });
    if (await confirmation.waitFor({ timeout: 2000 }).then(() => true).catch(() => false)) await confirmation.click();
    await page.waitForURL((url) => url.pathname === '/noah/account', { timeout: 20_000 });
    await settle();
    const passkey = await page.getByRole('button', { name: /パスキー/ }).count() + await page.getByRole('link', { name: /パスキー/ }).count();
    const login = await page.getByRole('button', { name: 'ログイン', exact: true }).count() + await page.getByRole('link', { name: 'ログイン', exact: true }).count();
    const returnTo = new URL(page.url()).searchParams.get('returnTo');
    const account = await page.evaluate(measure);
    rows[8] = {
      agent: id, page: '/noah/account', passkey: passkey > 0, login: login > 0, returnsTo: returnTo,
      overflow: account.overflow, small: account.small,
      ok: passkey > 0 && login > 0 && !!returnTo?.startsWith('/noah/ready/agent') && account.overflow === 0 && account.small.length === 0,
    };
    await shot('r8');
  } catch (error) {
    notes.push(`error: ${String(error?.message ?? error).slice(0, 300)}`);
    await shot('error');
  } finally {
    await browser.close();
  }
  return {
    ok: !!rows[1]?.ok && !!rows[8]?.ok, rows, notes,
    notRun: {
      '2〜7・10': 'Noah のアカウントが要る（本人の端末。流れは accept で API から確かめる）',
      '8 の後半': 'パスキーで登録して戻り、押し直さずにつながる（本人の端末）',
      9: '審査者', 11: '3 種の Agent（本人の端末）', 12: '実機', 13: '開けた直後の別のスマホ',
    },
  };
}
