'use client';

import { useCallback, useEffect, useState } from 'react';
import { catalog, type Automation } from '@/lib/catalog';
import { textModelProviderDefinition } from '@/lib/llm-providers';
import { consumeSkyZemaHandoff } from '@/lib/sky-zema-handoff';
import { readZemaChatSessions, saveZemaChatSession, type ZemaChatMessage, type ZemaChatSession } from '@/lib/zema-chat-session';
import type { JenniferCoordinationPlan } from '@/lib/jennifer-coordination';

export type ChatEntry = ZemaChatMessage;
export type ActiveRequest = Required<NonNullable<ZemaChatSession['activeRequest']>>;
export type WorkflowStatus = ZemaChatSession['workflowStatus'];

type SessionOptions = {
  loading: boolean;
  workView: boolean;
  preferredTool: string;
  requestedThreadId: string;
  setSelectedToolId: (toolId: string) => void;
  roleFor: (tool: Automation) => string;
};

/** Same-tab chat state only. Storage retains its original TTL, bounds and owner cleanup. */
export function useSkyChatSession({ loading, workView, preferredTool, requestedThreadId, setSelectedToolId, roleFor }: SessionOptions) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [requestStartedAt, setRequestStartedAt] = useState(0);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('ready');
  const [threadId, setThreadId] = useState('');
  const [threadCreatedAt, setThreadCreatedAt] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const [recentThreads, setRecentThreads] = useState<ZemaChatSession[]>([]);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [coordinationPlan, setCoordinationPlan] = useState<JenniferCoordinationPlan | null>(null);

  const resetSession = useCallback((resetRequestTime = true) => {
    setSessionReady(false);
    setThreadId('');
    setThreadCreatedAt(0);
    setMessages([]);
    setActiveRequest(null);
    if (resetRequestTime) setRequestStartedAt(0);
    setWorkflowStatus('ready');
    setOutcome(null);
    setCoordinationPlan(null);
  }, []);

  useEffect(() => {
    if (loading || workView) return;
    const frame = window.requestAnimationFrame(() => {
      let sessions: ZemaChatSession[] = [];
      try { sessions = readZemaChatSessions(); } catch { /* Private storage may be unavailable. */ }
      setRecentThreads(sessions);
      resetSession();
      const saved = sessions.find((item) => item.id === requestedThreadId && item.toolId === preferredTool);
      if (saved) {
        setThreadId(saved.id);
        setThreadCreatedAt(saved.createdAt);
        setSelectedToolId(saved.toolId);
        setMessages(saved.messages);
        setActiveRequest(saved.activeRequest
          ? {
              ...saved.activeRequest,
              executionProvider: saved.activeRequest.executionProvider ?? 'local-model',
              plannerProvider: saved.activeRequest.plannerProvider ?? 'local-model',
              plannerModel: saved.activeRequest.plannerModel ??
                textModelProviderDefinition(saved.activeRequest.plannerProvider ?? 'local-model').defaultModel,
            }
          : null);
        setRequestStartedAt(saved.createdAt);
        if (saved.workflowStatus === 'running') {
          setWorkflowStatus('failed');
          setMessages((current) => [...current, {
            id: `resume-${saved.id}`,
            side: 'sky',
            text: '画面を開き直しました。直前の実行結果はここでは確認できません。履歴を確認してから再実行してください。',
            tool: saved.toolId,
          }]);
        } else setWorkflowStatus(saved.workflowStatus);
        setOutcome(saved.outcome);
        setCoordinationPlan(saved.coordination ?? null);
        setSessionReady(true);
        return;
      }
      if (!preferredTool || !requestedThreadId) return;
      let handoff;
      try { handoff = consumeSkyZemaHandoff(preferredTool, undefined, undefined, requestedThreadId); } catch { return; }
      if (!handoff || handoff.id !== requestedThreadId) return;
      const tool = catalog.find((item) => item.id === handoff.toolId);
      if (!tool) return;
      const id = `handoff-${handoff.id}`;
      setSelectedToolId(tool.id);
      setThreadId(handoff.id);
      setThreadCreatedAt(handoff.createdAt);
      setMessages([
        ...(handoff.request ? [{ id: `${id}-me`, side: 'me' as const, text: handoff.request, tool: tool.id }] : []),
        { id: `${id}-sky`, side: 'sky', text: handoff.request
          ? `${roleFor(tool)}へSkyから引き継ぎました。入力を確認し、必要な承認を得てから実行します。進捗と結果はこのチャットに表示します。`
          : `${roleFor(tool)}を開きました。下の入力欄に依頼を送ってください。`, tool: tool.id },
      ]);
      setActiveRequest(handoff.request ? {
        id,
        text: handoff.request,
        toolId: tool.id,
        executionProvider: handoff.executionProvider ?? 'local-model',
        plannerProvider: 'local-model',
        plannerModel: textModelProviderDefinition('local-model').defaultModel,
      } : null);
      setRequestStartedAt(handoff.createdAt);
      setSessionReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, preferredTool, requestedThreadId, workView, resetSession, setSelectedToolId, roleFor]);

  useEffect(() => {
    if (!sessionReady || !threadId || threadId !== requestedThreadId || !threadCreatedAt) return;
    try {
      const sessions = saveZemaChatSession({
        version: 1, id: threadId, toolId: preferredTool, createdAt: threadCreatedAt,
        messages, activeRequest, workflowStatus, outcome, coordination: coordinationPlan,
      });
      const frame = window.requestAnimationFrame(() => setRecentThreads(sessions));
      return () => window.cancelAnimationFrame(frame);
    } catch { /* Keep the current conversation usable without tab storage. */ }
  }, [sessionReady, threadId, requestedThreadId, threadCreatedAt, preferredTool, messages, activeRequest, workflowStatus, outcome, coordinationPlan]);

  function beginSession(session: ZemaChatSession) {
    setRecentThreads(saveZemaChatSession(session));
    setThreadId(session.id);
    setThreadCreatedAt(session.createdAt);
    setCoordinationPlan(session.coordination ?? null);
    setSessionReady(true);
  }

  return { messages, setMessages, activeRequest, setActiveRequest,
    requestStartedAt, setRequestStartedAt, workflowStatus, setWorkflowStatus,
    threadId, threadCreatedAt, recentThreads, outcome, setOutcome, coordinationPlan, setCoordinationPlan,
    resetSession, beginSession };
}
