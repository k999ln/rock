import { inspectProgram } from '../toolkits/spider-guard/program-inspector.mjs';

// This global belongs to the private dedicated Worker, not a Window listener.
// Dedicated-worker MessageEvents use an empty origin and null source. Reject
// other event shapes and synthetic dispatches; source remains untrusted data.
self.onmessage = (event: MessageEvent<unknown>) => {
  if (event.origin !== '' || event.source !== null || !event.isTrusted) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const { id, source, language } = data as Record<string, unknown>;
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id < 0 ||
    typeof source !== 'string' ||
    (language !== 'javascript' && language !== 'python' && language !== 'text')
  )
    return;
  try {
    self.postMessage({ id, report: inspectProgram(source, { language }) });
  } catch {
    // Never echo malformed messages, source, identifiers of other types, or errors.
    self.postMessage({ id, failed: true });
  }
};
