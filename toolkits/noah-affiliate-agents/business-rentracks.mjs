import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { businessToday } from './business-core.mjs';

const headers = [
  'No',
  'クリック日時',
  '売上日時',
  '売上番号',
  '広告主',
  'プロダクト',
  '売上額',
  '報酬額',
  '状況',
  '期限',
  '承認日',
  '備考',
  'サイトID',
  'サイト名',
  'デバイス',
  'リファラー',
  '拒否理由',
];
const payHeaders = [
  '対象月度',
  '獲得報酬額(税込)',
  '支払報酬累計額(税込)',
  '早期支払指示額(税込)',
  '手数料(税込)',
  '早期支払額(税込)',
  '早期支払日',
  '差額報酬支払額(税込)',
  '支払予定日',
  '支払報酬額(税込)',
  '支払通知書',
];
const check = (v, message) => {
  if (!v) throw new Error(message);
};
const yen = (v) => {
  check(
    typeof v === 'string' &&
      /^(?:¥|￥)?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(v),
    '金額形式が変わりました。',
  );
  const n = Number(v.replace(/[¥￥,]/g, ''));
  check(Number.isSafeInteger(n) && n <= 100000000, '金額上限です。');
  return n;
};
const date = (v) => {
  const m =
    /^(\d{4})\/(\d{2})\/(\d{2})(?:（[月火水木金土日]） \d{2}:\d{2}:\d{2})?$/.exec(
      v,
    );
  check(m, '日付形式が変わりました。');
  const d = m.slice(1).join('-');
  check(
    Number.isFinite(Date.parse(d)) &&
      new Date(d).toISOString().slice(0, 10) === d,
    '日付が不正です。',
  );
  return d;
};

