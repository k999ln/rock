import type { ZemaChatMessage, ZemaChatSession } from './zema-chat-session.ts';
import { isTextModelProvider } from './llm-providers.ts';
const isSkyToolId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9:.-]{0,119}$/.test(value);

export class EveHistoryError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type EveHistoryKeys = { current: string; keys: Record<string, string> };
export type EveHistoryItem = { session: ZemaChatSession; revision: number; remember: boolean; before: number | null };
export type EveMemorySource = { threadId: string; messageId: string; text: string; updatedAt: number; toolId:string; agent?:{id:string;revision:number} };
type Statement = D1PreparedStatement;
type Database = Pick<D1Database, 'prepare' | 'batch'>;
type ThreadRow = { id: string; revision: number; remember: number; envelope: string; updated_at: number; deleted_at:number };
type MessageRow = { seq: number; message_id: string; envelope: string; updated_at: number; thread_id?: string };
type Envelope = { keyId: string; iv: string; ciphertext: string };
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const messageId = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
const buffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer as ArrayBuffer;
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
const unbase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

export function eveHistoryKeys(input: unknown): EveHistoryKeys {
  try {
    const value = typeof input === 'string' ? JSON.parse(input) as EveHistoryKeys : null;
    if (!value || !/^[a-z0-9_-]{1,40}$/.test(value.current) || !value.keys || Object.keys(value.keys).length > 8 ||
      !value.keys[value.current] || Object.entries(value.keys).some(([id, key]) => !/^[a-z0-9_-]{1,40}$/.test(id) || !/^[a-f0-9]{64}$/i.test(key))) throw new Error();
    return value;
  } catch { throw new EveHistoryError('会話の暗号化保存が未設定です。保存済みとは表示しません。', 503); }
}
export function eveThreadId(input: unknown) {
  if (typeof input !== 'string' || !uuid.test(input)) throw new EveHistoryError('会話IDを確認してください。');
  return input;
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EveHistoryError('会話の形式を確認してください。');
  return input as Record<string, unknown>;
}
function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new EveHistoryError('保存できない項目が含まれています。生体認証の原本や認証鍵は履歴APIでは受け付けません。');
}
export function eveHistoryInput(input: unknown) {
  const v = object(input); fields(v, ['session', 'revision', 'remember']);
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || typeof v.remember !== 'boolean') throw new EveHistoryError('会話の版と記憶設定を確認してください。');
  const s = object(v.session); fields(s, ['version','id','toolId','agent','createdAt','messages','activeRequest','workflowStatus','outcome']);
  eveThreadId(s.id);
  if (s.version !== 1 || !isSkyToolId(s.toolId) || !Number.isSafeInteger(s.createdAt) || Number(s.createdAt) < 0 || Number(s.createdAt) > Date.now() + 30000 ||
    !Array.isArray(s.messages) || s.messages.length > 16 || !['ready','running','completed','failed'].includes(String(s.workflowStatus))) throw new EveHistoryError('会話の形式を確認してください。');
  const ids = new Set<string>();
  for (const raw of s.messages) {
    const m = object(raw); fields(m, ['id','side','text','tool','suggestedTool']);
    if (typeof m.id !== 'string' || !messageId.test(m.id) || ids.has(m.id) || !['me','sky'].includes(String(m.side)) || typeof m.text !== 'string' || m.text.length > 32000 ||
      (m.tool !== undefined && !isSkyToolId(m.tool)) || (m.suggestedTool !== undefined && !isSkyToolId(m.suggestedTool))) throw new EveHistoryError('発言の形式または長さを確認してください。');
    ids.add(m.id);
  }
  if (s.agent !== undefined) {
    const agent = object(s.agent); fields(agent, ['id','revision']);
    if (typeof agent.id !== 'string' || !messageId.test(agent.id) || !Number.isSafeInteger(agent.revision) || Number(agent.revision) < 0) throw new EveHistoryError('担当の版を確認してください。');
  }
  // Persisted conversational state is a record, never a resumable execution grant.
  if (s.activeRequest !== null) {
    const request = object(s.activeRequest); fields(request, ['id','text','toolId','executionProvider','plannerProvider','plannerModel']);
    if (typeof request.id !== 'string' || !messageId.test(request.id) || typeof request.text !== 'string' || request.text.length > 32000 || !isSkyToolId(request.toolId) ||
      (request.executionProvider !== undefined && request.executionProvider !== 'local-model') ||
      (request.plannerProvider !== undefined && !isTextModelProvider(request.plannerProvider)) ||
      (request.plannerModel !== undefined && (typeof request.plannerModel !== 'string' || request.plannerModel.length > 120))) throw new EveHistoryError('依頼の記録を確認してください。');
  }
  if (s.outcome !== null) {
    const outcome = object(s.outcome); fields(outcome, ['ok','text']);
    if (typeof outcome.ok !== 'boolean' || typeof outcome.text !== 'string' || outcome.text.length > 32000) throw new EveHistoryError('結果の記録を確認してください。');
  }
  return { session: s as unknown as ZemaChatSession, revision: Number(v.revision), remember: v.remember };
}

