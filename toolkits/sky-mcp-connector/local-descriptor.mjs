import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const MAX_DESCRIPTOR_BYTES = 4_096;

function invalidDescriptor() {
  return new Error('invalid_local_descriptor');
}

// Open once: pathname replacement must not change the object we validate/read.
// openFile is an internal test seam, never an HTTP or Tool argument.
export async function readPrivateLocalDescriptor(path, { openFile = open } = {}) {
  if (
    !Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0 ||
    !Number.isInteger(constants.O_NONBLOCK) || constants.O_NONBLOCK === 0
  )
    throw new Error('local_descriptor_platform_unsupported');

  const handle = await openFile(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() || (info.mode & 0o077) || info.size > MAX_DESCRIPTOR_BYTES ||
      (typeof process.geteuid === 'function' && info.uid !== process.geteuid())
    )
      throw invalidDescriptor();

    // The file may grow after fstat. Never let its changing size determine an
    // allocation or use readFile(), which can read past the validated limit.
    const buffer = Buffer.alloc(MAX_DESCRIPTOR_BYTES + 1);
    let size = 0;
    while (size <= MAX_DESCRIPTOR_BYTES) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > MAX_DESCRIPTOR_BYTES) throw invalidDescriptor();
    }
    return JSON.parse(buffer.subarray(0, size).toString('utf8'));
  } finally {
    await handle.close();
  }
}
