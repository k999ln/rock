'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NOAH_MATERIALS, type NoahMaterial } from '@/lib/noah-shelf';
import { noahExplanationLevelTitle, noahExplanationWithConnection, type NoahExplanation } from '@/lib/noah-agent-explanation';
import { useNoahLocale } from './noah-locale';
import { NoahStepLevels } from './noah-step-levels';
import base from './noah-service.module.css';
import styles from './noah-ready.module.css';

type PackageDetail = {
  id: string; title: string; summary: string; familyId: string; tool: string; explanation: NoahExplanation;
};

const firstSentence = (text: string, locale: string) =>
  new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text.trim())[Symbol.iterator]().next().value?.segment.trim();

export function NoahExplanationSection({ explanation, summary, summaryJa, connected = false, card = false }: {
  explanation: NoahExplanation; summary: string; summaryJa?: string | null; connected?: boolean; card?: boolean;
}) {
  const { locale, t } = useNoahLocale();
  const translated = locale === 'ja' && summaryJa && summaryJa !== summary ? summaryJa : null;
  const intro = firstSentence(translated || summary, locale);
  const flow = noahExplanationWithConnection(explanation, connected);
  const tools = flow.ioSummary === false;
  const steps = flow.steps.map((step) => {
    const secret = step.id.startsWith('connect:') ? /^(.*) を入力$/u.exec(step.label) : null;
    const service = step.id.startsWith('connect:') ? /^(.*) へのアクセスを許可$/u.exec(step.label) : null;
    const label = secret ? t('{name} を入力', { name: secret[1] })
      : service ? t('{name} へのアクセスを許可', { name: service[1] })
      : /^(?:connect|usage):/u.test(step.id) ? t(step.label) : step.label;
    return { ...step, label, reason: step.reason && t(step.reason), waitNote: step.waitNote && t(step.waitNote), note: step.note && (step.id.startsWith('tool:') ? step.note : t(step.note)) };
  });
  const materialList = (items: NoahExplanation['consumes']) => items.length ? <ul>{items.map((item) => <li key={item}>{t(NOAH_MATERIALS[item])}</li>)}</ul> : t('なし');

  return <section className={styles.explanation} data-noah-explanation={flow.showMaterials === false ? 'steps' : flow.ioSummary === false ? 'tools' : 'materials'}>
    <h2>{t(card ? 'このカードでできる事' : 'この Agent でできる事')}</h2>
    {intro && <p className={styles.explanationSummary}>{intro}</p>}
    {translated && <details className={styles.explanationSource}>
      <summary>{t('自動翻訳')} · {t('原文')}</summary><p>{summary}</p>
    </details>}
    {flow.showMaterials !== false && flow.ioSummary !== false && <dl className={styles.explanationIo}>
      <div><dt>{t('渡す物')}</dt><dd>{materialList(flow.consumes)}</dd></div>
      <span aria-hidden="true">{locale === 'ar' ? '←' : '→'}</span>
      <div><dt>{t('返る物')}</dt><dd>{materialList(flow.produces)}</dd></div>
    </dl>}
    {tools ? <p className={styles.explanationHint}>{t('上から順に進みます。最後の段では、依頼に合う道具を Agent が選んで使います。道具の説明は提供者が書いた文のまま、受け取る項目は道具の定義のままです。')}</p>
      : <p className={styles.explanationHint}>{t('同じ段の工程は並行して進められます。')}</p>}
    <NoahStepLevels steps={steps} flowLabel={tools ? (label) => t(label === '受け取る物' ? '受け取る項目' : label) : t}
      showMaterials={flow.showMaterials === false ? false : tools ? 'flow' : true} chips={tools}
      levelTitle={tools ? (level) => { const title = noahExplanationLevelTitle(level); return title && t(title); } : undefined}
      materialLabel={(material) => t(Object.hasOwn(NOAH_MATERIALS, material) ? NOAH_MATERIALS[material as NoahMaterial] : material)}
      labels={{
      ariaLabel: t('工程の段（横に並ぶ工程は同時に進む）'),
      levelLabel: (level) => t('{level} 段目', { level }),
      kindLabel: t('種類'), kind: { auto: t('Agent の道具'), tap: t('本人が押す'), human: t('本人が行う'), review: t('本人が確かめる') },
      tag: { tap: t('本人が押す'), human: t('本人'), review: t('本人が確かめる') },
      reasonLabel: t('本人が入る理由'), waitsLabel: t('待つ物'), noWaits: t('なし（最初から始められる）'), waitReasonLabel: t('待つ理由'),
      }} />
  </section>;
}

export function NoahPackageExplanation({ id, familyId, tool }: { id: string; familyId?: string; tool?: string | null }) {
  const { t } = useNoahLocale();
  const [result, setResult] = useState<{ id: string; value: PackageDetail | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/noah/shelf?${new URLSearchParams({ id })}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as PackageDetail : null)
      .then((value) => { if (!controller.signal.aborted) setResult({ id, value }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ id, value: null }); });
    return () => controller.abort();
  }, [id]);

  const pkg = result?.id === id ? result.value : null;
  if (familyId) return pkg?.familyId === familyId && (!tool || pkg.tool === tool)
    ? <NoahExplanationSection explanation={pkg.explanation} summary={pkg.summary} card /> : null;
  return <main className={`${base.page} ${styles.page}`}>
    <p className={styles.back}><Link href="/noah/explore">← {t('戻る')}</Link></p>
    {pkg ? <article className={styles.detail}>
      <h1>{pkg.title}</h1>
      <Link className={styles.primary} href={`/noah/ready/agent?${new URLSearchParams({ id: pkg.familyId, tool: pkg.tool, from: pkg.id })}`}>{t('Agent を開く')}</Link>
      <NoahExplanationSection explanation={pkg.explanation} summary={pkg.summary} card />
    </article> : <p className={base.empty}>{t(result?.id === id ? '見つかりません。' : '読み込んでいます…')}</p>}
  </main>;
}
