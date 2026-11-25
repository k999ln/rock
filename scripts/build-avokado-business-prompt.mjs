// Build a portable prompt from the two GitHub repositories. Requires gh and Node.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const primary = 'iceiceice999/rock';
const legacy = 'k999ln/rock';
const overview = 'docs/structure/00-overview.md';
const decisions = 'docs/structure/07-decisions-from-minutes.md';
const trial = 'docs/noah/trial-300.md';
const migration = 'codex/tasks/125-noah-scout.md';
const cloudSources = [
  ['docs/structure/03-esim.md', /スマホ向けに提供|スマホ向けRockstarOSの標準導入|専用eSIMで接続|外部Agentを選|事業者網とこの照合器|実eSIM開通|仕事ごとにいくら|今月いくら|本番請求に集約/],
  ['docs/services/noah-provider-runtime.md', /^- (Goal|AMCの工程|Wallet|hardware profile依存|失敗時)/],
];
const topicWords = {
  trial: /試行|試用|初回|日本語|教育|暮らし|trial|first.use|shelf|onboard/i,
  economics: /取り分|分配|差し引|無料|有料|定期便|入金|収益|teikibin|bill|payment/i,
  agents: /系列|実行|接続|成果受領|agent|provider|runtime/i,
  mii: /\bmii\b|空間|表示層|tower|spatial|ハード|実機/i,
};
const defaultQuestions = {
  trial: '日本語の無料試行の第1段階で最初に見せる仕事と比較実験を決めたい。',
  economics: 'Noahで誰にどの価値と費用が生じるか。実入金から運営・作者・利用者の取り分まで追い、採算判断に足りない観測を特定したい。',
  mii: 'miiの声と空間操作でどの作業が改善するか。スマホとの比較と最小の実機試験を設計したい。',
  agents: 'Noahで最初に案内するAgentパッケージを選び、現在使える範囲と成果受領までの検証方法を決めたい。',
};
const focuses = {
  trial: [
    ['docs/noah/first-use-architecture.md', /公開モード|初回|QA|実測済み/],
    ['lib/noah-first-jobs.ts', /title:|input:|output:|publicAsk|continue/],
  ],
  economics: [
    ['docs/structure/05-business.md', /候補|未決|実費/],
    ['docs/noah/spec-124-teikibin-ledger.md', /原資|入金|控除|差し引|切り替え|本人確認待ち/],
  ],
  mii: [
    ['docs/structure/01-mii.md', /目的|体験|空間|受入|実機|未決/],
    ['docs/structure/02-rockstaros.md', /profile|本人|復旧|実機/],
  ],
  agents: [
    ['docs/noah/spec-127-live-agent-families.md', /系列|本番|失敗|期限/],
    ['docs/noah/first-use-architecture.md', /成果受取|実機|QA|実測済み/],
  ],
};
const [focus = 'trial', question, ...extra] = process.argv.slice(2);
if (!Object.hasOwn(focuses, focus) || extra.length) {
  console.error('使い方: node scripts/build-avokado-business-prompt.mjs [trial|economics|mii|agents] ["今回決めたいこと"]');
  process.exit(1);
}

