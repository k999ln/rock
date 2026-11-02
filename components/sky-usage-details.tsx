'use client';
import type { SkyUsageObservation } from '@/lib/sky-usage-observation';
import { formatCurrencyMinor } from '@/lib/currency-format';
const labels: Record<string,string> = {
  input_tokens:'入力',uncached_input_tokens:'通常入力',output_tokens:'出力',candidate_output_tokens:'回答出力',
  total_tokens:'合計',cached_input_tokens:'キャッシュ入力',cache_read_input_tokens:'キャッシュ読取',
  cache_write_input_tokens:'キャッシュ書込',reasoning_output_tokens:'推論',tool_prompt_tokens:'Tool入力',
};
export default function SkyUsageDetails({observation}:{observation:SkyUsageObservation}) {
  return <details className="work-delegation-usage"><summary>使用量と料金 · {observation.providerId}</summary>
    <p>{observation.basis==='stored_verified_receipt'?'署名検証済みの最終利用記録':'提供元が応答に含めた使用量'} · {observation.status==='invalid'?'計量値に不整合があります':observation.status==='not_reported'?'使用量未報告':observation.status==='partial'?'一部の項目は未報告':'使用量報告あり'}</p>
    <p>指定したモデル・Agent: {observation.resourceId??'未報告'}</p>
    <p>提供元の応答モデル・版: {observation.reportedResourceId??'未報告'}</p>
    <ul>{observation.metrics.map(line=><li key={line.meter}>{labels[line.meter]??line.meter}: {line.quantity===null?'未報告':`${line.quantity.toLocaleString('ja-JP')} ${line.unit}`}{line.relationship==='subset'?'（他の項目に含まれる内訳）':line.relationship==='total'?'（合計値・再加算しません）':''}</li>)}</ul>
    <p>金額: {observation.amountMinor!==null&&observation.currency?formatCurrencyMinor(observation.amountMinor,observation.currency):'未確定・0円とは限りません'}{observation.pricingVersion?` · 価格版 ${observation.pricingVersion}`:''}</p>
    <small>請求書・入金照合前。開発者への報酬は受取契約との紐付け待ちです。</small>
  </details>;
}
