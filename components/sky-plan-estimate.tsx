'use client';
import {useState} from 'react';
import {sky140Plan,estimateSkyJobs} from '../lib/sky-plan-estimate';
export default function SkyPlanEstimate(){
 const [budget,setBudget]=useState(100);const [work,setWork]=useState('standard');
 const task=sky140Plan.workloads.find(v=>v.id===work)!;
 return <section style={{padding:20,background:'#edf2f7',marginBottom:24}}><h2>Sky 140 — 月額 $140 のプラン案</h2><p>確定した料金設計：Agent利用枠 $100 ＋ 運営・決済・保存等 $40。米国向け。税の扱いは未確定、通信料・端末代は別。契約・本番課金はまだ有効になりません。</p>
 <label>比較する原価枠 <select value={budget} onChange={e=>setBudget(Number(e.target.value))}><option value={100}>確定した利用枠 $100</option><option value={140}>全額を原価に使う $140</option></select></label>{' '}
 <label>仕事の規模 <select value={work} onChange={e=>setWork(e.target.value)}>{sky140Plan.workloads.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
 <p>1仕事の全呼出し合計：入力 {task.input.toLocaleString()}／出力 {task.output.toLocaleString()} token。</p>
 <table style={{width:'100%',textAlign:'left'}}><thead><tr><th>モデル（試算候補）</th><th>原価/仕事</th><th>目安/月</th></tr></thead><tbody>{sky140Plan.models.map(m=>{const r=estimateSkyJobs(task.input,task.output,m.input,m.output,budget);return <tr key={m.id}><td>{m.id}</td><td>${r.perJobUsd.toFixed(3)}</td><td>{r.jobs?.toLocaleString()} 件</td></tr>;})}</tbody></table>
 <p>標準処理・短いcontextの公開API単価、cache割引なし。各呼出しが短いcontext料金内という仮定。出力には課金対象の推論tokenを含みます。検索・実行環境・有料Tool・再試行分は別に同じ枠を消費するため、上記は保証件数ではありません。接続対応を証明する一覧でもありません。</p>
 <h3>契約・請求・利用権をひとつにする設計</h3><ol><li>本人・契約者・料金・更新日・解約方法への同意を保存</li><li>決済Providerで継続支払方法を確認し、月次請求を自動回収</li><li>未払いを通知し、決済結果と契約に従って新規有料Agentを停止</li><li>未払い・異議・過去請求を照合し、入金確認後に利用を復旧</li></ol><p>これは設計です。自動回収・未払い停止・復旧は現時点では実装／外部受入未完了。成果の確認・export・支払い・異議申立て・解約の入口は残します。</p>
 <p>枠を使い切ったら停止する案で、自動超過請求・繰越はなし。$40は利益ではなく運営費等の控除前の残額です。現在の従量テスト請求はこの定額プランとまだ統合されていません。</p>
 <small>単価確認：{sky140Plan.checkedAt} · <a href={sky140Plan.sources[0]}>OpenAI公式</a> · <a href={sky140Plan.sources[1]}>Anthropic公式</a></small></section>;
}
