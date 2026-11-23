import { parseTerminalRuntime, TERMINAL_SURFACE } from './noah-terminal-contract.mjs';

// A guest display is a new explicit contract, never a relaxation of terminal/1.
export function parseNoahRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'noah-desktop/1') return parseTerminalRuntime(value);
  let parsed;
  try { parsed = parseTerminalRuntime({ ...value, schema: 'noah-terminal/1' }); }
  catch { throw new Error('専用画面の実行定義はnoah-desktop/1、python、相対ファイル名、対応ローカルモデルで指定してください。'); }
  if (parsed.language !== 'python') throw new Error('専用画面の初期対応はPythonです。対応するコードを指定してください。');
  return { ...parsed, schema: 'noah-desktop/1' };
}

export function noahRuntimeWorkspace(value) {
  const runtime = parseNoahRuntime(value);
  return Object.freeze({ schema: 'noah-workspace/1', surface: runtime.schema === 'noah-desktop/1' ? 'screen' : 'terminal',
    location: 'isolated-linux', viewer: 'closed', hostInput: false, hostClipboard: false, isolation: TERMINAL_SURFACE });
}
