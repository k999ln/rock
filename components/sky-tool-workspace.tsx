'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import { catalog } from '@/lib/catalog';
import type { JobTool } from '@/lib/operations';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { SkyCandidateRunner } from '@/components/sky-candidate-runner';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import WorkspaceShell from '@/components/workspace-shell';
import { skyToolUiState } from '@/lib/sky-tool-ui';
import { useSkyToolContext } from '@/lib/use-sky-tool-context';
import { ToolIcon } from '@/components/tool-icon';
import { Dialog } from '@/components/ui/dialog';
import SkyToolOverview from '@/components/sky-tool-overview';
import CoconalaTeamWorkspace from '@/components/coconala-team-workspace';
import {
  catalogHostMismatch,
  detectSkyHost,
  type SkyHostEnvironment,
} from '@/lib/sky-tool-compatibility';
import styles from '@/components/sky-tool-workspace.module.css';

const subscribeHost = () => () => undefined;
const browserHost = (): SkyHostEnvironment =>
  detectSkyHost(navigator.userAgent, navigator.maxTouchPoints);
const serverHost = (): null => null;

export default function SkyToolWorkspace({ toolId }: { toolId: string }) {
  const runtimeContext = useSkyToolContext();
  const [infoOpen, setInfoOpen] = useState(false);
  const tool = catalog.find((item) => item.id === toolId);
  const host = useSyncExternalStore(subscribeHost, browserHost, serverHost);

  if (toolId === 'coconala') return <CoconalaTeamWorkspace />;

  if (!tool) {
    return (
      <WorkspaceShell
        title="Sky"
        tone="sky"
        contentClassName={styles.shell}
        hideTopActions
      >
        <section className={styles.missing}>
          <p className={styles.eyebrow}>TOOL NOT FOUND</p>
          <h1>このツールは見つかりません</h1>
          <Link className={styles.back} href="/sky/marketplace">
            <ArrowLeft size={16} /> マーケットへ戻る
          </Link>
        </section>
      </WorkspaceShell>
    );
  }

  const state = skyToolUiState(tool, runtimeContext);
  const isLocalCandidate = tool.runner === 'candidate-local';
  const isJevRouter = tool.id === 'jev-router';
  const hostMismatch = host ? catalogHostMismatch(tool, host) : null;
  const routerHostMismatch = isJevRouter ? hostMismatch : null;

  return (
    <WorkspaceShell
      title={tool.name}
      tone="sky"
      contentClassName={styles.shell}
      hideTopActions
    >
      <section className={styles.page} aria-labelledby="sky-tool-title">
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Link className={styles.back} href="/sky/marketplace">
              <ArrowLeft size={16} /> マーケットへ戻る
            </Link>
            <Link className={styles.skyLink} href="/sky">
              Skyアプリ一覧 <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className={styles.heading}>
            <button
              type="button"
              className={`${styles.mark} ${styles.markButton} rock-icon-${tool.color}`}
              aria-label={`${tool.name}の機能を見る`}
              aria-haspopup="dialog"
              aria-expanded={infoOpen}
              title={`${tool.name}の機能を見る`}
              onClick={() => setInfoOpen(true)}
            >
              <ToolIcon id={tool.id} size={28} />
              <span>機能</span>
            </button>
            <div>
              <p className={styles.eyebrow}>{tool.category}</p>
              <h1 id="sky-tool-title">{tool.name}</h1>
              <p className={styles.status} aria-label="現在の利用状態">
                {tool.status === 'candidate' ? (
                  <CircleDashed size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>{state.label}</span>
              </p>
            </div>
          </div>
        </header>

        <div className={styles.body}>
          {isJevRouter ? (
            <section className={styles.openCard}>
              <h2>
                {routerHostMismatch
                  ? 'この端末からは接続できません'
                  : 'Skyからのワンクリック接続は準備中'}
              </h2>
              <p>
                {routerHostMismatch ??
                  '現在はPCのCLIから利用できます。Sky Web・専用OS・スマホアプリからの自動接続は未実装です。'}
              </p>
              {!routerHostMismatch && host && host !== 'unknown' && (
                <ul className={styles.requirements}>
                  <li>本人のPCにNode.js 20.12以上</li>
                  <li>ログイン済みのCodex CLIまたはClaude Code</li>
                  <li>TypeSafeのJEV_API_KEYと、依頼文を外部送信する同意</li>
                </ul>
              )}
              <a
                className={styles.action}
                href={tool.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                公式の導入手順を見る <ArrowUpRight size={16} />
              </a>
            </section>
          ) : tool.launchPath ? (
            <section className={styles.openCard}>
              <p className={styles.eyebrow}>専用アプリ</p>
              <h2>{tool.name}を開く</h2>
              <p>
                このツールは共通チャットを経由せず、専用の入力画面で操作します。
              </p>
              <Link className={styles.action} href={tool.launchPath}>
                専用画面を開く <ArrowUpRight size={16} />
              </Link>
            </section>
          ) : isLocalCandidate ? (
            <SkyCandidateRunner
              tool={tool.id as JobTool}
              name={tool.name}
              onRunningChange={() => undefined}
            />
          ) : tool.runner && tool.runner !== 'candidate-local' ? (
            <MrToolRunner
              tool={tool.runner}
              onRunningChange={() => undefined}
            />
          ) : tool.integration === 'fashion-brand-ops' ? (
            <FashionBrandOpsRunner />
          ) : (
            <section className={styles.openCard}>
              <p className={styles.eyebrow}>接続待ち</p>
              <h2>このツールの実行器を接続してください</h2>
              <p>Skyに登録済みですが、専用の実行器がまだ接続されていません。</p>
              <Link className={styles.action} href="/studio">
                Studioで接続する <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
        </div>
        <details className={styles.guide}>
          <summary>使い方・ライセンス</summary>
          <ol>
            {tool.steps.map((step, index) => (
              <li key={`${tool.id}-${index}`}>{step}</li>
            ))}
          </ol>
          <p className={styles.license}>
            ライセンス：
            <a href={tool.licenseUrl} target="_blank" rel="noopener noreferrer">
              {tool.license} <ArrowUpRight size={13} />
            </a>
          </p>
          <p className={styles.note}>{tool.note}</p>
        </details>
      </section>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <SkyToolOverview
          tool={tool}
          state={state}
          hostMismatch={hostMismatch}
        />
      </Dialog>
    </WorkspaceShell>
  );
}
