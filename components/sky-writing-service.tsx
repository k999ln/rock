'use client';
import { useState } from 'react';
import Link from 'next/link';
import { catalog } from '@/lib/catalog';
import { MrToolRunner, type MrRunner } from '@/components/mr-tool-runner';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './sky-writing-service.module.css';
const runnable = new Set(['mr-citations', 'mr-free-article', 'coconala']);
export default function SkyWritingService({ toolId }: { toolId?: string }) {
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const tools = catalog.filter((t) => runnable.has(t.id));
  const selected = tools.find((t) => t.id === toolId);
  return (
    <WorkspaceShell
      title={selected?.name ?? 'Sky Market'}
      running={running}
      hideTopActions
    >
      <div className={styles.page}>
        <nav className={styles.navigation} aria-label="Skyの利用入口">
          <Link href="/sky">Skyへ戻る</Link>
          {selected && <Link href="/sky/marketplace">マーケットへ戻る</Link>}
        </nav>
        <h1>{selected?.name ?? 'Skyの文章・整理ツール'}</h1>
        {selected ? (
          <>
            <p>{selected.description}</p>
            <MrToolRunner
              tool={selected.runner as MrRunner}
              onRunningChange={setRunning}
            />
            <details>
              <summary>使い方・ライセンス</summary>
              <ol>
                {selected.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p>{selected.note}</p>
              <a
                href={selected.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {selected.license}
              </a>
            </details>
          </>
        ) : (
          <>
            <p>
              ツールを選び、入力して実行。できた成果はコピー、ファイル保存、この端末への保存ができます。
            </p>
            <label className={styles.search}>
              ツールを検索
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="出典、記事、案件"
              />
            </label>
            <div className={styles.grid}>
              {tools
                .filter((t) =>
                  `${t.name} ${t.description}`.includes(query.trim()),
                )
                .map((tool) => (
                  <article className={styles.card} key={tool.id}>
                    <span>{tool.category} · 無料</span>
                    <h2>{tool.name}</h2>
                    <p>{tool.description}</p>
                    <Link
                      className="black-button"
                      href={`/sky/tools/${tool.id}`}
                    >
                      Skyで使う →
                    </Link>
                  </article>
                ))}
            </div>
            {!tools.some((t) =>
              `${t.name} ${t.description}`.includes(query.trim()),
            ) && <p>該当するツールはありません。検索語を変えてください。</p>}
            <p>
              原稿は端末内で処理します。実行履歴の保存にはサインインが必要です。成果の端末保存は同じブラウザから再表示できます。
            </p>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
