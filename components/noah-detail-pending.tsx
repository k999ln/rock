'use client';
import { useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NOAH_DETAIL_PREVIEW_KEY, readNoahDetailPreview, type NoahDetailPreview } from '@/lib/noah-detail-preview';
import NoahLoading from './noah-loading';
import NoahDetailTemplate from './noah-detail-template';
import { useNoahLocale } from './noah-locale';
const subscribe = () => () => {};
const server = () => null;
const snapshot = () => { try { return window.sessionStorage.getItem(NOAH_DETAIL_PREVIEW_KEY); } catch { return null; } };
export default function NoahDetailPending({ href, card }: { href?: string; card?: NoahDetailPreview }) {
  const pathname = usePathname(), params = useSearchParams(), { t } = useNoahLocale();
  const raw = useSyncExternalStore(subscribe, snapshot, server);
  const preview = card && typeof card.id === 'string' && typeof card.name === 'string' && typeof card.summary === 'string'
    ? card : readNoahDetailPreview(raw, href ?? `${pathname}?${params}`);
  if (!preview) return <NoahLoading variant="page" />;
  return <NoahDetailTemplate {...preview} action={<button type="button" disabled aria-busy="true">{t('接続')}</button>} />;
}
