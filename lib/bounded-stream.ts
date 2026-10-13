/** Read bytes only; callers retain decoding, validation and reader ownership. */
export async function readBoundedStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maximumBytes: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
