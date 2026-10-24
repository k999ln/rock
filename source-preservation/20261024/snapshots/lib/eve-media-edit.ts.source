/** Bounded editing commands exposed by Eve's in-browser media app. No shell or remote uploads. */
export type MediaKind = 'image' | 'video' | 'audio';
export type MediaOperation =
  | 'photo-layer'
  | 'audio-mix'
  | 'video-sequence'
  | 'video-soundtrack';
export function mediaKind(type: string): MediaKind | null {
  return type.startsWith('image/')
    ? 'image'
    : type.startsWith('video/')
      ? 'video'
      : type.startsWith('audio/')
        ? 'audio'
        : null;
}
export function mediaOperation(a: MediaKind, b: MediaKind): MediaOperation {
  if (a === 'image' && b === 'image') return 'photo-layer';
  if (a === 'audio' && b === 'audio') return 'audio-mix';
  if (a === 'video' && b === 'video') return 'video-sequence';
  if ((a === 'video' && b === 'audio') || (a === 'audio' && b === 'video'))
    return 'video-soundtrack';
  throw Error(
    '写真同士、音楽同士、動画同士、または動画と音楽を重ねてください。',
  );
}
export function encodeWave(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  if (
    !channels.length ||
    channels.length > 2 ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !channels[0].length ||
    channels.some((c) => c.length !== channels[0].length)
  )
    throw Error('音声形式を確認してください。');
  const frames = channels[0].length,
    buffer = new ArrayBuffer(44 + frames * channels.length * 2),
    v = new DataView(buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, buffer.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels.length, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels.length * 2, true);
  v.setUint16(32, channels.length * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, buffer.byteLength - 44, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels.length; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      v.setInt16(
        44 + (i * channels.length + c) * 2,
        s < 0 ? s * 32768 : s * 32767,
        true,
      );
    }
  return buffer;
}

/** Add duration to an unknown-length MediaRecorder WebM segment, preserving all media packets. */
export function webmWithDuration(
  bytes: Uint8Array,
  durationMs: number,
): Uint8Array {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw Error('動画の長さが不正です。');
  function vint(at: number, id = false) {
    const first = bytes[at];
    if (!first) throw Error('WebMヘッダーを読み取れません。');
    let width = 1,
      mask = 128;
    while (!(first & mask)) {
      width++;
      mask >>= 1;
    }
    if (width > 8 || at + width > bytes.length)
      throw Error('WebMヘッダーが途中です。');
    let value = id ? first : first & (mask - 1),
      unknown = !id && value === mask - 1;
    for (let i = 1; i < width; i++) {
      value = value * 256 + bytes[at + i];
      unknown = unknown && bytes[at + i] === 255;
    }
    return { width, value, unknown };
  }
  function element(at: number) {
    const id = vint(at, true),
      size = vint(at + id.width);
    return {
      id: id.value,
      size,
      body: at + id.width + size.width,
      sizeAt: at + id.width,
    };
  }
  const header = element(0);
  if (header.id !== 0x1a45dfa3) return bytes;
  const segment = element(header.body + header.size.value);
  if (segment.id !== 0x18538067 || !segment.size.unknown) return bytes;
  let at = segment.body;
  while (at < bytes.length) {
    const item = element(at);
    if (item.id === 0x1549a966) {
      if (item.size.unknown) return bytes;
      let scale = 1000000;
      for (let child = item.body; child < item.body + item.size.value;) {
        const e = element(child);
        if (e.id === 0x4489) return bytes;
        if (e.id === 0x2ad7b1) {
          scale = 0;
          for (let n = 0; n < e.size.value; n++)
            scale = scale * 256 + bytes[e.body + n];
        }
        child = e.body + e.size.value;
      }
      const newSize = item.size.value + 11;
      if (newSize >= 2 ** (item.size.width * 7) - 1) return bytes;
      const added = new Uint8Array(11);
      added.set([0x44, 0x89, 0x88]);
      new DataView(added.buffer).setFloat64(
        3,
        (durationMs * 1000000) / scale,
        false,
      );
      const end = item.body + item.size.value,
        out = new Uint8Array(bytes.length + 11);
      out.set(bytes.subarray(0, end));
      out.set(added, end);
      out.set(bytes.subarray(end), end + 11);
      let remaining = newSize;
      for (let i = item.size.width - 1; i >= 0; i--) {
        out[item.sizeAt + i] = remaining % 256;
        remaining = Math.floor(remaining / 256);
      }
      out[item.sizeAt] |= 1 << (8 - item.size.width);
      return out;
    }
    if (item.size.unknown || item.id === 0x1f43b675) break;
    at = item.body + item.size.value;
  }
  return bytes;
}
