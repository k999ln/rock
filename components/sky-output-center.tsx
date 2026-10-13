'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Copy, Download, RefreshCw } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { CAMPUSES, type CampusId } from '@/lib/campus';
import type { WorkJob } from '@/lib/workflow';
import { agentOutputExportable, agentOutputText, isSavedAgentDocument, type SavedAgentDocument } from '@/lib/sky-output-presenter';
import { parseFitnessPlan } from '@/lib/sky-fitness-output';
import styles from './sky-output-center.module.css';

type Delegation = {
  id: string;
  targetAgentName: string;
  targetAgentVersion: string;
  state: string;
  artifactsCaptured: number;
  updatedAt: number;
};
type CloudAnswer = {
  id: string;
  state: string;
  resultText: string | null;
  saveResult: boolean;
  createdAt: number;
  quote: { ceiling: { modelId: string; currency: string } };
  settledMinor: number | null;
};
type SavedArtifact = { id: string; document: SavedAgentDocument };
type LoadState = 'loading' | 'ready' | 'signed_out' | 'unavailable';

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', signal });
  if (response.status === 401) throw new Error('SIGNED_OUT');
  if (!response.ok) throw new Error('READ_FAILED');
  return await response.json() as T;
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const delegationState: Record<string, string> = {
  remote_completed: '成果の確認ができます',
  remote_failed: 'Agent側で失敗',
  remote_cancelled: '停止済み',
  awaiting_approval: '承認待ち',
  prepared: '実行待ち',
  running: '実行中',
};

