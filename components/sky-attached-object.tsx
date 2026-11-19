'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { SkyNotice } from './sky-feedback';
import { skyAgentEvePath, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { skyObjectAttachmentLabels } from '@/lib/sky-object-attachment';
import styles from './sky-agent-library.module.css';

export default function SkyAttachedObject({ agentId }: { agentId: string }) {
  const [state, setState] = useState<{ agent?: SkyLibraryAgent; error?: string; signedOut?: boolean }>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/sky/agents?id=${encodeURIComponent(agentId)}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as { agent?: SkyLibraryAgent; error?: string };
      if (controller.signal.aborted) return;
      if (response.status === 401) { setState({ signedOut: true }); return; }
      if (!response.ok || !data.agent?.attachment) { setState({ error: data.error || 'この担当が見つかりません。自分のSmithで確認してください。' }); return; }
      setState({ agent: data.agent });
    }).catch(() => { if (!controller.signal.aborted) setState({ error: '担当を確認できません。接続を確認して再試行してください。' }); });
    return () => controller.abort();
  }, [agentId]);
  const agent = state.agent, labels = agent?.attachment && skyObjectAttachmentLabels(agent.attachment);
  return <WorkspaceShell title="この担当" tone="sky"><section className={styles.page}>
    <Link href="/sky/agents">自分のSmithへ</Link><h1>{agent?.attachment?.objectName ?? 'この担当を確認'}</h1>
    {state.error && <SkyNotice message={state.error} />}
    {state.signedOut && <p><Link href={`/account?returnTo=${encodeURIComponent(`/sky/objects/${agentId}`)}`}>ログインして自分の担当を開く</Link></p>}
    {!agent && !state.error && !state.signedOut && <output>自分の担当を確認しています…</output>}
    {agent && labels && <div className={styles.editor}><h2>{agent.name}</h2><details><summary>この担当の役割を見る</summary><p style={{whiteSpace:'pre-wrap'}}>{agent.instructions}</p></details><dl><dt>受け取りたい情報</dt><dd>{labels.input}</dd><dt>結果の伝え方</dt><dd>{labels.output}</dd><dt>担当の設定</dt><dd>第{agent.revision}版</dd></dl>
      <p>この入口は対象と担当を結ぶためのものです。リンクを知っているだけでは、本人のデータを読んだり機器を操作したりできません。</p>
      <p>取り付け部品の実接続は未確認です。入力・出力がそろうまで、機器が使えるとは表示しません。</p>
      {agent.enabled ? <Link href={skyAgentEvePath(agent)}>内容を確認してEveで開く</Link> : <p>この担当は停止中です。保存済みの成果は残っています。</p>}
      {agent.enabled && <p><a href={`/sky/objects/camera?agent=${encodeURIComponent(agent.id)}`}>カメラからこの担当につなぐ</a></p>}
    </div>}
  </section></WorkspaceShell>;
}
