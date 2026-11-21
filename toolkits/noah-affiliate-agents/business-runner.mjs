import {
  businessToday,
  businessReport,
  applyBusinessCommand,
} from './business-core.mjs';

// This runner executes the connected stages. Missing external collectors remain
// blocked, never simulated by a timer or inferred from an owner's bank name.
const topics = [
  {
    id: 'report',
    title: '定例報告の作成をsiに任せる前に整理すること',
    task: '毎月の定例報告',
    input: '元になる表の項目、集計期間、報告を読む相手',
    review: '数字の出典と合計、前月との比較、例外の説明',
    measure: '転記、下書き、確認、手直しの時間を分けて記録する',
  },
  {
    id: 'meeting',
    title: '議事録を業務で使うための導入準備',
    task: '会議の記録と次の対応の整理',
    input: '参加者の同意を得た記録、決定事項の書式、共有できる範囲',
    review: '発言者、決定事項、担当者と期限を参加者が確認する',
    measure: '下書きの時間だけでなく、誤りの修正と参加者への確認時間を計る',
  },
  {
    id: 'inquiry',
    title: '問い合わせ対応の下書きをsiで作る準備',
    task: '社内外の問い合わせへの回答下書き',
    input: '公開可能なFAQ、回答の根拠、担当者に引き継ぐ条件',
    review: '契約、料金、個人情報、例外対応は担当者が確認する',
    measure:
      '回答までの時間、差戻し件数、担当者への引継ぎ件数を同じ期間で比べる',
  },
  {
    id: 'manual',
    title: '業務マニュアルをsiで整える前の棚卸し',
    task: '作業手順の文書化と更新',
    input: '現在の手順、例外、完成の条件、改訂の責任者',
    review: '実際に作業する人が手順を試し、抜けと危険な操作がないか確認する',
    measure: '文書化に使った時間と、手順を読む人の質問・手戻りを記録する',
  },
];
export const emptyBusinessAgent = () => ({
  schema: 'noah-business-agent/1',
  enabled: false,
  runCount: 0,
  nextRunAt: null,
  lastRunAt: null,
  articles: {},
  stages: [],
  decisions: [],
  receipts: [],
});
export function runBusinessAgent(
  current,
  ledger,
  config,
  { now = Date.now(), origin } = {},
) {
  const agent = structuredClone(current),
    day = businessToday(now);
  if (!agent.enabled || agent.nextRunAt > now)
    return { agent, ledger, ran: false };
  const report = businessReport(ledger, config, now),
    totalFinal = report.campaigns.reduce(
      (n, c) => n + c.approved + c.rejected,
      0,
    );
  // Preserve the initial exploration order until enough real final decisions exist.
  const ranked = report.campaigns
    .filter((c) => c.id.startsWith('guide-') && c.approved + c.rejected >= 10)
    .sort(
      (a, b) =>
        b.cashMatchedApprovedYen -
        b.costYen -
        (a.cashMatchedApprovedYen - a.costYen),
    );
  const winning =
    totalFinal >= 20
      ? topics.find((t) => 'guide-' + t.id === ranked[0]?.id)
      : null;
  const topic =
    winning || topics[Object.keys(agent.articles).length % topics.length];
  const articleId = topic.id;
  const shouldPublish =
    !agent.articles[articleId] ||
    (agent.articles[articleId].updatedOn !== day && !!winning);
  if (shouldPublish) {
    const campaign = 'guide-' + topic.id;
    if (!Object.hasOwn(ledger.campaigns, campaign))
      ledger = applyBusinessCommand(
        ledger,
        {
          requestId: 'agent-campaign-' + topic.id,
          expectedRevision: ledger.revision,
          action: 'campaign',
          payload: {
            id: campaign,
            channel: 'web',
            landingUrl: origin + '/',
            title: topic.title,
            budgetYen: 0,
            confirmed: true,
          },
        },
        now,
      ).state;
    agent.articles[articleId] = {
      id: articleId,
      title: topic.title,
      campaign,
      updatedOn: day,
      text: [
        topic.title,
        `まず「${topic.task}」を一つ選び、現状の手順を整理します。`,
        `準備する情報：${topic.input}。社名、顧客情報、秘密情報を入力用の例から除いてください。`,
        `任せる範囲：最初は下書きや整理から始め、最終的な判断と外部送信は人が担当します。`,
        `確認すること：${topic.review}。`,
        `測ること：${topic.measure}。導入後の削減額を先に保証することはできません。`,
        '研修を検討する場合は、この業務を教材にできるか、利用サービスの情報管理、費用、研修後の運用担当を確認します。',
        '下の導入準備票で月の回数と所要時間を整理できます。整理票は申込なしでも利用できます。',
      ].join('\n\n'),
    };
  }
  agent.stages = [
    {
      id: 'acquisition',
      state: 'running',
      detail: `自社Webに${Object.keys(agent.articles).length}本の業務別案内を公開。外部SNS配信は未接続。`,
    },
    {
      id: 'consultation',
      state: 'running',
      detail: '公開入力から条件確認・相談票作成・匿名流入記録を自動処理。',
    },
    {
      id: 'referral',
      state: report.launchBlockers.length ? 'needs_setup' : 'running',
      detail:
        report.launchBlockers.join(' / ') ||
        '対象・意思・媒体条件が揃う相談だけ正式リンクへ案内。',
    },
    {
      id: 'asp_collection',
      state: 'needs_connection',
      detail:
        'レントラックスの実績取得接続が未設定。手動取込を自動取得とは扱わない。',
    },
    {
      id: 'approval_followup',
      state: report.overdue.length ? 'needs_attention' : 'waiting_for_source',
      detail: `記録済みの承認待ち超過${report.overdue.length}件。ASPによる実際の決定を待つ。`,
    },
    {
      id: 'bank_reconciliation',
      state: 'needs_connection',
      detail:
        '受取口座と銀行の読み取り専用取得経路を確認中。支払予定を実入金にしない。',
    },
    {
      id: 'improvement',
      state: 'running',
      detail: winning
        ? '実入金対応成果額と費用を比較して既存記事を更新。'
        : '確定成果が足りないため、異なる業務の案内を順に公開し実績を集める。',
    },
  ];
  agent.decisions = [
    {
      at: new Date(now).toISOString(),
      reason: winning ? '実績比較' : '初期探索',
      article: articleId,
      action: shouldPublish ? 'publish_owned_article' : 'observe',
      evidence: {
        finalDecisions: totalFinal,
        knownCostsYen: report.totals.costYen,
      },
    },
  ];
  agent.runCount++;
  agent.lastRunAt = new Date(now).toISOString();
  agent.nextRunAt = now + 15 * 60 * 1000;
  agent.receipts = [
    ...agent.receipts,
    {
      run: agent.runCount,
      at: agent.lastRunAt,
      published: shouldPublish ? articleId : null,
      fullFlowComplete: false,
      blockedStages: agent.stages
        .filter((s) => ['needs_connection', 'needs_setup'].includes(s.state))
        .map((s) => s.id),
    },
  ].slice(-100);
  return { agent, ledger, ran: true };
}
