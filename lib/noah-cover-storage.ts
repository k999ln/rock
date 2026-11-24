import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { NOAH_COVER_LIMIT, NOAH_COVER_TYPES, type NoahCover } from './noah-cover.ts';
import { noahRasterMime } from './noah-result-media.ts';

type Bucket = Pick<R2Bucket, 'put' | 'get'>;

function videoType(bytes: Uint8Array) {
  const header = String.fromCharCode(...bytes.subarray(0, 512));
  // The ISO container is also used by HEIC and QuickTime. Only accept MP4 video brands.
  if (header.slice(4, 8) === 'ftyp' && /^(?:isom|iso[2-9]|mp4[12]|avc1|av01|dash|M4V )$/.test(header.slice(8, 12))) return 'video/mp4';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && header.includes('\x42\x82\x84webm')) return 'video/webm';
  return null;
}

export async function prepareNoahCover(file: FormDataEntryValue | null) {
  if (file === null) return undefined;
  if (typeof file === 'string') throw new NoahAgentError('カバーの画像または動画ファイルを選んでください。');
  if (file.size > NOAH_COVER_LIMIT) throw new NoahAgentError('カバーは8MiBまでです。', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = file.type.toLowerCase().split(';')[0].trim() as NoahCover['type'];
  if (bytes.length < 16 || !NOAH_COVER_TYPES.includes(type) || type !== (noahRasterMime(bytes) ?? videoType(bytes)))
    throw new NoahAgentError('PNG・JPEG・WebP・WebM・MP4の画像または動画を選んでください。', 415);
  return { bytes, pin: { type, bytes: bytes.length, sha256: await noahSha256(bytes) } };
}

async function objectKey(owner: string, sha256: string) {
  return 'noah/covers/' + await noahSha256(new TextEncoder().encode(owner)) + '/' + sha256;
}

export async function saveNoahCover(bucket: Bucket | undefined, owner: string, cover: NonNullable<Awaited<ReturnType<typeof prepareNoahCover>>>) {
  if (!bucket) throw new NoahAgentError('カバー保存先を確認できません。', 503);
  await bucket.put(await objectKey(owner, cover.pin.sha256), cover.bytes, {
    httpMetadata: { contentType: cover.pin.type }, customMetadata: { sha256: cover.pin.sha256 },
  });
}

function mediaRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || first > last) return false;
  return { offset: first, length: last - first + 1 };
}

function matchesPin(object: R2Object | null, pin: NoahCover) {
  return object?.size === pin.bytes && object.customMetadata?.sha256 === pin.sha256 && object.httpMetadata?.contentType === pin.type;
}

export async function requireStoredNoahCover(bucket: Bucket | undefined, owner: string, pin: NoahCover) {
  const object = await bucket?.get(await objectKey(owner, pin.sha256), { range: { offset: 0, length: 1 } });
  await object?.body.cancel();
  if (!object || !matchesPin(object, pin)) throw new NoahAgentError('カバーの保存完了を確認できません。', 503);
}

export async function serveNoahCover(bucket: Pick<R2Bucket, 'get'> | undefined, owner: string, pin: NoahCover, req: Request) {
  if (!bucket) throw new NoahAgentError('カバー保存先を確認できません。', 503);
  const headers = new Headers({ 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Content-Type': pin.type,
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin', 'Accept-Ranges': 'bytes' });
  const range = mediaRange(req.headers.get('range'), pin.bytes);
  if (range === false) {
    headers.set('Content-Range', 'bytes */' + pin.bytes);
    return new Response(null, { status: 416, headers });
  }
  const object = await bucket.get(await objectKey(owner, pin.sha256), range ? { range } : undefined);
  if (!object || !matchesPin(object, pin))
    throw new NoahAgentError('カバーの保存完了を確認できません。', 503);
  if (range) headers.set('Content-Range', 'bytes ' + range.offset + '-' + (range.offset + range.length - 1) + '/' + pin.bytes);
  headers.set('Content-Length', String(range?.length ?? pin.bytes));
  return new Response(object.body, { headers, status: range ? 206 : 200 });
}
