import type { EveCombination } from '@/lib/eve-combination';
import { eveRunSummary, type EveRun, type EveRunState } from '@/lib/eve-combination-run';
import { EVE_AFFILIATE_PLACEHOLDER } from '@/lib/eve-part-shared';
import styles from '@/app/noah/engineering/combinations/eve-combinations.module.css';

/**
 * 組み合わせの最新の回（task 130、2026-11-25）。本物の部品で回した記録（data/eve-runs/*.json）を、そのまま見せる。
 * 何も送らない・保存しない。記事は Markdown の見出し・段落・リンクの行だけを文字のまま並べる（HTML を差し込まない）。LP は sandbox の iframe（スクリプトを動かさない）。
 */

const STATE: Record<EveRunState, string> = { done: '済み', owner: '本人の番', waiting: '待ち', failed: '失敗', refused: '呼ばなかった' };
const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' });

function Article({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/u).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={styles.article}>
      {blocks.map((b, i) => {
        if (b.startsWith('# ')) return <h3 key={i}>{b.slice(2)}</h3>;
        if (b.startsWith('## ')) return <h4 key={i}>{b.slice(3)}</h4>;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(b);
        if (link) return <p key={i} className={styles.muted}>［リンク］{link[1]}{link[2] === EVE_AFFILIATE_PLACEHOLDER ? '（提携の承認の後に、ASP の広告リンクが入ります）' : ''}</p>;
        return <p key={i}>{b}</p>;
      })}
    </div>
  );
}

export default function EveRunView({ c, run, runPath }: { c: EveCombination; run: EveRun; runPath: string }) {
  const sum = eveRunSummary(c, run);
  const value = (id: string) => run.steps[id]?.output ?? run.steps[id]?.prepared;
  const stepOf = (capability: string) => c.steps.find((s) => s.capability === capability)?.id ?? '';
  const article = value(stepOf('content.article'));
  const image = value(stepOf('content.image')) as { base64?: string; alt?: string } | undefined;
  const lp = value(stepOf('site.build'));
  const offers = value(stepOf('research.offer')) as { chosen?: string; offers?: { id: string; name: string; rewardYen: number; source: string }[] } | undefined;
  const chosen = offers?.offers?.find((o) => o.id === offers.chosen);
  return (
    <section className={styles.section} aria-labelledby="eve-run">
      <h2 id="eve-run">最新の回</h2>
      <p>
        {when(run.startedAt)} に、Eve の部品と手元の Qwen で回しました（回 {run.runId}）。済み {sum.done}・本人の番 {sum.owner}・待ち {sum.waiting}
        {sum.failed ? `・失敗 ${sum.failed}` : ''}{sum.refused ? `・呼ばなかった ${sum.refused}` : ''}（全 {sum.total} 工程）。公開・登録・申請は、まだ何もしていません。
      </p>
      {chosen ? <p className={styles.muted}>選んだ案件: {chosen.name}（成果 1 件 {chosen.rewardYen.toLocaleString('ja-JP')} 円。出典 <a href={chosen.source} rel="noopener noreferrer" target="_blank">公式の頁</a>）</p> : null}

      <h3>本人の番</h3>
      {sum.ownerTurns.length === 0 ? <p className={styles.empty}>今は、本人の番はありません。</p> : (
        <ol className={styles.owner}>
          {sum.ownerTurns.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong>
              <span className={styles.turnLine}>{t.ask?.reason}</span>
              <span className={styles.turnLine}>済んだら、端末で次を動かします（返す形: <code>{t.ask?.give}</code>）。</span>
              <code className={styles.command}>{`node --experimental-strip-types scripts/eve-run.mjs owner --run ${runPath} --step ${t.id} --json '…'`}</code>
            </li>
          ))}
        </ol>
      )}

      <h3>作った物</h3>
      {image?.base64 ? (
        // 記録の中の PNG をそのまま見せる（外から読まない）。
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.eyecatch} src={`data:image/png;base64,${image.base64}`} alt={image.alt ?? '記事の見出し画像'} width={1200} height={630} />
      ) : <p className={styles.empty}>見出し画像は、まだありません。</p>}
      {typeof article === 'string' ? (
        <details className={styles.made}>
          <summary>記事（{Array.from(article).length.toLocaleString('ja-JP')} 文字）</summary>
          <Article markdown={article} />
        </details>
      ) : <p className={styles.empty}>記事は、まだありません。</p>}
      {typeof lp === 'string' ? (
        <details className={styles.made}>
          <summary>紹介の LP（リンクは、提携の承認の後に入ります）</summary>
          <iframe className={styles.lpFrame} title="紹介の LP の見本" sandbox="" srcDoc={lp} />
        </details>
      ) : null}

      <h3>工程ごとの結果</h3>
      <ul className={styles.problems}>
        {c.steps.map((s) => {
          const r = run.steps[s.id];
          return (
            <li key={s.id}>
              <strong>{s.label}</strong> — {r ? STATE[r.state] : '待ち'}{r?.part ? `（${r.part.ref}・版 ${r.part.version.slice(0, 12)}）` : ''}{r && r.state !== 'done' ? `: ${r.reason}` : ''}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
