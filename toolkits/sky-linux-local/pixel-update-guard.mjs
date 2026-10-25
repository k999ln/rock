import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { userInfo } from 'node:os';
const pendingUpdate = () => Object.assign(new Error('PIXEL_UPDATE_PENDING'), { code: 'PIXEL_UPDATE_PENDING' });
const LIMIT = 262144;
const unchanged = (a, b) => ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'mode', 'uid', 'nlink'].every(key => a[key] === b[key]);

/** Owner update metadata is a dispatch fence, never an execution grant. */
export function pixelUpdateGuard(root) {
  const uid = userInfo().uid;
  return async () => {
    const held = [];
    const acquire = async (path, directory = false) => {
      // Open first: a pathname check must never authorize a later pathname read.
      // NONBLOCK also prevents a substituted FIFO from hanging dispatch.
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK |
        (directory ? constants.O_DIRECTORY : 0));
      const item = { path, handle };
      held.push(item);
      const info = await handle.stat();
      if (info.uid !== uid || (info.mode & 0o077) ||
          (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1 || info.size > LIMIT))
        throw new Error('invalid update metadata');
      item.info = info;
      return item;
    };
    const read = async item => {
      const bytes = Buffer.alloc(LIMIT + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await item.handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > LIMIT || length !== item.info.size) throw new Error('update file changed or oversized');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
    };
    try {
      let pointerFile;
      try { pointerFile = await acquire(join(root, 'update-transaction.json')); }
      catch (error) { if (error.code === 'ENOENT' && held.length === 0) return; throw error; }
      const pointer = await read(pointerFile);
      if (Object.keys(pointer).join(',') !== 'id' || !/^[a-f0-9]{64}-[a-f0-9]{32}$/.test(pointer.id)) throw new Error('invalid update pointer');
      for (const directory of [root, join(root, 'updates'), join(root, 'updates', pointer.id)]) await acquire(directory, true);
      const receipt = await read(await acquire(join(root, 'updates', pointer.id, 'receipt.json')));
      if (receipt.schema !== 'sky.pixel-guest-update/1' || receipt.id !== pointer.id || !['committed', 'rolled_back'].includes(receipt.state)) throw new Error('unfinished update');
      // Retain descriptors until the complete snapshot is checked. Detect file,
      // pointer and parent replacements, and in-place writes during the read.
      for (const item of held) {
        if (!unchanged(item.info, await item.handle.stat()) || !unchanged(item.info, await lstat(item.path)))
          throw new Error('update metadata changed');
      }
    } catch { throw pendingUpdate(); }
    finally { await Promise.all(held.map(item => item.handle.close())); }
  };
}
