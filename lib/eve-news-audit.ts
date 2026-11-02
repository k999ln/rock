import { validatePacket, validateDraft } from '../toolkits/eve-news/news-core.mjs';
import { inspectNewsCoverage, type NewsCoverage } from './eve-news-coverage.ts';
import { WorkError } from './workflow.ts';
export type NewsSource = { discovery?: {provider:string;seenAt:string;stale:boolean;verification:string}; sourceId: string; canonicalUrl: string; publisherOrSpeaker: string; sourceType: string; publishedAtOrUnknown: string; retrievedAt: string; contentHashOrReference: string; rightsScope: string; language: string; excerpt: string };
export type NewsPacket = { jobId: string; topic: string; sources: NewsSource[] };
export type NewsDraft = { jobId: string; headline: string; articleText: string; modelProfileIdAndHash: string; generatedAt: string; claimLedger: { id: string; text: string; type: string; evidenceState: string; sourceIds: string[]; reason: string }[]; unresolvedQuestions: string[]; reviewStatus: 'needs_human_review'; publicationStatus: 'not_published' };
export type NewsAudit = { coverage?: NewsCoverage; schema: 'eve.news-audit/1'; checkedAt: string; checks: { id: string; passed: boolean; detail: string }[]; warnings: string[]; unusedSourceIds: string[]; semanticTruth: 'not_verified'; politicalFairness: 'not_evaluated'; publication: 'not_published' };
export function cleanNewsInput(packet: unknown, draft: unknown, model: unknown) {
  try {
    if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('model label');
    const clean = validatePacket(packet) as NewsPacket;
    for (const source of clean.sources) {
      const url = new URL(source.canonicalUrl), host = url.hostname.toLowerCase();
      if (!host.includes('.') || host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host) || host.endsWith('.') || /\.(localhost|local|internal|test|invalid)$/.test(host) || url.port)
        throw new Error('public source reference');
      url.hash = '';
      const tracking=Array.from(url.searchParams.keys()).filter(key=>/^(utm_|fbclid$|gclid$)/i.test(key));
      for (const key of tracking) url.searchParams.delete(key);
      source.canonicalUrl = url.href;
    }
    if (draft && typeof draft === 'object' && 'jobId' in draft && draft.jobId !== clean.jobId) throw new Error('source packet ID');
    const result = validateDraft(clean, draft, model.trim()) as NewsDraft;
    return { packet: clean, draft: result };
  } catch { throw new WorkError('資料・草稿の形式、出典ID、利用権、公開HTTPS参照を確認してください。'); }
}
/** Reference/chronology checks only. No network lookup, semantic fact verification or ideology classifier. */
export function auditNewsDraft(packet: NewsPacket, draft: NewsDraft, now = Date.now()): NewsAudit {
  const coverage=inspectNewsCoverage(packet,draft);
  const used = new Set(draft.claimLedger.flatMap(claim => claim.sourceIds));
  const unusedSourceIds = packet.sources.filter(source => !used.has(source.sourceId)).map(source => source.sourceId);
  const corrections = packet.sources.filter(source => source.sourceType === 'correction_or_retraction' && !used.has(source.sourceId));
  const utc = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z','Z') === value.replace('.000Z','Z');
  const timeValid = packet.sources.every(source => utc(source.retrievedAt) && Date.parse(source.retrievedAt) <= now + 300000 && (source.publishedAtOrUnknown === 'unknown' || utc(source.publishedAtOrUnknown) && Date.parse(source.publishedAtOrUnknown) <= Date.parse(source.retrievedAt) + 300000));
  const warnings: string[] = [];
  if (unusedSourceIds.length) warnings.push('草稿が参照していない資料: ' + unusedSourceIds.join(', '));
  for (const source of packet.sources) {
    if (source.publishedAtOrUnknown === 'unknown') warnings.push(source.sourceId + ': 公開時刻は不明です。取得時刻とは区別してください。');
    else if (now - Date.parse(source.publishedAtOrUnknown) > 7 * 86400000) warnings.push(source.sourceId + ': 公開から7日を超えています。現在の出来事として扱う前に確認してください。');
  }
  if (draft.claimLedger.some(claim => ['contradicted','disputed','unknown'].includes(claim.evidenceState))) warnings.push('反証・対立・根拠不明の主張があります。');
  return { coverage, schema: 'eve.news-audit/1', checkedAt: new Date(now).toISOString(),
    checks: [
      { id: 'unique_source_urls', passed: new Set(packet.sources.map(source => source.canonicalUrl)).size === packet.sources.length, detail: '追跡パラメータとfragmentを除いたURLの重複を検査。独立した情報源かどうかは未検証。' },
      { id: 'source_times', passed: timeValid, detail: 'UTC・取得/公開の順序・未来時刻を検査。公開時刻不明は明示したまま保持。' },
      { id: 'correction_references', passed: corrections.length === 0, detail: corrections.length ? '未参照の訂正・撤回資料: ' + corrections.map(source => source.sourceId).join(', ') : '指定された訂正・撤回資料の参照漏れなし。内容の反映は人が確認。' },
      { id: 'ledger_text_present', passed: draft.claimLedger.every(claim => (draft.headline + '\n' + draft.articleText).includes(claim.text)), detail: '主張台帳の文言が草稿内にあるか確認。草稿全体の主張網羅・引用の正確性・真偽は未検証。' },
      { id: 'body_ledger_coverage', passed: !coverage.truncated && coverage.units.length>0 && coverage.unmappedUnitIds.length===0, detail: `${coverage.units.length===0?'本文に検査できる文がありません。':''}${coverage.unmappedUnitIds.length}文・段落に台帳未対応の文字があります。${coverage.truncated?'256文・段落または対応情報60,000文字の上限に達した未検査範囲もあります。':''}文字一致の対応だけを検査し、主張の意味的網羅・真偽は未検証。` },
    ], warnings, unusedSourceIds, semanticTruth: 'not_verified', politicalFairness: 'not_evaluated', publication: 'not_published' };
}
