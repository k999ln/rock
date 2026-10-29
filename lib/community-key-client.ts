import type { CommunityKeys } from './community-access';
const profileKey = 'rockstar.community.current-profile';
function storageKey() {
  return `rockstar.community.keys.v2.${window.localStorage.getItem(profileKey) ?? 'unbound'}`;
}
export function setCommunityKeyProfile(id: string) {
  if (window.localStorage.getItem(profileKey) !== id) {
    window.localStorage.setItem(profileKey, id);
    window.dispatchEvent(new Event('rockstar-community-changed'));
    return true;
  }
  return false;
}
type KeyRecord = { accessKey: string; recoveryKey?: string };
function read(): Record<string, KeyRecord> {
  try {
    const v = JSON.parse(window.localStorage.getItem(storageKey()) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
export function newCommunitySecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function saveCommunityKey(id: string, record: KeyRecord, notify = true) {
  const values = read();
  values[id] = { ...values[id], ...record };
  window.localStorage.setItem(storageKey(), JSON.stringify(values));
  if (notify) window.dispatchEvent(new Event('rockstar-community-changed'));
}
export function forgetCommunityKey(id: string) {
  const v = read();
  delete v[id];
  window.localStorage.setItem(storageKey(), JSON.stringify(v));
  window.dispatchEvent(new Event('rockstar-community-changed'));
}
export function communityRequestHeaders() {
  const values: CommunityKeys = {};
  for (const [id, r] of Object.entries(read()))
    if (/^[a-f0-9-]{36}$/.test(id) && /^[a-f0-9]{64}$/.test(r.accessKey))
      values[id] = r.accessKey;
  return { 'x-rock-community-keys': JSON.stringify(values) };
}
/** Send only the selected community's access key; never its recovery key. */
export function selectedCommunityRequestHeaders(id: string | null): Record<string,string> {
  if (!id) return {};
  const record = read()[id];
  if (!/^[a-f0-9-]{36}$/.test(id) || !record || !/^[a-f0-9]{64}$/.test(record.accessKey)) return {};
  return { 'x-rock-community-keys': JSON.stringify({ [id]: record.accessKey }) };
}
export function prepareCommunityKey(id: string, creator = false) {
  const current = read()[id],
    record = {
      accessKey: current?.accessKey ?? newCommunitySecret(),
      ...(creator
        ? { recoveryKey: current?.recoveryKey ?? newCommunitySecret() }
        : {}),
    };
  saveCommunityKey(id, record, false);
  return record;
}
export async function communityFetch<T>(
  path: string,
  input?: unknown,
): Promise<T> {
  if (!/^\/api\/sky\/(social|community-os)(\?|$)/.test(path))
    throw new Error(
      '専用鍵はこのサイトのコミュニティーAPIにだけ送信できます。',
    );
  const response = await fetch(path, {
    cache: 'no-store',
    headers: {
      ...communityRequestHeaders(),
      ...(input ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(input ? { method: 'POST', body: JSON.stringify(input) } : {}),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(value.error ?? '保存できませんでした。'), {
      status: response.status,
    });
  return value;
}
export function exportCommunityKey(id: string) {
  const r = read()[id];
  if (!r) throw new Error('この端末に専用鍵がありません。');
  return JSON.stringify(
    {
      schema: 'rockstar-community-key/1',
      profileId: window.localStorage.getItem(profileKey),
      communityId: id,
      ...r,
    },
    null,
    2,
  );
}
export function importCommunityKey(text: string) {
  const v = JSON.parse(text);
  if (
    !v ||
    v.schema !== 'rockstar-community-key/1' ||
    v.profileId !== window.localStorage.getItem(profileKey) ||
    !/^[a-f0-9-]{36}$/.test(v.communityId) ||
    !/^[a-f0-9]{64}$/.test(v.accessKey) ||
    (v.recoveryKey !== undefined && !/^[a-f0-9]{64}$/.test(v.recoveryKey)) ||
    Object.keys(v).some(
      (k) =>
        ![
          'schema',
          'profileId',
          'communityId',
          'accessKey',
          'recoveryKey',
        ].includes(k),
    )
  )
    throw new Error('同じアカウントの専用鍵ファイルを選んでください。');
  saveCommunityKey(v.communityId, {
    accessKey: v.accessKey,
    ...(v.recoveryKey ? { recoveryKey: v.recoveryKey } : {}),
  });
  return v.communityId as string;
}
