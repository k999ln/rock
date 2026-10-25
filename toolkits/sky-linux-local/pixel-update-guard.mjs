import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { userInfo } from 'node:os';
const pendingUpdate = () => Object.assign(new Error('PIXEL_UPDATE_PENDING'), { code: 'PIXEL_UPDATE_PENDING' });

/** Owner update metadata is a dispatch fence, never an execution grant. */
export function pixelUpdateGuard(root) {
  const uid = userInfo().uid;
  const file = async path => {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== uid || info.size > 262144 || (info.mode & 0o077)) throw new Error('invalid update file');
    const bytes = await readFile(path);
    if (bytes.length > 262144) throw new Error('oversized update file');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  };
  return async () => {
    const pointerPath = join(root, 'update-transaction.json');
    try { await lstat(pointerPath); }
    catch (error) { if (error.code === 'ENOENT') return; throw pendingUpdate(); }
    try {
      const pointer = await file(pointerPath);
      if (Object.keys(pointer).join(',') !== 'id' || !/^[a-f0-9]{64}-[a-f0-9]{32}$/.test(pointer.id)) throw new Error('invalid update pointer');
      for (const directory of [join(root, 'updates'), join(root, 'updates', pointer.id)]) {
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || (info.mode & 0o077)) throw new Error('invalid update directory');
      }
      const receipt = await file(join(root, 'updates', pointer.id, 'receipt.json'));
      if (receipt.schema !== 'sky.pixel-guest-update/1' || receipt.id !== pointer.id || !['committed', 'rolled_back'].includes(receipt.state)) throw new Error('unfinished update');
    } catch { throw pendingUpdate(); }
  };
}
