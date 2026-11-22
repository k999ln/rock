/** Raster results only. Never interpret provider HTML/SVG or fetch a provider URL on the server. */
export type NoahResultImage = { name: string; mimeType: string; data: string };
export type NoahReceivedResult = {
  delivery?: 'missing_image';
  text: string;
  truncated: boolean;
  attachments: number;
  images?: NoahResultImage[];
  imageUrls?: string[];
};
// The remote MCP reader already bounds the whole response to 1 MiB.
export const NOAH_IMAGE_BASE64_LIMIT = 1_048_576;
export function noahRasterMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  )
    return 'image/png';
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg';
  if (
    bytes.length >= 14 &&
    String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/)
  )
    return 'image/gif';
  if (
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
export function noahResultImage(
  block: unknown,
  index: number,
): NoahResultImage | null {
  if (!block || typeof block !== 'object') return null;
  const original = block as Record<string, unknown>;
  const resource =
    original.type === 'resource' &&
    original.resource &&
    typeof original.resource === 'object'
      ? (original.resource as Record<string, unknown>)
      : null;
  const v = resource
    ? { type: 'image', data: resource.blob, mimeType: resource.mimeType }
    : original;
  if (
    v.type !== 'image' ||
    typeof v.data !== 'string' ||
    !v.data.length ||
    v.data.length > NOAH_IMAGE_BASE64_LIMIT ||
    v.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.data)
  )
    return null;
  try {
    const bytes = Uint8Array.from(atob(v.data.slice(0, 32)), (c) =>
      c.charCodeAt(0),
    );
    const mimeType = noahRasterMime(bytes);
    if (!mimeType || mimeType !== v.mimeType) return null;
    return {
      name: `noah-image-${index + 1}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice(6)}`,
      mimeType,
      data: v.data,
    };
  } catch {
    return null;
  }
}
export function noahImageFile(image: NoahResultImage): File {
  if (!noahResultImage({ type: 'image', ...image }, 0))
    throw Error('Invalid image');
  return new File(
    [Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0))],
    image.name,
    { type: image.mimeType },
  );
}
