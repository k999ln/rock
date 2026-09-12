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

function renewalAnswer(subscriptions: AdvisorSubscription[], today: Date) {
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
  if (upcoming.length === 0)
    return '台帳に、これからの更新日が登録された契約はありません。';
  return [
    '**次の更新予定**',
    '',
    ...upcoming.map(
      (subscription) =>
        `- **${subscription.name}** — ${subscription.renewal_date} / ${formatSubscriptionMoney(subscription.amount, subscription.currency)}`,
    ),
    '',
    '更新日は台帳の記録です。最終確定は契約先の画面で確認してください。',
  ].join('\n');
}

function overviewAnswer(summary: AdvisorSummary) {
  return [
    '**サブスク顧問の確認結果**',
    '',
    `- 契約・候補: ${summary.counts.total}件`,
    `- 現在利用中: ${summary.counts.live}件`,
    `- 要対応: ${summary.counts.action_required}件`,
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
  if (/次|更新|期限|いつ|renew/.test(normalized))
    return renewalAnswer(subscriptions, today);
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
