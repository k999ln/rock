import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');

// Compile the actual repository route; pass fixture dependencies as objects.
// No database key, path, request or fixture value is interpolated into code.
export function loadRouteFixture(source, dependencies) {
  const output = ts.transpileModule(readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports, Error, TypeError, SyntaxError, Response, Request, URL, TextDecoder,
    TextEncoder, Uint8Array, crypto, structuredClone,
    require(name) {
      assert.ok(dependencies.has(name), `unmapped route dependency: ${name}`);
      return dependencies.get(name);
    },
  }, { filename: source.pathname });
  return exports;
}
