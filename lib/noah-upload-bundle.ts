import { projectTest } from './noah-source-project.ts';
import { writeNoahArchive, safeNoahSourcePath } from './noah-source-archive.ts';
export async function bundleUploadTest(file: File, name: string, code: string) {
  if (!code.trim()) return file;
  if (/\.zip$/i.test(file.name) || !safeNoahSourcePath(name) || name.includes('/') || !projectTest(name) || name === file.name || new TextEncoder().encode(code).length > 32768) throw new Error('単一コードには別名の .test.mjs または test_名前.py を指定してください。ZIPにはテストを同梱してください。');
  const result = writeNoahArchive([{ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), os: 0, attrs: 0 }, { name, bytes: new TextEncoder().encode(code), os: 0, attrs: 0 }]);
  return new File([new Uint8Array(result)], file.name.slice(0, 100) + '.tests.zip', { type: 'application/zip' });
}
