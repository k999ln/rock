import { parseNoahRuntime } from '../lib/noah-runtime-contract.mjs';
import { configureManagedDesktopEngine } from './noah-isolated-runtime.mjs';
import { InstallError } from './noah-source-fetch.mjs';
import { prepareTerminalRuntime } from './noah-terminal-runtime.mjs';

// Called by the operator's authenticated worker with its approved immutable source.
// Client requests cannot supply a VM address, model credentials, or a host display.
export async function prepareManagedDesktopRuntime(options) {
  const definition = parseNoahRuntime(options.definition);
  if (definition.schema !== 'noah-desktop/1' || definition.model !== 'none') {
    throw new InstallError('運営専用画面ではローカルモデルを要求しないLinux用の画面Agentを指定してください。', 422);
  }
  await configureManagedDesktopEngine(options.root, options.signal);
  return prepareTerminalRuntime({ ...options, definition });
}
