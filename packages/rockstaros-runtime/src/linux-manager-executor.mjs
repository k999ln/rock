import { describeAdapter } from '../../../lib/rockstar-adapters.ts';
import { ExecutorError, parseLocalTextRequest } from './executor.mjs';

const check = (value, code) => { if (!value) throw new ExecutorError(code); };
/** First-party bridge to the existing owner-local Pixel Linux manager.
 * Metadata is a capability observation, not hardware attestation or a grant.
 * A bound common host must authorize before calling this driver.
 */
export function createPixelLinuxExecutor({ manager }) {
  check(typeof manager?.snapshot === 'function' && typeof manager?.executeText === 'function' && typeof manager?.describeText === 'function', 'SKY_LINUX_MANAGER_REQUIRED');
  let busy = false;
  function installed(pin) {
    check(pin?.scheme === 'gguf-sha256' && typeof pin.id === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256), 'INVALID_PIXEL_MODEL_PIN');
    const state = manager.snapshot();
    check(state?.vm === 'pixel-linux' && state.phase === 'ready' && state.environment?.platform === 'linux' && state.environment?.architecture === 'aarch64', 'PIXEL_LINUX_NOT_READY');
    check(Array.isArray(state.models) && state.models.some(model => model.id === pin.id && model.sha256 === pin.sha256) && state.preparedModels?.includes(pin.id), 'MODEL_PIN_NOT_INSTALLED');
    return state;
  }
  return Object.freeze({
    async describe(pin) {
      check(!busy, 'EXECUTOR_BUSY'); installed(pin);
      await manager.describeText();
      return describeAdapter('pixel-linux-gguf', 'executor', 'linux', { 'text.generate': true, 'model.pin': true });
    },
    async generate(raw, signal) {
      check(!busy, 'EXECUTOR_BUSY');
      const request = parseLocalTextRequest(raw);
      installed(request.model);
      check(!signal?.aborted, 'SKY_LINUX_EXECUTION_ABORTED');
      busy = true;
      try { return await manager.executeText(request, signal); }
      finally { busy = false; }
    },
  });
}
