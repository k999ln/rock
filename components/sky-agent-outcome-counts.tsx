import type {AgentOutcomeSummary} from '@/lib/sky-agent-outcomes';
export function SkyAgentOutcomeCounts({summary}:{summary:AgentOutcomeSummary}){
 return <section aria-label="公開された利用結果"><h4>この版を使った人の回答</h4><p>共有時の設定：役立った {summary.original.helpful} ／まだ役立たなかった {summary.original.notHelpful}</p><p>役割・モデル設定を変更：役立った {summary.modified.helpful} ／まだ役立たなかった {summary.modified.notHelpful}</p><small>公開を選んだプロフィールの自己申告です。固定手順の仕事も含み、モデル・役割の性能を単独で評価した結果ではありません。全利用の成功率・人数・品質保証を表しません。作者本人は除外しています。</small></section>;
}
