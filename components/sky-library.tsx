'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import ZemaNavigation from '@/components/zema-navigation';
import SkyOsPolicySummary from '@/components/sky-os-policy';
import SkyToolCard from '@/components/sky-tool-card';
import SkyToolOverview from '@/components/sky-tool-overview';
import { Dialog } from '@/components/ui/dialog';
import { catalog, type Automation } from '@/lib/catalog';
import { operationRequest } from '@/lib/operations-client';
import { useSkyToolContext } from '@/lib/use-sky-tool-context';
import { skyToolUiState } from '@/lib/sky-tool-ui';
import {
  CommerceSignIn,
  useCommerceResource,
  type Purchases,
} from '@/components/sky-commerce';
import frame from '@/components/sky-application.module.css';
import styles from '@/components/sky-library.module.css';

export default function SkyLibrary() {
  const context = useSkyToolContext();
  const purchases = useCommerceResource<Purchases>('purchases');
  const [connections, setConnections] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Automation | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      operationRequest<{ tool: string }[]>('/api/sky/library'),
      operationRequest<{ tool: string }[]>('/api/sky/connections'),
    ])
      .then(([saved, registered]) => {
        if (active)
          setConnections([
            ...new Set([...saved, ...registered].map((item) => item.tool)),
          ]);
      })
      .catch(() => {
        if (active)
          setError(
            '保存・登録したツールを読み込めません。サインイン状態を確認して再読込してください。',
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const matches = (tool: Automation) =>
    `${tool.name} ${tool.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const libraryLoading = connections === null && !error;
  const included = libraryLoading ? [] : catalog.filter(
    (tool) =>
      tool.status === 'ready' &&
      !connections?.includes(tool.id) &&
      matches(tool),
  );
  const saved = catalog.filter(
    (tool) => connections?.includes(tool.id) && matches(tool),
  );
  const cards = (items: Automation[]) => (
    <div className={styles.grid}>
      {items.map((tool) => (
        <SkyToolCard
          key={tool.id}
          tool={tool}
          state={skyToolUiState(tool, context)}
          onInspect={() => setSelected(tool)}
          expanded={selected?.id === tool.id}
          actionLabel={tool.status === 'ready' ? '開く' : '利用条件を見る'}
          href={`/zema/tools/${encodeURIComponent(tool.id)}`}
        />
      ))}
    </div>
  );
  return (
    <div className={frame.frame}>
      <WorkspaceShell
        title="Zema ライブラリ"
        tone="sky"
        hideTopActions
        contentClassName={styles.shell}
      >
        <div className={styles.page}>
          <ZemaNavigation active="library" />
          <header className={styles.header}>
            <p>ZEMA LIBRARY</p>
            <h1>ライブラリ</h1>
            <p>現在サインインしている人の保存商品・購入履歴と、標準ツール。</p>
          </header>
          <div className={styles.actions}>
            <input
              aria-label="ライブラリを検索"
              placeholder="保存・購入・標準ツールを検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Link href="/sky/marketplace">商品を探す →</Link>
          </div>
          <SkyOsPolicySummary />
          <section className={styles.section}>
            <h2>購入した商品</h2>
            {purchases.loading ? (
              <output>購入履歴を確認しています…</output>
            ) : purchases.error ? (
              <div role="alert">
                <p>購入履歴を取得できません。未購入とは判定していません。</p>
                <CommerceSignIn returnTo="/zema/library" />
                <button onClick={() => void purchases.refresh()}>再読込</button>
              </div>
            ) : !purchases.data?.configured ? (
              <p>
                決済サービスの接続待ちです。有料商品の購入はまだ利用できません。
              </p>
            ) : (
              <>
                {purchases.data.purchases
                  .filter(
                    (item) =>
                      item.status === 'paid' &&
                      item.name
                        .toLocaleLowerCase()
                        .includes(query.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <article key={item.id} className={styles.purchase}>
                      <h3>{item.name}</h3>
                      <p>
                        {item.access
                          ? '購入記録を確認済み。実行環境の接続は別途必要です。'
                          : '提供状況の確認が必要です。'}
                      </p>
                      <Link
                        href={`/sky/purchases?order=${encodeURIComponent(item.id)}`}
                      >
                        利用条件・購入履歴
                      </Link>
                    </article>
                  ))}
                {!purchases.data.purchases.some(
                  (item) => item.status === 'paid',
                ) && <p>購入済みの商品はありません。</p>}
              </>
            )}
            <Link href="/sky/purchases">すべての購入・返金履歴 →</Link>
          </section>
          <section className={styles.section}>
            <h2>保存・登録したツール</h2>
            <p>
              保存は接続・購入・実行許可ではありません。利用開始時に条件を確認します。
            </p>
            {error ? (
              <div role="alert">
                <p>{error}</p>
                <CommerceSignIn returnTo="/zema/library" />
                <button
                  onClick={() => {
                    setConnections(null);
                    setError('');
                    setReload((value) => value + 1);
                  }}
                >
                  再読込
                </button>
              </div>
            ) : connections === null ? (
              <output>読み込んでいます…</output>
            ) : saved.length ? (
              cards(saved)
            ) : (
              <p>
                {query
                  ? '条件に合う追加ツールはありません。'
                  : 'まだ保存・登録したツールはありません。マーケットで利用条件を確認できます。'}
              </p>
            )}
          </section>
          <section className={styles.section}>
            <h2>
              標準ツール {!libraryLoading && <small>{included.length}件</small>}
            </h2>
            <p>
              標準搭載でも、外部API・業務サービスの費用や接続が必要な場合があります。
            </p>
            {libraryLoading ? (
              <output>ツールの一覧を確認しています…</output>
            ) : cards(included)}
          </section>
        </div>
        <Dialog
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          {selected && (
            <SkyToolOverview
              tool={selected}
              state={skyToolUiState(selected, context)}
            />
          )}
        </Dialog>
      </WorkspaceShell>
    </div>
  );
}
