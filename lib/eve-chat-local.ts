import type { EveChatCandidate, EveChatMessage, EveChatPlan } from './eve-chat.ts';
export type EveLocalMessage = EveChatMessage & { id: string; participantRequestId?: string; plan?: EveChatPlan | null; candidates?: EveChatCandidate[] };
export type EveLocalChat = { id: string; owner: string; revision: number; updatedAt: number; title: string; draft: string; messages: EveLocalMessage[] };
export type EveLocalSummary = Pick<EveLocalChat, 'id' | 'owner' | 'updatedAt' | 'title'>;
export const newEveChat = (owner: string): EveLocalChat => ({ id: crypto.randomUUID(), owner, revision: 0, updatedAt: Date.now(), title: '新しい相談', draft: '', messages: [] });
export const EVE_LOCAL_CONFLICT = '別のタブでこの会話が更新されました。入力を書き出してから画面を読み直してください。';
/** No network transport or cloud fallback is permitted in this store. */
export function eveLocalStore(factory: IDBFactory = indexedDB) {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('noah-eve-chat-v1', 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('chats', { keyPath: ['owner', 'id'] }); store.createIndex('owner', 'owner'); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('端末の保存先が使用中です。ほかのNoahのタブを閉じて読み直してください。'));
  });
  return {
    async list(owner: string): Promise<EveLocalSummary[]> {
      const db = await open();
      try { return await new Promise((resolve, reject) => {
        const tx = db.transaction('chats', 'readonly'), request = tx.objectStore('chats').index('owner').openCursor(owner);
        const summaries: EveLocalSummary[] = [];
        request.onsuccess = () => { const cursor = request.result; if (!cursor) return; const { id, owner: scope, title, updatedAt } = cursor.value as EveLocalChat; summaries.push({ id, owner: scope, title, updatedAt }); cursor.continue(); };
        tx.oncomplete = () => resolve(summaries.sort((a, b) => b.updatedAt - a.updatedAt));
        tx.onabort = () => reject(tx.error);
      }); } finally { db.close(); }
    },
    async get(owner: string, id: string): Promise<EveLocalChat | null> {
      const db = await open();
      try { return await new Promise((resolve, reject) => {
        const tx = db.transaction('chats', 'readonly'), request = tx.objectStore('chats').get([owner, id]);
        tx.oncomplete = () => resolve(request.result ?? null);
        tx.onabort = () => reject(tx.error);
      }); } finally { db.close(); }
    },
    async save(chat: EveLocalChat): Promise<EveLocalChat> {
      const db = await open();
      try { return await new Promise((resolve, reject) => {
        const tx = db.transaction('chats', 'readwrite'), store = tx.objectStore('chats');
        const request = store.get([chat.owner, chat.id]);
        const next = { ...chat, revision: chat.revision + 1, updatedAt: Date.now() };
        let conflict = false;
        request.onsuccess = () => {
          if ((request.result?.revision ?? 0) !== chat.revision) { conflict = true; tx.abort(); return; }
          store.put(next);
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = () => reject(new Error(conflict ? EVE_LOCAL_CONFLICT : '会話を端末へ保存できませんでした。書き出して保管してください。'));
      }); } finally { db.close(); }
    },
  };
}
