import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { guardHistoryNavigation } from '../lib/history-navigation-guard.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../components/use-pending-save-navigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
void test('pending saves block same-tab SPA links but permit sign-in in another tab and local exports', () => {
  const windowListeners = new Map(), documentListeners = new Map();
  let cleanup;
  const surface = (listeners) => ({ addEventListener(name, fn, capture) { listeners.set(name, { fn, capture }); },
    removeEventListener(name) { listeners.delete(name); } });
  class Element { constructor(attributes) { this.attributes = attributes; } closest() { return this; }
    getAttribute(name) { return this.attributes[name] ?? null; } hasAttribute(name) { return name in this.attributes; } }
  const exports = {};
  runInNewContext(compiled, { exports, Element, window: surface(windowListeners), document: surface(documentListeners),
    require(name) { if (name === '@/lib/history-navigation-guard') return { guardHistoryNavigation }; assert.equal(name, 'react'); return { useEffect(fn) { cleanup?.(); cleanup = fn(); } }; },
  });
  const hook = exports.usePendingSaveNavigation;
  hook(false); assert.equal(documentListeners.size, 0);
  hook(true); assert.equal(documentListeners.get('click').capture, true);
  let unloadPrevented = false;
  windowListeners.get('beforeunload').fn({ preventDefault() { unloadPrevented = true; } });
  assert.equal(unloadPrevented, true);
  function blocked(attributes, extra = {}) {
    let prevented = false;
    documentListeners.get('click').fn({ button: 0, target: new Element(attributes), ...extra, preventDefault() { prevented = true; } });
    return prevented;
  }
  assert.equal(blocked({ href: '/' }), true);
  assert.equal(blocked({ href: '/zema/library' }), true);
  assert.equal(blocked({ href: '/signin-with-chatgpt', target: '_top' }), true);
  assert.equal(blocked({ href: '/signin-with-chatgpt', target: '_blank' }), false);
  assert.equal(blocked({ href: '#workspace-main' }), false);
  assert.equal(blocked({ href: 'blob:fixture', download: 'material-study.json' }), false);
  assert.equal(blocked({ href: '/' }, { ctrlKey: true }), false);
  hook(false); assert.equal(documentListeners.size, 0); assert.equal(windowListeners.size, 0);
  hook(true); cleanup(); assert.equal(documentListeners.size, 0); assert.equal(windowListeners.size, 0);
});
