'use client';
import { useEffect, useState } from 'react';
import type { NoahRegistrationReport } from '@/lib/noah-registration-report';
import { useNoahLocale } from './noah-locale';
export default function NoahRegistrationStatus({ id }: { id: string }) {
  const { t } = useNoahLocale();
  const [report, setReport] = useState<NoahRegistrationReport | null>(null), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/noah/discover/project?${new URLSearchParams({ id, check: 'registration' })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error();
        const body = await response.json() as NoahRegistrationReport;
        if (!['identified', 'needs-information', 'unavailable'].includes(body.state) || typeof body.title !== 'string' || !Array.isArray(body.items) || body.items.some(item => typeof item.field !== 'string' || typeof item.detail !== 'string')) throw Error();
        if (!controller.signal.aborted) setReport(body);
      }).catch(() => { if (!controller.signal.aborted) setReport({ state: 'unavailable', title: '接続情報を確認できませんでした', items: [{ field: '通信', detail: '情報不足かどうかは未判定です。確認し直してください。' }] }); });
    return () => controller.abort();
  }, [id, attempt]);
  return <section aria-label={t('登録に必要な情報')} aria-live="polite">
    <h2>{t(report?.title ?? '登録に必要な情報を確認中')}</h2>
    {report ? <dl>{report.items.map(item => <div key={item.field}><dt>{t(item.field)}</dt><dd>{t(item.detail)}</dd></div>)}</dl> : <p>{t('説明はこのまま読めます。接続先と認証条件の確認結果をここに表示します。')}</p>}
    {report?.state === 'unavailable' && <button type="button" onClick={() => { setReport(null); retry(n => n + 1); }}>{t('確認し直す')}</button>}
  </section>;
}
