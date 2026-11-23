import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import WorkspaceShell from '@/components/workspace-shell';
import { EVE_STATUS_LABEL, eveCatalogEntry, eveCombinationFile, type EveStepView } from '@/lib/eve-combination-catalog';
import { EVE_AUTHOR_SHARE_BPS, EVE_FUNNEL, EVE_FUNNEL_LABEL } from '@/lib/eve-combination-score';
import styles from '../eve-combinations.module.css';

type Props = { params: Promise<{ id: string }> };

async function load({ params }: Props) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    return null;
  }
  const c = eveCombinationFile(decoded);
  return c ? { c, entry: eveCatalogEntry(c) } : null;
}

export async function generateMetadata(p: Props): Promise<Metadata> {
  const r = await load(p);
  return { title: r ? `${r.c.title} — Eve` : '組み合わせが見つかりません — Eve', robots: { index: false, follow: false } };
}

const KIND: Record<EveStepView['kind'], string> = { auto: '自動', tap: '本人が押す', human: '本人だけ', review: '本人が確かめる' };
const PART: Record<EveStepView['part'], string> = {
  agent: '部品あり',
  glue: 'つなぎ目の変換',
  builtin: '決まった式',
  missing: '部品が無い',
  owner: '本人の工程',
  self: '本人が自分でやる',
};

export default async function EveCombinationPage(p: Props) {
  const r = await load(p);
  if (!r) notFound();
  const { c, entry } = r;
  const owner = entry.steps.filter((s) => s.part === 'owner' || s.part === 'self');
  const general = entry.problems.filter((x) => !x.step);
  const order = new Map(entry.steps.map((s, i) => [s.id, i + 1]));
  return (
    <WorkspaceShell title="Eve" hideTopActions contentClassName={styles.shell}>
      <article className={styles.page}>
        <Link className={styles.back} href="/os/eve/combinations">← 組み合わせの一覧</Link>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>{c.id} · 版 {c.version}</p>
          <h1>{c.title}</h1>
          <p className={styles.badges} style={{ marginTop: 16 }}>
            <span className={`${styles.badge} ${styles[entry.status]}`}>{EVE_STATUS_LABEL[entry.status]}</span>
            <span className={styles.badge}>{c.origin === 'template' ? `型への当てはめ（${c.blueprint}）` : '型に無い組み合わせ'}</span>
            <span className={styles.badge}>{c.author.kind === 'eve' ? 'Eve が作った' : `${c.author.id} が作った`}</span>
            {c.finance ? <span className={styles.badge}>金融（本人が確かめる）</span> : null}
          </p>
          <dl className={styles.facts}>
            <div><dt>狙う需要</dt><dd>{c.demand ? `${c.demand.id}（見込みの単価 ${c.demand.expectedPriceYen.toLocaleString('ja-JP')} 円）` : 'まだ決まっていません。決まるまでは試運転だけです。'}</dd></div>
            <div><dt>お金の出口</dt><dd>{c.exit.material} — {c.exit.source}（承認・入金だけを数えます）</dd></div>
            <div><dt>1 回の費用</dt><dd>{entry.costYenPerRun.toLocaleString('ja-JP')} 円（上限 {c.budget.perRunYen.toLocaleString('ja-JP')} 円・試す期間の上限 {c.budget.trialYen.toLocaleString('ja-JP')} 円）</dd></div>
            <div><dt>本人の手間</dt><dd>1 回あたり {entry.ownerMinutesPerRun} 分（登録は最初の 1 回だけなので数えていません）</dd></div>
          </dl>
        </header>

        <section className={styles.section} aria-labelledby="eve-owner">
          <h2 id="eve-owner">本人の番</h2>
          <p>Eve は代わりに押しません。中身と手順を用意して、ここで止めます。</p>
          <ul className={styles.owner}>
            {owner.map((s) => (
              <li key={s.id}>
                <strong>{order.get(s.id)}. {s.label}</strong>
                <span>{KIND[s.kind]}{s.reason ? ` — ${s.reason}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="eve-flow">
          <h2 id="eve-flow">組み合わせの図</h2>
          <p>上から順に動きます。同じ所で待つ工程は、同時に進められます。</p>
          <ol className={styles.flow}>
            {entry.steps.map((s, i) => (
              <li key={s.id} className={`${styles.step} ${s.part === 'owner' || s.part === 'self' ? styles.stepOwner : ''}`}>
                <span className={styles.num} aria-hidden="true">{i + 1}</span>
                <p className={styles.stepTitle}>{s.label}</p>
                <span className={styles.badges}>
                  <span className={styles.badge}>{KIND[s.kind]}</span>
                  <span className={`${styles.badge} ${s.part === 'missing' ? styles.paper : ''}`}>{PART[s.part]}</span>
                  {s.outward && s.kind === 'auto' ? <span className={styles.badge}>外へ出す</span> : null}
                </span>
                <p className={styles.stepMeta}>
                  {s.capabilityLabel ?? s.capability ?? '能力の指定なし'}
                  {s.agent ? ` · ${s.agent}` : ''}
                  {s.after.length ? ` · 待つ: ${s.after.map((a) => order.get(a) ?? a).join('・')}` : ' · 最初から始められる'}
                </p>
                {s.problems.map((x, j) => (
                  <p key={j} className={`${styles.problem} ${x.level === 'block' ? styles.problemBlock : ''}`}>規則 {x.rule}: {x.message}</p>
                ))}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="eve-check">
          <h2 id="eve-check">検査の結果</h2>
          <p>決まった式（規則 1〜9）で見ます。LLM は使いません。</p>
          {general.length === 0 ? (
            <p className={styles.empty}>組み合わせ全体の問題はありません。</p>
          ) : (
            <ul className={styles.problems}>
              {general.map((x, j) => (
                <li key={j} className={`${styles.problem} ${x.level === 'block' ? styles.problemBlock : ''}`}>規則 {x.rule}: {x.message}</li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-labelledby="eve-score">
          <h2 id="eve-score">成績表</h2>
          <p>Jev が外部の記録だけで数えます。クリックや本人の申告を、承認・入金に数えません。</p>
          <ol className={styles.funnel} aria-label="7 段の数">
            {EVE_FUNNEL.map((s) => (
              <li key={s}><strong>—</strong><span>{EVE_FUNNEL_LABEL[s]}</span></li>
            ))}
          </ol>
          <p className={styles.empty}>外部の記録が、まだありません。最初の記録が読めたら、7 段の数・費用・承認額・1 日の利益を出します。</p>
        </section>

        <section className={styles.section} aria-labelledby="eve-rebuild">
          <h2 id="eve-rebuild">作り直しの提案</h2>
          <p>一番数が落ちた段の前の工程だけを、確かめた部品に差し替えて試運転します。見込みの利益が 2 割以上良い時だけ出し、採用は本人が押します。元の版は残ります。</p>
          <p className={styles.empty}>提案はまだありません（成績表が出てからです）。</p>
        </section>

        <section className={styles.section} aria-labelledby="eve-author">
          <h2 id="eve-author">作る人の受け取り</h2>
          <p>この組み合わせを他の人が使って、外部の入金の記録で確定した額が出た時だけ、作者の分を計算します。Eve が作った組み合わせの分は運営に入ります。払うのは Wallet です。</p>
          <p className={styles.empty}>{EVE_AUTHOR_SHARE_BPS === null ? '作者に入る割合は、まだ決まっていません。' : `作者の割合: ${EVE_AUTHOR_SHARE_BPS / 100}%`}</p>
        </section>
      </article>
    </WorkspaceShell>
  );
}
