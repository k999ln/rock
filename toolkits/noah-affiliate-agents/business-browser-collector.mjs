// Run only inside the supported CUA session with an already selected Chrome Tab.
// This module never starts a browser, reads cookies, or accesses browser internals.
import { businessToday } from './business-core.mjs';
import { normalizeRentracksCapture } from './business-rentracks.mjs';

const salesUrl = 'https://manage.rentracks.jp/manage/detail_sales';
const payUrl = 'https://manage.rentracks.jp/manage/detail_pay';
const check = (yes, message) => {
  if (!yes) throw new Error(message);
};

export async function collectRentracks(
  tab,
  target,
  { now = Date.now(), from, to = businessToday(now) } = {},
) {
  from ||= new Date(Date.parse(to) - 364 * 86400000).toISOString().slice(0, 10);
  for (const d of [from, to])
    check(
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        Number.isFinite(Date.parse(d)) &&
        new Date(d).toISOString().slice(0, 10) === d,
      '取得日付が不正です。',
    );
  check(
    from <= to &&
      Date.parse(to) - Date.parse(from) < 365 * 86400000 &&
      to <= businessToday(now),
    '取得期間は過去365日以内で指定してください。',
  );
  check(
    new URL(await tab.url()).origin === 'https://manage.rentracks.jp',
    '既存の認証済みレントラックスタブを指定してください。',
  );
  const captured = [];
  if ((await tab.url()) !== salesUrl) await tab.goto(salesUrl);
  let page = await tab.playwright.domSnapshot();
  check(
    page.includes('ログアウト') &&
      page.includes('注文リスト') &&
      page.includes('ダウンロード'),
    'ASPの認証済み注文画面を確認できません。',
  );
  // Every selector/value below was observed in the live official form. Changes
  // fail normally; there is no forced click, hidden endpoint, or auth fallback.
  check(
    await tab.playwright.evaluate(
      () =>
        document.querySelector('#idDropdownlist1')?.selectedOptions.length ===
        0,
    ),
    '全媒体の選択状態が必要です。',
  );
  await tab.playwright.locator('#idDropdownlist2').selectOption('0');
  await tab.playwright.locator('#idDropdownlist3').selectOption('----');
  await tab.playwright.locator('#idTermSelect').selectOption('0');
  await tab.playwright.locator('#idPageSize').selectOption('2000');
  for (const [prefix, d] of [
    ['Gogo', from],
    ['Done', to],
  ]) {
    const parts = d.split('-');
    for (const [i, name] of ['Year', 'Month', 'Day'].entries())
      await tab.playwright
        .locator('#id' + prefix + name)
        .selectOption(String(Number(parts[i])));
  }
  for (const name of ['保留', '拒否', '承認済', '請求済'])
    await tab.playwright.getByRole('checkbox', { name, exact: true }).check();
  for (const basis of ['0', '1']) {
    await tab.playwright.locator('#idTermType').selectOption(basis);
    await tab.playwright
      .getByRole('button', { name: '再表示', exact: true })
      .click();
    page = await tab.playwright.domSnapshot();
    check(
      page.includes('ログアウト') &&
        page.includes('売上番号') &&
        !page.includes('対象期間が３６５日間を超えています'),
      'ASPの注文取得に失敗しました。',
    );
    const table = await tab.playwright.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table')).filter(
        (t) =>
          t.innerText.includes('売上番号') && t.innerText.includes('拒否理由'),
      );
      if (tables.length !== 1)
        throw new Error('注文表を一意に確認できません。');
      const t = tables[0];
      return {
        headers: Array.from(t.rows[0].cells).map((c) => c.innerText.trim()),
        // Click time, advertiser/site names, device and referrer stay out of the capture.
        rows: Array.from(t.rows)
          .slice(1)
          .map((r) =>
            Array.from(r.cells).map((c, i) =>
              [1, 4, 13, 14, 15].includes(i) ? '' : c.innerText.trim(),
            ),
          ),
        filters: Array.from(document.querySelectorAll('select')).map((s) => ({
          id: s.id,
          selected: Array.from(s.selectedOptions).map((o) => o.value),
        })),
        states: Array.from(
          document.querySelectorAll('input[type=checkbox]'),
        ).map((e) => ({ id: e.id, checked: e.checked })),
      };
    });
    const c = {
      capturedAt: new Date().toISOString(),
      sourceUrl: await tab.url(),
      ...table,
    };
    const b = normalizeRentracksCapture(c, target);
    check(
      b.scope.from === from &&
        b.scope.to === to &&
        b.scope.dateBasis === (basis === '0' ? 'sales' : 'decision'),
      '画面の取得期間が要求と異なります。',
    );
    captured.push(c);
  }
  await tab.goto(payUrl);
  page = await tab.playwright.domSnapshot();
  check(
    page.includes('ログアウト') && page.includes('支払報酬額(税込)'),
    'ASP支払画面を確認できません。',
  );
  const table = await tab.playwright.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).filter((t) =>
      t.innerText.includes('対象月度'),
    );
    if (tables.length !== 1) throw new Error('支払表を一意に確認できません。');
    const t = tables[0];
    return {
      headers: Array.from(t.rows[0].cells).map((c) => c.innerText.trim()),
      rows: Array.from(t.rows)
        .slice(1)
        .map((r) => Array.from(r.cells).map((c) => c.innerText.trim())),
    };
  });
  const c = {
    capturedAt: new Date().toISOString(),
    sourceUrl: await tab.url(),
    ...table,
  };
  normalizeRentracksCapture(c, target);
  captured.push(c);
  return captured;
}
