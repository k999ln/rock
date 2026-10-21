/** A verified Zoom launch still needs a separately authenticated Sky owner and grants. */
export type VerifiedZoomLaunch = {
  type: 'panel' | 'meeting' | 'webinar' | 'chat';
  zoomUserId: string;
  createdAtMs: number;
  expiresAtMs: number;
  meetingUuid?: string;
  parentMeetingUuid?: string;
  chatId?: string;
  messageId?: string;
  actionId?: string;
  triggerId?: string;
};

export class ZoomAppContextError extends Error {
  constructor() {
    super('Zoom App context could not be verified.');
    this.name = 'ZoomAppContextError';
  }
}

function requireString(value: unknown, maximum = 512): string {
  if (typeof value !== 'string' || !value || value.length > maximum) throw new ZoomAppContextError();
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : requireString(value);
}

/** Decrypts X-Zoom-App-Context using Zoom's documented AES-256-GCM envelope. */
export async function verifyZoomAppContextHeader(
  encoded: string,
  clientSecret: string,
  nowMs = Date.now(),
): Promise<VerifiedZoomLaunch> {
  if (!clientSecret || !encoded || encoded.length > 24_000 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded))
    throw new ZoomAppContextError();

  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
      (character) => character.charCodeAt(0));
    if (bytes.length < 1 + 8 + 2 + 4 + 1 + 16) throw new ZoomAppContextError();
    const view = new DataView(bytes.buffer);
    let offset = 0;
    const ivLength = view.getUint8(offset);
    offset += 1;
    if (ivLength < 8 || ivLength > 32 || offset + ivLength + 2 > bytes.length) throw new ZoomAppContextError();
    const iv = bytes.slice(offset, offset + ivLength);
    offset += ivLength;
    const aadLength = view.getUint16(offset, true);
    offset += 2;
    if (aadLength > 4096 || offset + aadLength + 4 > bytes.length) throw new ZoomAppContextError();
    const aad = bytes.slice(offset, offset + aadLength);
    offset += aadLength;
    const cipherLength = view.getUint32(offset, true);
    offset += 4;
    if (cipherLength < 1 || cipherLength > 8192 || offset + cipherLength + 16 !== bytes.length)
      throw new ZoomAppContextError();
    const encrypted = bytes.slice(offset);
    const keyDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientSecret));
    const key = await crypto.subtle.importKey('raw', keyDigest, 'AES-GCM', false, ['decrypt']);
    const plainBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, encrypted,
    );
    const plaintext = new TextDecoder('utf-8', { fatal: true }).decode(plainBytes);
    const claims: unknown = JSON.parse(plaintext);
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new ZoomAppContextError();
    const item = claims as Record<string, unknown>;
    if (item.typ !== 'panel' && item.typ !== 'meeting' && item.typ !== 'webinar' && item.typ !== 'chat')
      throw new ZoomAppContextError();
    if (!Number.isSafeInteger(item.ts) || !Number.isSafeInteger(item.exp)) throw new ZoomAppContextError();
    const createdAtMs = item.ts as number;
    const expiresAtMs = item.exp as number;
    if (createdAtMs > nowMs + 300_000 || expiresAtMs <= nowMs || expiresAtMs <= createdAtMs)
      throw new ZoomAppContextError();
    const meetingUuid = optionalString(item.mid);
    const parentMeetingUuid = optionalString(item.pid);
    if (item.typ === 'meeting' && !meetingUuid) throw new ZoomAppContextError();
    return {
      type: item.typ,
      zoomUserId: requireString(item.uid, 256),
      createdAtMs,
      expiresAtMs,
      meetingUuid,
      parentMeetingUuid,
      chatId: optionalString(item.chid),
      messageId: optionalString(item.msgid),
      actionId: optionalString(item.aid),
      triggerId: optionalString(item.trid),
    };
  } catch {
    throw new ZoomAppContextError();
  }
}
