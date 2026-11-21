'use client';
import { useEffect, useState } from 'react';
import type { AgentFeedbackSummary } from '@/lib/noah-feedback';
export function useNoahFeedback(ids: string[]) {
  const key = ids.join(','),
    [attempt, setAttempt] = useState(0),
    [snapshot, setSnapshot] = useState<{
      key: string;
      rows: AgentFeedbackSummary[];
      error: string;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (!key) return;
    const selected = key.split(',');
    void Promise.all(
      Array.from({ length: Math.ceil(selected.length / 20) }, (_, i) =>
        selected.slice(i * 20, i * 20 + 20),
      ).map(async (group) => {
        const r = await fetch(
          `/api/noah/feedback?ids=${encodeURIComponent(group.join(','))}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const d = (await r.json()) as {
          summaries: AgentFeedbackSummary[];
          error?: string;
        };
        if (!r.ok || !Array.isArray(d.summaries))
          throw Error(d.error || '評価を読み込めませんでした。');
        return d.summaries as AgentFeedbackSummary[];
      }),
    )
      .then((groups) => {
        if (!controller.signal.aborted)
          setSnapshot({ key, rows: groups.flat(), error: '' });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setSnapshot({ key, rows: [], error: e.message });
      });
    return () => controller.abort();
  }, [key, attempt]);
  useEffect(() => {
    const reset = () => {
      setSnapshot(null);
      setAttempt((n) => n + 1);
    };
    window.addEventListener('rockstar-community-changed', reset);
    return () =>
      window.removeEventListener('rockstar-community-changed', reset);
  }, []);
  const current = snapshot?.key === key ? snapshot : null;
  return {
    rows: current?.rows ?? [],
    error: current?.error ?? '',
    reload: () => setAttempt((n) => n + 1),
    update: (row: AgentFeedbackSummary) =>
      setSnapshot((s) =>
        s?.key === key &&
        s.rows.find((v) => v.agentId === row.agentId)?.ownerScope ===
          row.ownerScope
          ? {
              ...s,
              rows: [...s.rows.filter((v) => v.agentId !== row.agentId), row],
            }
          : s,
      ),
  };
}