export default function SkyOutputCenter({
  campusId,
  initialWorkJobId,
}: {
  campusId?: CampusId;
  initialWorkJobId?: string;
}) {
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [selectedId, setSelectedId] = useState(initialWorkJobId ?? '');
  const [listState, setListState] = useState<LoadState>('loading');
  const [detailState, setDetailState] = useState<LoadState>('loading');
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [answers, setAnswers] = useState<CloudAnswer[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, SavedArtifact[]>>({});
  const [artifactBusy, setArtifactBusy] = useState('');
  const [artifactError, setArtifactError] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setListState('loading');
    setDetailState('loading');
    setRevision((value) => value + 1);
  }, []);
  const selectJob = useCallback((id: string) => {
    setDetailState('loading');
    setDelegations([]);
    setAnswers([]);
    setArtifacts({});
    setArtifactError('');
    setSourceError('');
    setSelectedId(id);
  }, []);
  const home = campusId ? `/sky/campus/${campusId}/hub` : '/sky';
  const outputPath = campusId ? `/sky/campus/${campusId}/outputs` : '/sky/outputs';
  const zema = campusId ? `/sky/campus/${campusId}/manage?view=work` : '/chat?view=work';
  const selected = jobs.find((job) => job.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    void readJson<{ jobs: WorkJob[] }>('/api/work-jobs', controller.signal)
      .then(({ jobs: incoming }) => {
        setJobs(incoming);
        setSelectedId((current) => incoming.some((job) => job.id === current)
          ? current : incoming[0]?.id ?? '');
        setListState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListState(error instanceof Error && error.message === 'SIGNED_OUT' ? 'signed_out' : 'unavailable');
        setJobs([]);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (!selectedId || listState !== 'ready') return;
    const controller = new AbortController();
    void Promise.allSettled([
      readJson<{ delegations: Delegation[] }>(`/api/sky/a2a-delegations?parentJobId=${encodeURIComponent(selectedId)}`, controller.signal),
      readJson<{ executions: CloudAnswer[] }>(`/api/llm/quotes?parentJobId=${encodeURIComponent(selectedId)}`, controller.signal),
    ]).then(([agentResult, answerResult]) => {
      if (controller.signal.aborted) return;
      if (agentResult.status === 'fulfilled') setDelegations(agentResult.value.delegations ?? []);
      if (answerResult.status === 'fulfilled') setAnswers(answerResult.value.executions ?? []);
      setSourceError([
        agentResult.status === 'rejected' ? 'Agent成果の照会' : '',
        answerResult.status === 'rejected' ? 'Cloud AI回答の照会' : '',
      ].filter(Boolean).join('・'));
      const signedOut = [agentResult, answerResult].some((result) =>
        result.status === 'rejected' && result.reason instanceof Error && result.reason.message === 'SIGNED_OUT');
      setDetailState(signedOut ? 'signed_out'
        : agentResult.status === 'rejected' && answerResult.status === 'rejected' ? 'unavailable' : 'ready');
    });
    return () => controller.abort();
  }, [selectedId, listState, revision]);

  async function loadArtifacts(id: string) {
    setArtifactBusy(id);
    setArtifactError('');
    try {
      const response = await readJson<{ artifacts: Array<{ id: string; document: unknown }> }>(
        `/api/sky/a2a-delegations/${encodeURIComponent(id)}/artifacts`, new AbortController().signal,
      );
      if (response.artifacts.some((artifact) => !isSavedAgentDocument(artifact.document)))
        throw new Error('INVALID_OUTPUT');
      setArtifacts((current) => ({
        ...current,
        [id]: response.artifacts as SavedArtifact[],
      }));
    } catch {
      setArtifactError('保存済み成果を確認できませんでした。Zemaで状態を更新してから再試行してください。');
    } finally {
      setArtifactBusy('');
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage('テキストをコピーしました。');
    } catch {
      setCopyMessage('コピーできませんでした。端末の共有・保存機能を確認してください。');
    }
  }

  return <WorkspaceShell
    title={campusId ? `${CAMPUSES[campusId].shortName} Sky` : 'Sky'}
    contentClassName={styles.shell}
    tone="sky"
  >
    <main className={styles.page} aria-labelledby="sky-output-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{campusId ? `${CAMPUSES[campusId].shortName.toUpperCase()} / SKY` : 'SKY'} · OUTPUTS</p>
          <h1 id="sky-output-title">成果</h1>
          <p>保存したAgent成果を確認し、形式が合うアプリへ渡せます。OS版ではZemaの仕事にも戻れます。</p>
        </div>
        <button type="button" onClick={refresh}><RefreshCw size={16} /> 更新</button>
      </header>
      <nav className={styles.nav} aria-label="Skyの移動先">
        <Link href={home}>SkyでAgentを探す</Link>
        <Link href="/fitness">Fitnessアプリの例 <ArrowRight size={15} /></Link>
        <Link href={zema}>OS版のZemaで仕事を見る</Link>
      </nav>
      {listState === 'loading' && <p className={styles.notice}>本人の仕事を読み込んでいます…</p>}
      {listState === 'signed_out' && <p className={styles.notice}><Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(outputPath)}`}>サインイン</Link>すると、自分の成果を確認できます。</p>}
      {listState === 'unavailable' && <p className={styles.notice} role="alert">仕事を読み込めませんでした。接続を確認して更新してください。</p>}
      {listState === 'ready' && jobs.length === 0 && <div className={styles.empty}><h2>まだ成果はありません</h2><p>Skyで保存されたAgent成果がここに並びます。対応アプリでは、その成果をアプリ専用の画面で表示できます。</p><Link href={home}>Skyを開く <ArrowRight size={15} /></Link></div>}
      {listState === 'ready' && jobs.length > 0 && <div className={styles.layout}>
        <section className={styles.list} aria-label="仕事一覧">
          <div className={styles.sectionHead}><h2>仕事</h2><span>{jobs.length}件</span></div>
          {jobs.map((job) => <button type="button" key={job.id} className={job.id === selectedId ? styles.selected : ''} aria-pressed={job.id === selectedId} onClick={() => selectJob(job.id)}>
            <strong>{job.title}</strong>
            <span>{job.status === 'completed' ? '仕事は完了' : job.status === 'cancelled' ? '中止' : '作業中・確認待ち'} · {new Date(job.updatedAt).toLocaleDateString('ja-JP')}</span>
          </button>)}
        </section>
        <section className={styles.detail} aria-label="選択した仕事の成果">
          <div className={styles.sectionHead}>
            <div><small>WORK OUTPUT</small><h2>{selected?.title ?? '仕事を選択'}</h2></div>
            {selected && <Link href={`${zema}&workJob=${encodeURIComponent(selected.id)}`}>Zemaで開く <ArrowRight size={15} /></Link>}
          </div>
          {detailState === 'loading' && <p className={styles.notice}>保存済み成果を確認しています…</p>}
          {detailState === 'signed_out' && <p className={styles.notice}>サインインが切れました。再ログインしてから更新してください。</p>}
          {detailState === 'unavailable' && <p className={styles.notice} role="alert">成果の状態を取得できません。Zemaの仕事履歴からも確認できます。</p>}
          {detailState === 'ready' && sourceError && <p className={styles.notice} role="alert">{sourceError}を確認できません。未確認の結果は「なし」と扱わず、更新後にもう一度確認してください。</p>}
          {selected?.standaloneAgent && <article className={styles.output}>
            <div className={styles.outputHead}><div><small>SKY FIRST-PARTY AGENT</small><h3>出典整理Agent</h3><span>完了 · 第一者処理 · 無料</span></div></div>
            <div className={styles.document}>
              <pre>{selected.standaloneAgent.text}</pre>
              <p>出典リンク {selected.standaloneAgent.sourceCount}件</p>
              {selected.standaloneAgent.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              <div className={styles.actions}>
                <button type="button" onClick={() => void copyText(selected.standaloneAgent!.text)}><Copy size={15} /> コピー</button>
                <button type="button" onClick={() => downloadText(`sky-citations-${selected.id}.md`, selected.standaloneAgent!.text)}><Download size={15} /> Markdownを保存</button>
              </div>
            </div>
          </article>}
          {detailState === 'ready' && !sourceError && !selected?.standaloneAgent && delegations.length === 0 && answers.length === 0 && <p className={styles.notice}>この仕事には保存済みのAgent成果・Cloud AI回答がありません。実行中の状態はZemaで確認できます。</p>}
          {detailState === 'ready' && delegations.map((delegation) => <article className={styles.output} key={delegation.id}>
            <div className={styles.outputHead}>
              <div><small>AGENT</small><h3>{delegation.targetAgentName}</h3><span>v{delegation.targetAgentVersion} · {delegationState[delegation.state] ?? delegation.state}</span></div>
              {delegation.artifactsCaptured === 1 && <button type="button" disabled={artifactBusy === delegation.id} onClick={() => void loadArtifacts(delegation.id)}>{artifactBusy === delegation.id ? '読込中…' : '成果を見る'}</button>}
            </div>
            {delegation.artifactsCaptured !== 1 && <p>保存済み成果はまだありません。相手側の完了と成果の保存を別々に確認します。</p>}
            {artifacts[delegation.id]?.map((artifact) => {
              const content = agentOutputText(artifact.document);
              const hasFitnessPlan = artifact.document.artifacts.some((part) =>
                part.textParts.some((text) => parseFitnessPlan(text) !== null));
              return <div className={styles.document} key={artifact.id}>
                {artifact.document.artifacts.map((part, index) => <section key={index}>
                  {part.name && <h4>{part.name}</h4>}
                  {part.description && <p>{part.description}</p>}
                  {part.textParts.map((text, partIndex) => <pre key={partIndex}>{text}</pre>)}
                </section>)}
                {artifact.document.omittedNonTextParts > 0 && <p>{artifact.document.omittedNonTextParts}件のファイル・データ部分はここでは取得していません。</p>}
                {artifact.document.truncated && <p>保存時に一部が省略された成果です。</p>}
                {agentOutputExportable(artifact.document) && <div className={styles.actions}>
                  <button type="button" onClick={() => void copyText(content)}><Copy size={15} /> コピー</button>
                  <button type="button" onClick={() => downloadText(`sky-agent-${delegation.id}.txt`, content)}><Download size={15} /> テキストを保存</button>
                  {hasFitnessPlan && <Link href={`/fitness?delegation=${encodeURIComponent(delegation.id)}`}>Fitnessアプリで開く <ArrowRight size={15} /></Link>}
                </div>}
              </div>;
            })}
          </article>)}
          {detailState === 'ready' && answers.map((answer) => <article className={styles.output} key={answer.id}>
            <div className={styles.outputHead}><div><small>CLOUD AI</small><h3>{answer.quote.ceiling.modelId}</h3><span>{answer.state === 'completed' ? '処理完了' : '処理状態: ' + answer.state}</span></div></div>
            {answer.resultText ? <div className={styles.document}>
              <pre>{answer.resultText}</pre>
              <div className={styles.actions}>
                <button type="button" onClick={() => void copyText(answer.resultText!)}><Copy size={15} /> コピー</button>
                <button type="button" onClick={() => downloadText(`sky-ai-${answer.id}.txt`, answer.resultText!)}><Download size={15} /> テキストを保存</button>
              </div>
            </div> : <p>{answer.state === 'completed' && !answer.saveResult ? 'この回答は保存しない設定で実行されました。履歴から本文を再取得できません。' : '保存された回答はまだありません。'}</p>}
          </article>)}
          {artifactError && <p className={styles.notice} role="alert">{artifactError}</p>}
          {copyMessage && <output className={styles.notice}>{copyMessage}</output>}
          <p className={styles.footnote}>Agentの文章は未検証の出力です。外部送信や次のAgentへの引継ぎはZemaで内容・権限・費用を確認してください。</p>
        </section>
      </div>}
    </main>
  </WorkspaceShell>;
}
