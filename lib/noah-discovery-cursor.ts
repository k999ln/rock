import { NoahAgentError } from './noah-agent-upload.ts';
export type DiscoveryCursor = {
  algorithm: 1;
  fingerprint: string;
  asOf: number;
  watermark: number;
  expiresAt: number;
  after: [number, number, string];
};
const bytes = (text: string) => new TextEncoder().encode(text);
const encode = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
async function key(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw Error('cursor key unavailable');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret.match(/../g)!, (v) => parseInt(v, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function signDiscoveryCursor(
  value: DiscoveryCursor,
  secret: string,
) {
  const body = encode(bytes(JSON.stringify(value)));
  return `${body}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), bytes(body))))}`;
}
export async function readDiscoveryCursor(
  raw: string,
  secret: string,
  fingerprint: string,
  now: number,
): Promise<DiscoveryCursor> {
  try {
    if (raw.length > 1800 || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(raw))
      throw Error();
    const [body, signature] = raw.split('.');
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        bytes(body),
      ))
    )
      throw Error();
    const v = JSON.parse(
      new TextDecoder().decode(decode(body)),
    ) as DiscoveryCursor;
    if (
      v.algorithm !== 1 ||
      !Number.isSafeInteger(v.watermark) ||
      v.watermark < 0 ||
      v.fingerprint !== fingerprint ||
      !Number.isSafeInteger(v.asOf) ||
      v.asOf > now + 30000 ||
      v.asOf < now - 900000 ||
      v.expiresAt !== v.asOf + 900000 ||
      v.expiresAt <= now ||
      !Array.isArray(v.after) ||
      v.after.length !== 3 ||
      ![0, 5, 15, 20, 40, 45, 55, 60].includes(v.after[0]) ||
      !Number.isSafeInteger(v.after[1]) ||
      v.after[1] > v.asOf ||
      v.after[1] < 0 ||
      !/^discovery-[a-f0-9]{24}$/.test(v.after[2])
    )
      throw Error();
    return v;
  } catch {
    throw new NoahAgentError(
      '新着・設定が変わったか、続きの有効期限が切れました。先頭から読み直してください。',
      409,
    );
  }
}