async function api(path, ...args) {
  const { stdout } = await exec('gh', ['api', '--hostname', 'github.com', path, ...args], {
    maxBuffer: 16 * 1024 * 1024, timeout: 60_000,
  });
  return stdout.trim();
}
async function head(repo) {
  const branch = await api(`repos/${repo}`, '--jq', '.default_branch');
  const sha = await api(`repos/${repo}/commits/${encodeURIComponent(branch)}`, '--jq', '.sha');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`${repo} のコミットを特定できません`);
  return { repo, branch, sha };
}
async function excerpt({repo, sha}, path, match) {
  const result = JSON.parse(await api(`repos/${repo}/contents/${path}?ref=${sha}`));
  if (result.encoding !== 'base64' || !result.content) throw new Error(`${repo}/${path} の本文を取得できません`);
  const lines = Buffer.from(result.content, 'base64').toString('utf8').split('\n');
  const hits = lines.map((line, index) => ({line, n: index + 1})).filter(row => match.test(row.line));
  // Full author decision text can span one very long Markdown bullet. Keep each selected line intact.
  const selected = hits.slice(0, 14);
  if (path === decisions) {
    const dated = lines.map((line, index) => ({line, n: index + 1})).filter(row => /^[-\s]*20\d\d-\d\d-\d\d/.test(row.line));
    for (const row of [...dated.slice(0, 4), ...dated.filter(r => topicWords[focus].test(r.line)).slice(0, 8)]) {
      if (!selected.some(r => r.n === row.n)) selected.push(row);
    }
    selected.sort((a, b) => a.n - b.n);
  }
  return {
    repo, path, url: `https://github.com/${repo}/blob/${sha}/${path}`,
    totalLines: lines.length, matchingLines: hits.length, lines: selected.map(({n, line}) => [n, line]),
  };
}
async function metadata({repo, sha}) {
  const prefix = `repos/${repo}`;
  async function rows(path, query, paginate = true) {
    const raw = await api(`${prefix}/${path}`, ...(paginate ? ['--paginate'] : []), '--jq', query + '|@json');
    return raw ? raw.split('\n').map(row => JSON.parse(row)) : [];
  }
  const pullRow = '.[]|{number,title,url:.html_url,base:.base.ref,head:.head.sha,mergedAt:.merged_at}';
  const [branches, open, recentClosed, checks] = await Promise.all([
    rows('branches?per_page=100', '.[]|{name,sha:.commit.sha}'),
    rows('pulls?state=open&per_page=100', pullRow),
    rows('pulls?state=closed&sort=updated&direction=desc&per_page=30', pullRow, false),
    rows(`commits/${sha}/check-runs?per_page=100`, '.check_runs[]|{name,status,conclusion,url:.html_url}'),
  ]);
  const selected = (list, key) => list.filter(row => topicWords[focus].test(row[key])).slice(0, 5);
  return { branchCount: branches.length, openCount: open.length, branches: selected(branches, 'name'),
    open: selected(open, 'title'), recentClosed: selected(recentClosed, 'title'), checks };
}
try {
  const prompt = await readFile(new URL('../docs/prompts/avokado-business-design.md', import.meta.url), 'utf8');
  const heads = await Promise.all([primary, legacy].map(head));
  const shared = [
    [overview, /大きな目的|最初の目的|まだ決まっていない事|2026-11-21 に決めた事|主商品は/],
    [decisions, /正本は今後|無料のまま出す|「配給制にする」|パッケージを上|786系列/],
  ];
  const sources = await Promise.all(heads.map(async (h, i) => {
    const list = i === 0 ? [...shared, ...cloudSources, [trial, /人数の累計|人数（成果|\| [123] \||広告費|言葉と国/], ...focuses[focus]]
      : [...shared, [migration, /正本の移行|正本が分かれた後|iceiceice999.*移す/]];
    const [files, refs] = await Promise.all([
      Promise.all(list.map(([path, match]) => excerpt(h, path, match))),
      metadata(h),
    ]);
    return { ...h, ...refs, files };
  }));
  const finalHeads = await Promise.all([primary, legacy].map(head));
  if (JSON.stringify(finalHeads) !== JSON.stringify(heads)) throw new Error('取得中に既定ブランチが更新されました。再実行してください。');
  const packet = {
    checkedAt: new Date().toISOString(), focus, question: question || defaultQuestions[focus],
    coverage: '両既定ブランチを前後で照合。本文は一致した先頭14行まで、決定台帳には先頭の日付付き4件とテーマ別8件も収録。0行は要再調査。全ブランチ・open PRと最近更新のclosed PR30件からテーマに合うものを各5件まで表示。checksは既定ブランチ先端のcheck-runs。個別PR本文・統合・実行記録は必要に応じ追加確認。時点以降の稼働は未確認。',
    sources,
  };
  process.stdout.write(prompt + '\n## 取得資料\n\nquestion があれば今回の問いに使う。sources は根拠資料。行番号は各固定URLの #L に対応する。\n\n' + JSON.stringify(packet, null, 2) + '\n');
} catch (error) {
  console.error('2リポジトリの取得を完了できませんでした。' + error.message);
  process.exitCode = 1;
}
