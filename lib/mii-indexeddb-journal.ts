import type { MiiCancelJournal, MiiPendingCancel } from './mii-work-adapter.ts';

const DATABASE = 'rockstaros-mii-cancel-journal-v1';
const STORE = 'pending';
const OWNER = /^owner-v1:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validKey(value: unknown): value is Pick<MiiPendingCancel, 'ownerScope' | 'jobId'> {
  if (!value || typeof value !== 'object') return false;
  const key = value as Record<string, unknown>;
  return typeof key.ownerScope === 'string' && OWNER.test(key.ownerScope) &&
    typeof key.jobId === 'string' && UUID.test(key.jobId);
}
function validRecord(value: unknown): value is MiiPendingCancel {
  if (!validKey(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return Object.keys(record).sort().join(',') === 'commandId,jobId,ownerScope,revision,schema' &&
    record.schema === 'rockstaros.mii-plan-cancel/1' && typeof record.commandId === 'string' &&
    UUID.test(record.commandId) && Number.isSafeInteger(record.revision) && Number(record.revision) >= 0;
}
function sameRecord(a: MiiPendingCancel, b: MiiPendingCancel) {
  return a.schema === b.schema && a.ownerScope === b.ownerScope && a.jobId === b.jobId &&
    a.revision === b.revision && a.commandId === b.commandId;
}

/**
 * Browser host journal. Never requests persistent-storage permission: the host
 * must already have persistent origin storage and report strict transaction
 * durability. IndexedDB is origin-scoped, not an authentication boundary.
 * Strict is a browser durability contract, not a physical power-loss test.
 */
export function createMiiIndexedDbJournal(): MiiCancelJournal {
  async function open(): Promise<IDBDatabase> {
    if (!globalThis.isSecureContext || typeof indexedDB === 'undefined' ||
        typeof navigator === 'undefined' || !navigator.storage ||
        typeof navigator.storage.persisted !== 'function' || !(await navigator.storage.persisted()))
      throw new Error('MII_DURABLE_STORAGE_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(DATABASE, 1);
      const rejectOnce = (error: Error) => { if (!settled) { settled = true; reject(error); } };
      request.onupgradeneeded = event => {
        if (event.oldVersion === 0 && !request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: ['ownerScope', 'jobId'] });
        else request.transaction?.abort();
      };
      request.onblocked = () => rejectOnce(new Error('MII_JOURNAL_BLOCKED'));
      request.onerror = () => rejectOnce(new Error('MII_JOURNAL_OPEN_FAILED'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        db.onversionchange = () => db.close(); settled = true; resolve(db);
      };
    });
  }
  async function transaction<T>(execute: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, 'readwrite', { durability: 'strict' });
          if (tx.durability !== 'strict') { tx.abort(); throw new Error('MII_STRICT_DURABILITY_UNAVAILABLE'); }
          const store = tx.objectStore(STORE);
          if (JSON.stringify(store.keyPath) !== JSON.stringify(['ownerScope', 'jobId']) || store.autoIncrement) {
            tx.abort(); throw new Error('MII_JOURNAL_SCHEMA_INVALID');
          }
          let value: T; let ready = false;
          tx.oncomplete = () => ready ? resolve(value) : reject(new Error('MII_JOURNAL_NO_RESULT'));
          tx.onabort = () => reject(new Error('MII_JOURNAL_TRANSACTION_FAILED'));
          tx.onerror = () => { /* onabort reports failure */ };
          execute(store, result => { value = result; ready = true; });
        } catch (error) { reject(error); }
      });
    } finally { db.close(); }
  }
  return {
    async read(key) {
      if (!validKey(key)) throw new Error('MII_JOURNAL_KEY_INVALID');
      return transaction<MiiPendingCancel | null>((store, finish) => {
        const request = store.get([key.ownerScope, key.jobId]);
        request.onsuccess = () => {
          if (request.result === undefined) finish(null);
          else if (validRecord(request.result) && request.result.ownerScope === key.ownerScope && request.result.jobId === key.jobId)
            finish(request.result);
          else store.transaction.abort();
        };
      });
    },
    async claim(record) {
      if (!validRecord(record)) throw new Error('MII_JOURNAL_RECORD_INVALID');
      return transaction<'claimed' | 'occupied'>((store, finish) => {
        const request = store.add(record);
        request.onsuccess = () => finish('claimed');
        request.onerror = event => {
          if (request.error?.name === 'ConstraintError') { event.preventDefault(); event.stopPropagation(); finish('occupied'); }
        };
      });
    },
    async settle(record) {
      if (!validRecord(record)) throw new Error('MII_JOURNAL_RECORD_INVALID');
      return transaction<boolean>((store, finish) => {
        const request = store.get([record.ownerScope, record.jobId]);
        request.onsuccess = () => {
          if (request.result === undefined) { finish(false); return; }
          if (!validRecord(request.result)) { store.transaction.abort(); return; }
          if (!sameRecord(request.result, record)) { finish(false); return; }
          const deletion = store.delete([record.ownerScope, record.jobId]);
          deletion.onsuccess = () => finish(true);
        };
      });
    },
  };
}
