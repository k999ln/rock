'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { noahProjectHandoffDraft, noahProjectHref, type NoahProjectDetail } from '@/lib/noah-project-view';
import styles from './eve-sync-workspace.module.css';

export default function EveNoahProjectHandoff({ id, disabled, onDraft }: {
  id: string;
  disabled: boolean;
  onDraft: (draft: string) => void;
}) {
  const [detail, setDetail] = useState<NoahProjectDetail | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    void fetch(`/api/noah/discover/project?${new URLSearchParams({ id })}`, { cache: 'no-store', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw Error('noah_project_unavailable');
        const project: NoahProjectDetail = await response.json();
        if (!project.card.sources?.length) throw Error('noah_project_source_unavailable');
        if (!request.signal.aborted) setDetail(project);
      })
      .catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => request.abort();
  }, [id, attempt]);

  return <section className={styles.handoffNotice} aria-label="Noahから受け取った候補">
    <h2>{detail?.card.name ?? 'Noahから受け取った候補'}</h2>
    {failed ? <p role="alert">候補の出典を確認できません。掲載が終了している場合は、Noahで候補を選び直してください。</p>
      : detail ? <p>出典から利用条件を調べ、接続から成果までの手順をEveに依頼できます。</p>
      : <output>候補の出典を確認しています…</output>}
    <nav>
      {detail && <button type="button" disabled={disabled} onClick={() => onDraft(noahProjectHandoffDraft(detail))}>依頼文を入力する</button>}
      {failed && <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>再確認する</button>}
      <Link href={noahProjectHref(id)}>Noahの候補に戻る</Link>
    </nav>
  </section>;
}
