export type AdvisorAlert = {
  severity: 'critical' | 'warning' | 'info';
  subscription: string;
  message: string;
};

export type AdvisorSummary = {
  counts: {
    total: number;
    live: number;
    active: number;
    action_required: number;
  };
  monthly_totals: Record<string, number>;
  alerts: AdvisorAlert[];
  coverage: {
    complete: boolean;
    discovery_complete: boolean;
    future_ready: boolean;
    source_counts: {
      total: number;
      resolved: number;
      imported: number;
      unresolved: number;
    };
    unresolved_sources: string[];
    transactions_imported: number;
    evidence_records: number;
    historical_subscriptions: number;
    renewal_dates: {
      required: number;
      known: number;
      missing: number;
    };
  };
  offline: boolean;
};

export type AdvisorSubscription = {
  id: number;
  name: string;
  status: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  renewal_date: string | null;
};

export function formatSubscriptionMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function monthlyAnswer(summary: AdvisorSummary) {
  const totals = Object.entries(summary.monthly_totals);
  if (totals.length === 0) return '現在、月額換算できる有料契約はありません。';
  return [
    '**現在の月額換算**',
    '',
    ...totals.map(
      ([currency, amount]) =>
        `- ${currency}: ${formatSubscriptionMoney(amount, currency)}`,
    ),
    '',
    '通貨は為替換算せず、別々に表示しています。',
  ].join('\n');
}

function actionAnswer(summary: AdvisorSummary) {
  if (summary.alerts.length === 0)
    return '現在、支払い・更新の要対応はありません。';
  return [
    `**要対応は${summary.alerts.length}件です。**`,
    '',
    ...summary.alerts.map(
      (alert) => `- **${alert.subscription}** — ${alert.message}`,
    ),
    '',
    'Skyから支払い・解約は実行しません。内容を確認して、各契約先で本人が対応してください。',
  ].join('\n');
}

function renewalAnswer(
  summary: AdvisorSummary,
  subscriptions: AdvisorSubscription[],
  today: Date,
) {
  const todayText = today.toISOString().slice(0, 10);
  const upcoming = subscriptions
    .filter(
      (subscription) =>
        !!subscription.renewal_date &&
        subscription.renewal_date >= todayText &&
        !['cancelled', 'expired', 'free'].includes(subscription.status),
    )
    .toSorted((left, right) =>
      (left.renewal_date || '').localeCompare(right.renewal_date || ''),
    )
    .slice(0, 5);
  const lines = upcoming.length
    ? [
        '**次の更新予定**',
        '',
        ...upcoming.map(
          (subscription) =>
            `- **${subscription.name}** — ${subscription.renewal_date} / ${formatSubscriptionMoney(subscription.amount, subscription.currency)}`,
        ),
      ]
    : ['台帳に、これからの更新日が登録された契約はありません。'];
  if (summary.coverage.renewal_dates.missing > 0)
    lines.push(
      '',
      `ただし、継続契約${summary.coverage.renewal_dates.missing}件は更新日が未登録です。これらを埋めるまで将来の更新管理は完了ではありません。`,
    );
  lines.push(
    '',
    '更新日は台帳の記録です。最終確定は契約先の画面で確認してください。',
  );
  return lines.join('\n');
}

function coverageAnswer(summary: AdvisorSummary) {
  const coverage = summary.coverage;
  if (coverage.complete)
    return [
      '**台帳上の全網羅チェックは完了しています。**',
      '',
      `- 情報源: ${coverage.source_counts.resolved}/${coverage.source_counts.total}確認済み`,
      `- 取込明細: ${coverage.transactions_imported}件`,
      `- 過去・解約済み: ${coverage.historical_subscriptions}件`,
      `- 継続契約の更新日: ${coverage.renewal_dates.known}/${coverage.renewal_dates.required}件`,
      '',
      'これは登録した情報源と確認期間の範囲での完了です。新しいカードや契約を追加したら再確認してください。',
    ].join('\n');
  return [
    '**まだ全網羅ではありません。**',
    '',
    `- 情報源: ${coverage.source_counts.resolved}/${coverage.source_counts.total}確認済み`,
    `- 取込明細: ${coverage.transactions_imported}件`,
    `- 過去・解約済み: ${coverage.historical_subscriptions}件`,
    `- 更新日未登録: ${coverage.renewal_dates.missing}件`,
    '',
    coverage.unresolved_sources.length
      ? `未確認: ${coverage.unresolved_sources.join('、')}`
      : '情報源の確認は完了していますが、更新日の不足が残っています。',
    '',
    '未確認が1つでも残る間、Skyは「全網羅」と判定しません。',
  ].join('\n');
}

function historyAnswer(subscriptions: AdvisorSubscription[]) {
  const historical = subscriptions.filter((subscription) =>
    ['expired', 'cancelled'].includes(subscription.status),
  );
  if (historical.length === 0)
    return '過去・解約済みとして登録されたサブスクはまだありません。';
  return [
    `**過去・解約済みは${historical.length}件です。**`,
    '',
    ...historical
      .slice(0, 10)
      .map((subscription) => `- **${subscription.name}**`),
    historical.length > 10 ? `- ほか${historical.length - 10}件` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function overviewAnswer(summary: AdvisorSummary) {
  return [
    '**サブスク顧問の確認結果**',
    '',
    `- 契約・候補: ${summary.counts.total}件`,
    `- 現在利用中: ${summary.counts.live}件`,
    `- 要対応: ${summary.counts.action_required}件`,
    `- 全網羅チェック: ${summary.coverage.source_counts.resolved}/${summary.coverage.source_counts.total}情報源`,
    '',
    monthlyAnswer(summary),
  ].join('\n');
}

export function answerSubscriptionQuestion(
  question: string,
  summary: AdvisorSummary,
  subscriptions: AdvisorSubscription[],
  today = new Date(),
) {
  const normalized = question.trim().toLocaleLowerCase('ja-JP');
  if (!normalized) return '質問を入力してください。';
  if (/解約|キャンセル|止めたい|退会/.test(normalized))
    return [
      'Skyは誤操作を防ぐため、**解約を自動実行しません**。',
      '',
      actionAnswer(summary),
      '',
      '解約したい契約名を含めて質問すると、台帳を見ながら確認項目を一緒に整理できます。',
    ].join('\n');
  if (/要対応|未払い|失敗|支払い|警告|アラート/.test(normalized))
    return actionAnswer(summary);
  if (/全網羅|網羅|見落とし|漏れ|未確認|拾えて|全部.*(入|取|管理)/.test(normalized))
    return coverageAnswer(summary);
  if (/過去|昔|以前|解約済み|終了した/.test(normalized))
    return historyAnswer(subscriptions);
  if (/次|更新|期限|いつ|renew/.test(normalized))
    return renewalAnswer(summary, subscriptions, today);
  if (/月額|いくら|費用|金額|合計|毎月|cost/.test(normalized))
    return monthlyAnswer(summary);
  if (/全部|一覧|全体|要約|状況|何件|summary/.test(normalized))
    return overviewAnswer(summary);
  return [
    '私はSkyの**サブスク顧問**です。PC内の台帳を参照して、次の質問に答えられます。',
    '',
    '- 今月いくら？',
    '- 要対応は？',
    '- 次の更新は？',
    '- 全体を要約して',
    '',
    '税務判断、支払い、解約は実行せず、確認材料だけを返します。',
  ].join('\n');
}
