import { describeAdapter } from './rockstar-adapters.ts';

/** Declarations of this software-only preview, not actual device observations. */
export function describeMiiPreviewRead(now = Date.now()) {
  return {
    host: describeAdapter('mii-preview-host', 'host', 'web', { 'work.owner-scoped-read': true }, now),
    executor: describeAdapter('mii-preview-reader', 'executor', 'web', { 'work.read': true }, now),
    output: describeAdapter('mii-preview-text', 'output', 'web', { 'output.text': true }, now),
  };
}
