import { InstallError } from './noah-source-fetch.mjs';

export const NOAH_SOURCE_DOWNLOAD_LIMIT = 2 * 1024 * 1024;

/** Shared bounded download. Ownership, grant/manifest checks and revalidation
 * remain with the private-upload, invite and reviewed-release loaders. */
export async function readNoahSourceBytes(response, expectedBytes, {
  oversized = 'コードの容量が上限を超えました。',
  mismatch = 'コードの容量が保存記録と一致しません。',
} = {}) {
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > NOAH_SOURCE_DOWNLOAD_LIMIT) { await reader.cancel(); throw new InstallError(oversized, 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (size !== expectedBytes) throw new InstallError(mismatch, 409);
  return Buffer.concat(chunks);
}
