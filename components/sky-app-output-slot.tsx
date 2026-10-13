'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { isSavedAgentDocument, type SavedAgentDocument } from '@/lib/sky-output-presenter';

type State = 'loading' | 'ready' | 'signed_out' | 'unavailable';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function SkyAppOutputSlot({
  delegationId,
  children,
  returnTo,
}: {
  delegationId: string;
  children: (documents: SavedAgentDocument[]) => ReactNode;
  returnTo: string;
}) {
  const [snapshot, setSnapshot] = useState<{ id: string; state: State; documents: SavedAgentDocument[] }>({
    id: delegationId, state: 'loading', documents: [],
  });
  const validDelegationId = uuid.test(delegationId);
  useEffect(() => {
    if (!validDelegationId) return;
    const controller = new AbortController();
    void fetch(`/api/sky/a2a-delegations/${encodeURIComponent(delegationId)}/artifacts`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401) {
        setSnapshot({ id: delegationId, state: 'signed_out', documents: [] });
        return;
      }
      if (!response.ok) throw new Error('OUTPUT_UNAVAILABLE');
      const data = await response.json() as {
        captured?: boolean;
        artifacts?: Array<{ document?: SavedAgentDocument }>;
      };
      if (!data.captured) {
        setSnapshot({ id: delegationId, state: 'ready', documents: [] });
        return;
      }
      const saved = data.artifacts?.map((item) => item.document);
      if (!saved || saved.some((document) => !isSavedAgentDocument(document)))
        throw new Error('INVALID_OUTPUT');
      setSnapshot({ id: delegationId, state: 'ready', documents: saved as SavedAgentDocument[] });
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ id: delegationId, state: 'unavailable', documents: [] });
    });
    return () => controller.abort();
  }, [delegationId, validDelegationId]);

  if (!validDelegationId) return <p role="alert">Agent成果の指定が正しくありません。Skyから開き直してください。</p>;
  const state = snapshot.id === delegationId ? snapshot.state : 'loading';
  if (state === 'loading') return <p>Skyの成果を読み込んでいます…</p>;
  if (state === 'signed_out') return <p><Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>サインイン</Link>して、自分のAgent成果を開いてください。</p>;
  if (state === 'unavailable') return <p role="alert">この成果を確認できません。Skyで保存状態と本人アカウントを確認してください。</p>;
  if (snapshot.documents.length === 0) return <p>このAgentの保存済み成果はまだありません。</p>;
  return <>{children(snapshot.documents)}</>;
}
