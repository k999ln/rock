'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CheckCircle2, House } from 'lucide-react';
import { catalog } from '@/lib/catalog';
import type { JobTool } from '@/lib/operations';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { SkyCandidateRunner } from '@/components/sky-candidate-runner';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import WorkspaceShell from '@/components/workspace-shell';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';

function roleFor(tool: (typeof catalog)[number]) {
  return skyToolLabelFor(tool.id)?.role ?? 'Skyアプリ';
}

export default function SkyToolWorkspace({ toolId }: { toolId: string }) {
  const tool = catalog.find((item) => item.id === toolId);

  if (!tool) {
    return (
      <WorkspaceShell title="Sky">
        <section className="sky-tool-page sky-tool-page-missing">
          <p className="sky-tool-eyebrow">TOOL NOT FOUND</p>
          <h1>このツールは見つかりません</h1>
          <Link className="sky-tool-back" href="/sky">
            <ArrowLeft size={16} /> Skyのアプリ一覧へ
          </Link>
        </section>
      </WorkspaceShell>
    );
  }

  const label = roleFor(tool);
  const isLocalCandidate = tool.runner === 'candidate-local';

  return (
    <WorkspaceShell title={tool.name} contentClassName="sky-tool-page-shell">
      <section className="sky-tool-page" aria-labelledby="sky-tool-title">
        <header className="sky-tool-page-header">
          <div className="sky-tool-page-header-top">
            <Link className="sky-tool-back" href="/sky">
              <ArrowLeft size={16} /> Skyのアプリ一覧
            </Link>
            <Link className="sky-tool-home" href="/" aria-label="ホームへ戻る">
              <House size={16} /> ホーム
            </Link>
          </div>
          <div className="sky-tool-page-heading">
            <div className={`sky-tool-page-mark rock-icon-${tool.color}`} aria-hidden="true">
              {label.slice(0, 1)}
            </div>
            <div>
              <p className="sky-tool-eyebrow">DIRECT TOOL / {tool.category}</p>
              <h1 id="sky-tool-title">{tool.name}</h1>
              <p className="sky-tool-role">{label}</p>
            </div>
          </div>
          <p className="sky-tool-description">{tool.description}</p>
          <div className="sky-tool-facts" aria-label="ツールの実行境界">
            <span><CheckCircle2 size={15} /> 専用画面で実行</span>
            <span>{isLocalCandidate ? '端末内の確認・下書き' : tool.environment}</span>
          </div>
        </header>

        <main className="sky-tool-page-body">
          {tool.launchPath ? (
            <section className="sky-tool-open-card">
              <p className="sky-tool-eyebrow">専用アプリ</p>
              <h2>{tool.name}を開く</h2>
              <p>このツールは共通チャットを経由せず、専用の入力画面で操作します。</p>
              <Link className="black-button" href={tool.launchPath}>
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
            <section className="sky-tool-open-card">
              <p className="sky-tool-eyebrow">接続待ち</p>
              <h2>このツールの実行器を接続してください</h2>
              <p>Skyに登録済みですが、専用の実行器がまだ接続されていません。</p>
              <Link className="black-button" href="/studio">
                Studioで接続する <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
        </main>
      </section>
    </WorkspaceShell>
  );
}
