export const ZEMA_CHAT_SESSION_KEY = 'rockstaros.zema-chat-sessions.v1';
export const ZEMA_CHAT_SESSION_TTL_MS = 10 * 60 * 1000;

const MAX_SESSIONS = 8;
const MAX_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_RESULT_LENGTH = 16_000;
const ID = /^[0-9a-f-]{36}$/;
const TOOL_ID = /^[a-z0-9][a-z0-9:.-]{0,119}$/;

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ZemaChatMessage = {
  id: string;
  side: 'me' | 'sky';
  text: string;
  tool?: string;
  suggestedTool?: string;
};

export type ZemaChatSession = {
  version: 1;
  id: string;
  toolId: string;
  createdAt: number;
  messages: ZemaChatMessage[];
  activeRequest: {
    id: string;
    text: string;
    toolId: string;
    executionProvider?: 'local-model';
  } | null;
  workflowStatus: 'ready' | 'running' | 'completed' | 'failed';
  outcome: { ok: boolean; text: string } | null;
};

function validMessage(value: unknown): value is ZemaChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Partial<ZemaChatMessage>;
  return (
    typeof message.id === 'string' &&
    message.id.length <= 100 &&
    (message.side === 'me' || message.side === 'sky') &&
    typeof message.text === 'string' &&
    message.text.length <= MAX_MESSAGE_LENGTH &&
    (message.tool === undefined ||
      (typeof message.tool === 'string' && TOOL_ID.test(message.tool))) &&
    (message.suggestedTool === undefined ||
      (typeof message.suggestedTool === 'string' &&
        TOOL_ID.test(message.suggestedTool)))
  );
}

function validSession(value: unknown, now: number): value is ZemaChatSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Partial<ZemaChatSession>;
  const request = session.activeRequest;
  const outcome = session.outcome;
  return (
    session.version === 1 &&
    typeof session.id === 'string' &&
    ID.test(session.id) &&
    typeof session.toolId === 'string' &&
    TOOL_ID.test(session.toolId) &&
    typeof session.createdAt === 'number' &&
    Number.isFinite(session.createdAt) &&
    session.createdAt <= now + 30_000 &&
    now - session.createdAt <= ZEMA_CHAT_SESSION_TTL_MS &&
    Array.isArray(session.messages) &&
    session.messages.length <= MAX_MESSAGES &&
    session.messages.every(validMessage) &&
    (request === null ||
      (Boolean(request) &&
        typeof request?.id === 'string' &&
        request.id.length <= 100 &&
        typeof request.text === 'string' &&
        request.text.length <= 2_000 &&
        typeof request.toolId === 'string' &&
        TOOL_ID.test(request.toolId) &&
        (request.executionProvider === undefined || request.executionProvider === 'local-model'))) &&
    (session.workflowStatus === 'ready' ||
      session.workflowStatus === 'running' ||
      session.workflowStatus === 'completed' ||
      session.workflowStatus === 'failed') &&
    (outcome === null ||
      (Boolean(outcome) &&
        typeof outcome?.ok === 'boolean' &&
        typeof outcome.text === 'string' &&
        outcome.text.length <= MAX_RESULT_LENGTH))
  );
}

export function readZemaChatSessions(
  storage: SessionStorage = window.sessionStorage,
  now = Date.now(),
): ZemaChatSession[] {
  const raw = storage.getItem(ZEMA_CHAT_SESSION_KEY);
  if (!raw) return [];
  try {
    if (raw.length > 1_000_000) throw new Error('oversized');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid');
    const sessions = parsed
      .filter((item) => validSession(item, now))
      .slice(0, MAX_SESSIONS) as ZemaChatSession[];
    if (sessions.length !== parsed.length)
      storage.setItem(ZEMA_CHAT_SESSION_KEY, JSON.stringify(sessions));
    return sessions;
  } catch {
    storage.removeItem(ZEMA_CHAT_SESSION_KEY);
    return [];
  }
}

export function saveZemaChatSession(
  session: ZemaChatSession,
  storage: SessionStorage = window.sessionStorage,
  now = Date.now(),
): ZemaChatSession[] {
  const bounded: ZemaChatSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES).map((message) => ({
      ...message,
      text: message.text.slice(0, MAX_MESSAGE_LENGTH),
    })),
    activeRequest: session.activeRequest
      ? {
          ...session.activeRequest,
          text: session.activeRequest.text.slice(0, 2_000),
        }
      : null,
    outcome: session.outcome
      ? { ...session.outcome, text: session.outcome.text.slice(0, MAX_RESULT_LENGTH) }
      : null,
  };
  if (!validSession(bounded, now))
    throw new Error('Zemaのチャット状態を確認してください。');
  const sessions = [
    bounded,
    ...readZemaChatSessions(storage, now).filter((item) => item.id !== bounded.id),
  ].slice(0, MAX_SESSIONS);
  storage.setItem(ZEMA_CHAT_SESSION_KEY, JSON.stringify(sessions));
  return sessions;
}
