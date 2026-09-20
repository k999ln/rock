'use client';

import Link from 'next/link';
import { ArrowRight, Grid2X2, Sparkles } from 'lucide-react';
import { catalog } from '@/lib/catalog';
import WorkspaceShell from '@/components/workspace-shell';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';

const zemaTools = catalog.filter(
  (tool) => tool.status === 'ready' && (tool.runner || tool.launchPath || tool.integration),
);

function toolHref(tool: (typeof catalog)[number]) {
  return tool.launchPath ?? `/sky/tools/${encodeURIComponent(tool.id)}`;
}

function roleFor(tool: (typeof catalog)[number]) {
  return skyToolLabelFor(tool.id)?.role ?? 'Skyアプリ';
}

export default function ZemaHomeWorkspace() {
  return (
    <WorkspaceShell title="Zema" contentClassName="zema-home-shell">
      <section className="zema-home-page" aria-labelledby="zema-home-title">
        <header className="zema-home-header">
          <div className="zema-home-mark" aria-hidden="true"><Sparkles size={25} /></div>
          <div>
            <p className="zema-home-eyebrow">AVOCADOOS / ZEMA</p>
            <h1 id="zema-home-title">Zema</h1>
            <p>Botを選ぶと、そのツール専用の画面が開きます。</p>
          </div>
          <Link className="zema-home-sky-link" href="/sky">
            <Grid2X2 size={16} /> Skyでアプリを管理
          </Link>
        </header>

        <section className="zema-home-tools" aria-labelledby="zema-home-tools-title">
          <div className="zema-home-section-heading">
            <div>
              <p className="zema-home-eyebrow">BOTS / TOOLS</p>
              <h2 id="zema-home-tools-title">使うBotを選択</h2>
            </div>
            <span>{zemaTools.length} tools</span>
          </div>
          <div className="zema-home-grid">
            {zemaTools.map((tool) => (
              <Link className="zema-home-tool" href={toolHref(tool)} key={tool.id}>
                <span className={`zema-home-tool-mark rock-icon-${tool.color}`}>
                  {roleFor(tool).slice(0, 1)}
                </span>
                <span className="zema-home-tool-copy">
                  <small>{roleFor(tool)}</small>
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                </span>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </section>
      </section>
    </WorkspaceShell>
  );
}