/** Search only normalized word tokens, keyed per owner; never write plaintext prompts into indexes. */
export function eveSearchWords(input: string, limit = 240) {
  const text = input.normalize('NFKC').toLocaleLowerCase('ja-JP').slice(0, 32000);
  const words = new Set<string>();
  for (const part of new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)) {
    const word = part.segment;
    if (part.isWordLike && word.length >= 2 && word.length <= 80 && !/^(です|ます|した|する|ある|いる|これ|それ|こと|よう|ため|the|and|that|with)$/.test(word)) words.add(word);
    if (words.size >= limit) break;
  }
  for(const match of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu)){
    for(let i=0;i<match[0].length-1&&words.size<limit;i++)words.add(match[0].slice(i,i+2));
    if(words.size>=limit)break;
  }
  return [...words];
}

export function eveHistoryStore(db: Database, owner: string, keys: EveHistoryKeys) {
  const derived = new Map<string, Promise<CryptoKey>>();
  async function key(id: string, purpose: 'encrypt'|'search') {
    const cacheId = `${id}:${purpose}`;
    if (!derived.has(cacheId)) derived.set(cacheId, (async () => {
      const hex = keys.keys[id]; if (!hex) throw new EveHistoryError('この履歴の復号鍵がありません。鍵を復旧してください。', 503);
      const raw = Uint8Array.from(hex.match(/../g)!, byte => Number.parseInt(byte, 16));
      const master = await crypto.subtle.importKey('raw', buffer(raw), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:buffer(encoder.encode(owner)),info:buffer(encoder.encode(`rockstar-eve-v1:${purpose}`))}, master,
        purpose === 'encrypt' ? {name:'AES-GCM',length:256} : {name:'HMAC',hash:'SHA-256',length:256}, false, purpose === 'encrypt' ? ['encrypt','decrypt'] : ['sign']);
    })());
    return derived.get(cacheId)!;
  }
  async function encrypt(value: unknown, scope: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv:buffer(iv),additionalData:buffer(encoder.encode(`${owner}\0${scope}`))}, await key(keys.current, 'encrypt'), encoder.encode(JSON.stringify(value)));
    return JSON.stringify({keyId:keys.current,iv:base64(iv),ciphertext:base64(new Uint8Array(cipher))} satisfies Envelope);
  }
  async function decrypt<T>(value: string, scope: string): Promise<T> {
    try {
      const envelope = JSON.parse(value) as Envelope;
      const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:buffer(unbase64(envelope.iv)),additionalData:buffer(encoder.encode(`${owner}\0${scope}`))}, await key(envelope.keyId,'encrypt'), buffer(unbase64(envelope.ciphertext)));
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as T;
    } catch { throw new EveHistoryError('履歴を復号できません。上書きせず、鍵と保存データを確認してください。', 503); }
  }
  async function terms(words: string[], keyId = keys.current) {
    return Promise.all(words.map(async word => base64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(keyId,'search'),encoder.encode(word))))));
  }
  const thread = (id: string) => db.prepare('SELECT id,revision,remember,envelope,updated_at,deleted_at FROM eve_conversations WHERE owner_id=? AND id=?').bind(owner,eveThreadId(id)).first<ThreadRow>();
  async function unpack(row: ThreadRow): Promise<ZemaChatSession> { return decrypt<ZemaChatSession>(row.envelope,`thread:${row.id}`); }
  async function list(cursor = '') {
    const match = cursor ? /^(\d{1,16}):([a-f0-9-]{36})$/i.exec(cursor) : null;
    if (cursor && (!match || !uuid.test(match[2]))) throw new EveHistoryError('履歴の続き位置を確認してください。');
    const rows = await db.prepare('SELECT id,revision,remember,envelope,updated_at,deleted_at FROM eve_conversations WHERE owner_id=? AND deleted_at=0 AND (?=0 OR updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT 50')
      .bind(owner,match?1:0,Number(match?.[1]??0),Number(match?.[1]??0),match?.[2]??'').all<ThreadRow>();
    const items = await Promise.all(rows.results.map(async row => ({session:await unpack(row),revision:row.revision,remember:row.remember===1,before:null})));
    const last = rows.results.at(-1);
    return {items,cursor:rows.results.length===50&&last?`${last.updated_at}:${last.id}`:null};
  }
  async function get(id: string, before = 0): Promise<EveHistoryItem> {
    if (!Number.isSafeInteger(before) || before < 0) throw new EveHistoryError('履歴の位置を確認してください。');
    const row = await thread(id); if (!row||row.deleted_at) throw new EveHistoryError('会話が見つかりません。',404);
    const messages = await db.prepare('SELECT seq,message_id,envelope,updated_at FROM eve_messages WHERE owner_id=? AND thread_id=? AND (?=0 OR seq<?) ORDER BY seq DESC LIMIT 100').bind(owner,id,before,before).all<MessageRow>();
    const header = await unpack(row);
    return {session:{...header,activeRequest:null,messages:await Promise.all(messages.results.toReversed().map(m=>decrypt<ZemaChatMessage>(m.envelope,`message:${id}:${m.message_id}`)))},revision:row.revision,remember:row.remember===1,before:messages.results.length===100?messages.results.at(-1)!.seq:null};
  }
  async function save(input: unknown): Promise<{revision:number}> {
    const {session,revision,remember}=eveHistoryInput(input),id=session.id;
    const before=await thread(id);if(before?.deleted_at)throw new EveHistoryError('削除済みの会話は再保存できません。新しい会話を作成してください。',410);
    if ((before?.revision??0)!==revision) throw new EveHistoryError('別端末で会話が更新されています。読み直してから続きを保存してください。',409);
    const previous=before?await unpack(before):null;
    const title=previous?.messages[0]??session.messages.find(m=>m.side==='me');
    const header={...session,messages:title?[{...title,text:title.text.slice(0,160)}]:[],activeRequest:null};
    const envelope=await encrypt(header,`thread:${id}`),token=crypto.randomUUID(),now=Date.now();
    const statements:Statement[]=[
      db.prepare('INSERT INTO eve_conversations(owner_id,id,revision,remember,envelope,updated_at,save_token) VALUES(?,?,0,?,?,?,?) ON CONFLICT(owner_id,id) DO NOTHING').bind(owner,id,Number(remember),envelope,now,''),
      db.prepare('UPDATE eve_conversations SET revision=revision+1,remember=?,envelope=?,updated_at=?,save_token=? WHERE owner_id=? AND id=? AND revision=?').bind(Number(remember),envelope,now,token,owner,id,revision),
    ];
    for (const message of session.messages) {
      const encrypted=await encrypt(message,`message:${id}:${message.id}`);
      const tokens=message.side==='me'?await terms(eveSearchWords(message.text)):[];
      statements.push(
        db.prepare('INSERT INTO eve_messages(owner_id,thread_id,message_id,envelope,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND save_token=?) ON CONFLICT(owner_id,thread_id,message_id) DO UPDATE SET envelope=excluded.envelope,updated_at=excluded.updated_at').bind(owner,id,message.id,encrypted,now,owner,id,token),
        db.prepare('DELETE FROM eve_memory_terms WHERE owner_id=? AND thread_id=? AND message_id=? AND EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND save_token=?)').bind(owner,id,message.id,owner,id,token),
        db.prepare('INSERT INTO eve_memory_terms(owner_id,token,thread_id,message_id) SELECT ?,value,?,? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND save_token=?) ON CONFLICT DO NOTHING').bind(owner,id,message.id,JSON.stringify(tokens),owner,id,token),
      );
    }
    const result=await db.batch(statements);
    if(result[1].meta.changes!==1) throw new EveHistoryError('別端末で更新されています。未保存の会話を保持して読み直してください。',409);
    return {revision:revision+1};
  }
  async function recall(query: string, exclude = ''):Promise<EveMemorySource[]> {
    if(typeof query!=='string'||query.length>4000||(exclude&&!uuid.test(exclude)))throw new EveHistoryError('記憶の検索条件を確認してください。');
    const words=eveSearchWords(query,8);if(!words.length)return[];
    const tokens=(await Promise.all(Object.keys(keys.keys).map(id=>terms(words,id)))).flat();
    const rows=await db.prepare(`SELECT m.seq,m.message_id,m.thread_id,m.envelope,m.updated_at,COUNT(DISTINCT t.token) AS score FROM eve_memory_terms t JOIN eve_messages m ON m.owner_id=t.owner_id AND m.thread_id=t.thread_id AND m.message_id=t.message_id JOIN eve_conversations c ON c.owner_id=m.owner_id AND c.id=m.thread_id WHERE t.owner_id=? AND c.remember=1 AND c.deleted_at=0 AND m.thread_id<>? AND t.token IN (${tokens.map(()=>'?').join(',')}) GROUP BY m.seq ORDER BY score DESC,m.updated_at DESC LIMIT 6`).bind(owner,exclude,...tokens).all<MessageRow>();
    return Promise.all(rows.results.map(async row=>{
      const header=await thread(row.thread_id!);if(!header||header.deleted_at||!header.remember) return null;
      const source=await unpack(header);
      return {threadId:row.thread_id!,messageId:row.message_id,text:(await decrypt<ZemaChatMessage>(row.envelope,`message:${row.thread_id}:${row.message_id}`)).text.slice(0,1200),updatedAt:row.updated_at,toolId:source.toolId,...(source.agent?{agent:source.agent}:{})};
    })).then(items=>items.filter((item):item is NonNullable<typeof item>=>item!==null));
  }
  async function remove(id:string,revision:number) {
    const row=await thread(id);if(!row||row.deleted_at)throw new EveHistoryError('会話が見つかりません。',404);
    if(!Number.isSafeInteger(revision)||row.revision!==revision)throw new EveHistoryError('会話の版が変わっています。',409);
    // All deletes are revision-fenced; a concurrent save cannot lose a new revision.
    const token=crypto.randomUUID();
    const result=await db.batch([
      db.prepare('UPDATE eve_conversations SET save_token=? WHERE owner_id=? AND id=? AND revision=?').bind(token,owner,id,revision),
      db.prepare('DELETE FROM eve_memory_terms WHERE owner_id=? AND thread_id=? AND EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND save_token=?)').bind(owner,id,owner,id,token),
      db.prepare('DELETE FROM eve_messages WHERE owner_id=? AND thread_id=? AND EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND save_token=?)').bind(owner,id,owner,id,token),
      db.prepare("UPDATE eve_conversations SET deleted_at=?,revision=revision+1,envelope='{}',save_token='' WHERE owner_id=? AND id=? AND save_token=?").bind(Date.now(),owner,id,token),
    ]);
    if(result[0].meta.changes!==1)throw new EveHistoryError('別端末で更新されています。',409);
  }
  return {list,get,save,recall,remove};
}


/** Opaque account binding, not an authentication credential or execution grant. */
export async function eveHistoryOwnerBinding(owner: string, keys: EveHistoryKeys) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${owner}:eve-history:${keys.keys[keys.current]}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