// Consumes ONLY tables and form values read through the supported Chrome UI.
// It has no browser, cookie, credential, login, or ASP HTTP access of its own.
export function normalizeRentracksCapture(capture, target) {
  check(
    capture &&
      Array.isArray(capture.headers) &&
      Array.isArray(capture.rows) &&
      Number.isFinite(Date.parse(capture.capturedAt)),
    '取得画面が不正です。',
  );
  const sha256 = createHash('sha256')
    .update(JSON.stringify(capture))
    .digest('hex');
  const base = {
    schema: 'noah-source-observation/1',
    sourceUrl: capture.sourceUrl,
    observedAt: capture.capturedAt,
    sha256,
  };
  if (capture.sourceUrl === 'https://manage.rentracks.jp/manage/detail_pay') {
    check(
      JSON.stringify(capture.headers) === JSON.stringify(payHeaders),
      '支払画面の見出しが変わりました。',
    );
    check(
      capture.rows.length === 1 &&
        capture.rows[0].includes('小計') &&
        capture.rows[0].filter((x) => x.trim()).join('|') === '小計|¥0',
      '支払通知書と成果内訳の取得が必要です。',
    );
    return {
      ...base,
      stream: 'rentracks_payouts',
      scope: null,
      summary: {
        totalRows: 0,
        targetRows: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      },
      rows: [],
    };
  }
  check(
    capture.sourceUrl === 'https://manage.rentracks.jp/manage/detail_sales' &&
      JSON.stringify(capture.headers) === JSON.stringify(headers),
    '注文画面の見出しが変わりました。',
  );
  const get = (id) => {
    const matches = capture.filters?.filter((f) => f.id === id);
    check(
      matches?.length === 1 && Array.isArray(matches[0].selected),
      '取得フィルタが不足しています。',
    );
    return matches[0].selected;
  };
  check(
    get('idDropdownlist1').length === 0 &&
      get('idDropdownlist2').join() === '0' &&
      get('idDropdownlist3').join() === '----' &&
      ['idFilter1', 'idFilter2', 'idFilter3', 'idFilter4'].every(
        (id) =>
          capture.states?.filter((s) => s.id === id && s.checked === true)
            .length === 1,
      ),
    '全媒体・全広告主・全状態で取得してください。',
  );
  const formDate = (prefix) =>
    date(
      ['Year', 'Month', 'Day']
        .map((k, i) =>
          get('id' + prefix + k)
            .join()
            .padStart(i ? 2 : 4, '0'),
        )
        .join('/'),
    );
  const basis = get('idTermType').join();
  check(
    ['0', '1'].includes(basis) && get('idTermSelect').join() === '0',
    '期間指定が不明です。',
  );
  const pageSize = Number(get('idPageSize').join());
  check(
    Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 2000,
    '表示件数が不正です。',
  );
  const data = capture.rows.slice(0, -1),
    footer = capture.rows.at(-1);
  check(
    footer?.length === headers.length &&
      footer[5] === '小計' &&
      data.length < pageSize &&
      data.length <= 2000 &&
      data.every(
        (r, i) => r.length === headers.length && r[0] === String(i + 1),
      ),
    '小計または全件取得を確認できません。期間を分割してください。',
  );
  check(
    data.reduce((n, r) => n + yen(r[7]), 0) === yen(footer[7]),
    '報酬小計が一致しません。',
  );
  const states = {
    保留: 'pending',
    拒否: 'rejected',
    承認済: 'approved',
    承認: 'approved',
  };
  const summary = {
    totalRows: data.length,
    targetRows: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  const rows = [],
    seen = new Set();
  check(
    target &&
      typeof target.offerId === 'string' &&
      typeof target.productName === 'string' &&
      target.productName.trim(),
    '対象案件名の対応が必要です。',
  );
  for (const r of data) {
    check(
      /^\d+$/.test(r[3]) && !seen.has(r[3]) && Object.hasOwn(states, r[8]),
      '成果IDの重複または未知の状態です。',
    );
    seen.add(r[3]);
    const status = states[r[8]];
    summary[status]++;
    // Other media and offers remain local and never contribute to Noah revenue.
    if (
      r[5] !== target.productName ||
      (target.siteId && r[12] !== target.siteId)
    )
      continue;
    rows.push({
      id: r[3],
      offerId: target.offerId,
      uix:
        target.siteId &&
        r[12] === target.siteId &&
        /^nb\.[a-f0-9]{32}$/.test(r[11])
          ? r[11]
          : null,
      occurredOn: date(r[2]),
      status,
      rewardYen: yen(r[7]),
      decisionOn: status === 'pending' ? null : date(r[10]),
      reason: r[16] || null,
      observedOn: businessToday(Date.parse(capture.capturedAt)),
      sourceRef: 'rentracks.sha256.' + sha256 + '.order.' + r[3],
    });
  }
  summary.targetRows = rows.length;
  return {
    ...base,
    stream: basis === '0' ? 'rentracks_orders' : 'rentracks_approvals',
    scope: {
      from: formDate('Gogo'),
      to: formDate('Done'),
      dateBasis: basis === '0' ? 'sales' : 'decision',
      allSites: true,
      allStates: true,
    },
    summary,
    rows,
  };
}

export async function syncRentracksCapture(
  inputPath,
  targetPath,
  secretsPath,
  receiptPath,
) {
  check(
    ((await stat(secretsPath)).mode & 0o077) === 0,
    '秘密ファイルは所有者だけが読める権限にしてください。',
  );
  const [capture, target, secrets] = await Promise.all(
    [inputPath, targetPath, secretsPath].map(async (p) =>
      JSON.parse(await readFile(p, 'utf8')),
    ),
  );
  const observation = normalizeRentracksCapture(capture, target);
  check(
    typeof secrets.OPERATIONS_TOKEN === 'string' &&
      secrets.OPERATIONS_TOKEN.length >= 32,
    '運営接続の鍵がありません。',
  );
  const response = await fetch(
    'https://noah-business-si.mr-kirin999.workers.dev/operations/api',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + secrets.OPERATIONS_TOKEN,
      },
      body: JSON.stringify({ action: 'source_observation', observation }),
    },
  );
  check(response.ok, '取得記録の保存に失敗しました: HTTP ' + response.status);
  const receipt = await response.json();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  return {
    stream: observation.stream,
    summary: observation.summary,
    duplicate: receipt.duplicate,
  };
}
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    check(
      process.argv.length === 6,
      '引数: capture.private.json target.private.json secrets.private.json receipt.private.json',
    );
    console.log(
      JSON.stringify(await syncRentracksCapture(...process.argv.slice(2))),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
