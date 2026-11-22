import EsimCatalogPage from '@/app/sky/esim/page';

export const metadata = { title: '回線 — Noah' };

export default function NoahEsimPage() {
  if (process.env.NODE_ENV !== 'development') return <EsimCatalogPage />;
  return (
    <>
      <EsimCatalogPage />
      <aside aria-label="開発用の模擬回線">
        <p>
          このMacで <code>npm run noah:esim:trial</code>{' '}
          を起動すると、0円申込から指定された定期便の受取まで試せます。
        </p>
        <a href="http://127.0.0.1:43871/noah/esim/trial/">
          模擬回線の試験を開く
        </a>
      </aside>
    </>
  );
}
