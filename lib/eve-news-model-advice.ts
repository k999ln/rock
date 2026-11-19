import capabilities from '../data/llm-capabilities.json' with { type: 'json' };
import { evidenceSuiteVersion } from '../toolkits/eve-news/evidence-evaluation-cases.mjs';
export type NewsReviewEvaluation = {
  suite: string; fixtureSha256: string; recordedAt?: string;
  profiles: { name: string; digest: string; cases: number; criteriaPassed: number; fixtureCriteriaPassed: boolean }[];
};
export function newsReviewModelAdvice(name: string, digest: string, now = Date.now(), evaluation: NewsReviewEvaluation = capabilities.eveNewsModel.evidenceReviewEvaluation) {
  const base = { automaticReviewerAccepted: false as const, suite: evaluation.suite, fixtureSha256: evaluation.fixtureSha256, recordedAt: evaluation.recordedAt ?? null };
  if (!name.trim()) return { ...base, status: 'not_selected' as const, message: '照合モデルを指定すると、この用途の測定結果を確認できます。' };
  if (!/^[a-f0-9]{64}$/.test(digest)) return { ...base, status: 'digest_required' as const, message: '64桁のhashで重みの版を指定してください。モデル名だけでは評価を適用できません。' };
  const profile = evaluation.profiles.find(p => p.name === name && p.digest === digest);
  if (!profile) return { ...base, status: evaluation.profiles.some(p => p.name === name) ? 'different_digest' as const : 'unmeasured' as const,
    message: evaluation.profiles.some(p => p.name === name) ? '同じモデル名の測定がありますが、指定した重みの版は未評価です。以前の成績は引き継ぎません。' : 'このモデルと重みの版は、この8ケースsuiteの評価記録がありません。他用途の成績は適用しません。' };
  const measuredAt = Date.parse(evaluation.recordedAt ?? '');
  if (evaluation.suite !== evidenceSuiteVersion || !Number.isFinite(measuredAt) || measuredAt > now + 300000 || now - measuredAt > 30 * 86400000)
    return { ...base, status: 'stale' as const, message: '評価の版・測定日時・有効期間を確認できません。現在の用途評価としては使えません。' };
  if (profile.cases !== 8 || !Number.isInteger(profile.criteriaPassed) || profile.criteriaPassed < 0 || profile.criteriaPassed > profile.cases)
    return { ...base, status: 'incomplete' as const, message: '必要な8ケースの測定を確認できません。未評価として扱います。' };
  return { ...base, status: profile.fixtureCriteriaPassed && profile.criteriaPassed === profile.cases ? 'fixture_only' as const : 'failed' as const,
    cases: profile.cases, criteriaPassed: profile.criteriaPassed,
    message: profile.fixtureCriteriaPassed && profile.criteriaPassed === profile.cases ? '架空ケースの条件に一致しました。実際のニュースの真偽・政治的公平性・独立性は未受入です。' : '架空ケースの条件を満たさず、ニュース照合担当として未採用です。手動の試験でも結果の確認が必要です。' };
}
