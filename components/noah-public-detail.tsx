'use client';
import NoahLoading from './noah-loading';
import { useNoahLocale } from './noah-locale';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import NoahRegistrationSheet from './noah-registration-sheet';
import NoahDetailTemplate from './noah-detail-template';
import { researchKindLabels, type ResearchDetail, type ResearchSummary } from '@/lib/noah-research-types';
import styles from './noah-agent-catalog.module.css';

export default function NoahPublicDetail({ id, basePath = '/noah' }: { id: string; basePath?: string }) {
  const {t}=useNoahLocale();

  const [result, setResult] = useState<{ key: string; entry?: ResearchDetail; error?: string } | null>(null), [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`, current = result?.key === key ? result : null;
  const entry = current?.entry, error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/noah/public-catalog/${encodeURIComponent(id)}`, { signal: controller.signal });
        const data = await response.json() as { entry?: ResearchSummary; error?: string };
        if (!response.ok || !data.entry) throw new Error(data.error || '詳細を読み込めませんでした。');
        if (!/^\/noah-research\/[a-f0-9]{16}\/[a-f0-9]{2}\.json$/.test(data.entry.detailPath)) throw new Error('詳細の保存先を確認できません。');
        const details = await fetch(data.entry.detailPath, { signal: controller.signal });
        if (!details.ok) throw new Error('詳細を読み込めませんでした。');
        const shard = await details.json() as Record<string, ResearchDetail>;
        if (!shard[id] || shard[id].id !== id) throw new Error('詳細が見つかりません。');
        if (!controller.signal.aborted) setResult({ key, entry: shard[id] });
      } catch (e) { if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : '読み込めませんでした。' }); }
    })();
    return () => controller.abort();
  }, [id, key]);
  const agent = entry?.kind === 'agent' || entry?.kind === 'candidate';
  const content = <div><div className={`${styles.page} ${styles.formPage} ${styles.catalogDetail}`}>
    <nav className={styles.nav}><Link href={`${basePath}/explore?tab=catalog`}>{t("← Agentを探す")}</Link></nav>
    {error && <div role="alert" className={styles.error}>{t(error)} <button onClick={() => setAttempt(n => n + 1)}>{t("再試行")}</button></div>}
    {!entry && !error && <NoahLoading/>}
    {entry && <>
      <p className={styles.productSummary}>{entry.summary}</p>
      <div className={styles.facts}><div><small>{t("分類")}</small><strong>{t(researchKindLabels[entry.kind])}</strong></div><div><small>{t("確認状況")}</small><strong>{entry.level === 'primary' ? t("一次資料を確認") : t("資料確認待ち")}</strong></div></div>
      <section className={styles.notice} id="noah-product-access"><h2>{agent ? t("このAgentを使う") : t("この関連資産について")}</h2>
        <p>{agent ? t("このAgentは紹介情報です。スマホで使える接続先は、対応一覧から選べます。") : t("Agentを作る・動かすための関連資産です。単独の業務Agentとは区別しています。")}</p>
        <p>{t("利用費用：")}{entry.price}</p><p>{t("ライセンス：")}{entry.license || '未確認'}{t("。利用条件は配布元で確認してください。")}</p>
        {agent && <Link className={styles.primary} href={`/noah/explore?${new URLSearchParams({q:entry.name.slice(0,80)})}`}>{t("スマホで使えるAgentを探す")}</Link>}
        {agent && <NoahRegistrationSheet agentId={id}/>}
      </section>
      <section className={styles.notice}><h2>{t("配布元・出典")}</h2><ul>{entry.sources.filter(source => /^https?:\/\//.test(source.url)).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label || '配布元・資料を見る'} ↗</a><p>{source.url}</p></li>)}</ul></section>
      <section className={styles.notice}><h2>{t("確認した情報")}</h2><p>{entry.tags.join(' · ')}</p><ul>{entry.notes.map((note, n) => <li key={n}>{note}</li>)}</ul><p>{t("調査日：")}{entry.asOf}{t("。掲載は動作試験・購入・継続運用の完了を示しません。")}</p></section>
    </>}
  </div></div>;
  return entry ? <NoahDetailTemplate id={id} name={entry.name} provider={entry.author} summary={entry.summary}
    category={t(researchKindLabels[entry.kind])} feedbackId={agent ? id : undefined} backHref={`${basePath}/explore?tab=catalog`}>{content}</NoahDetailTemplate> : content;
}
