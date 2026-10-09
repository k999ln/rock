import { inspectProgram } from '../toolkits/spider-guard/program-inspector.mjs';

// Input is data: never evaluate it, fetch URLs or return exception text/source.
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, report: inspectProgram(data.source, { language: data.language }) });
  } catch {
    self.postMessage({ id: data.id, failed: true });
  }
};
