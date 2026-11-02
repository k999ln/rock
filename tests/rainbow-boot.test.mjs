import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/brand/rainbow-boot.js', import.meta.url), 'utf8');
function harness({ reduced = false, seen = false, storageBlocked = false } = {}) {
  const frames = new Map(), timers = new Map(), listeners = new Map();
  const stats = { scans: 0, writes: 0, strokes: 0, removed: 0, disconnected: 0 };
  let next = 0, loaded;
  const context = {
    clearRect() {}, drawImage() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { stats.strokes++; }, fillRect() {},
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { stats.scans++; return { data: new Uint8ClampedArray(96 * 96 * 4).fill(120) }; },
    createImageData() { return { data: new Uint8ClampedArray(96 * 96 * 4) }; },
    putImageData() { stats.writes++; },
  };
  const canvas = () => ({ getContext: () => context });
  const root = { style: {}, setAttribute() {}, querySelector: canvas, remove() { stats.removed++; } };
  const host = { style: { position: '' }, append() {} };
  const logo = { parentElement: host, isConnected: true, clientWidth: 26, clientHeight: 26, offsetLeft: 0, offsetTop: 10 };
  const on = (name, fn) => listeners.set(name, fn), off = name => listeners.delete(name);
  const document = { readyState: 'complete', hidden: false, querySelector: () => logo,
    createElement: name => name === 'canvas' ? canvas() : root, addEventListener: on, removeEventListener: off };
  const motion = { matches: reduced, addEventListener: on, removeEventListener: off };
  vm.runInNewContext(source, {
    document, window: { addEventListener: on, removeEventListener: off }, matchMedia: () => motion,
    sessionStorage: { getItem() { if (storageBlocked) throw Error('blocked'); return seen; }, setItem() {} },
    getComputedStyle: () => ({ position: 'static' }), devicePixelRatio: 3,
    Image: class { constructor() { loaded = this; } },
    ResizeObserver: class { observe() {} disconnect() { stats.disconnected++; } },
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id),
  });
  const step = now => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(now); };
  return { frames, timers, listeners, stats, root, logo, document, host, load: () => loaded?.onload?.(), step,
    lateLoad: () => loaded?.onload };
}
void test('motion preference and seen session do not mount decoration or schedule work', () => {
  for (const options of [{ reduced: true }, { seen: true }]) {
    const h = harness(options); h.load();
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.stats.scans, 0);
  }
});
void test('bounded logo rendering reveals pixels incrementally and ends all scheduled work', () => {
  const h = harness(); h.load();
  assert.equal(h.stats.scans, 1);
  h.step(0); assert.equal(h.stats.strokes, 28);
  h.step(1); assert.equal(h.stats.strokes, 28, '30 fps cap skips redundant work');
  h.step(2800); const writes = h.stats.writes;
  h.step(2801); assert.equal(h.stats.writes, writes);
  h.step(5600); h.step(6800);
  assert.equal(h.stats.scans, 1); assert.equal(h.stats.removed, 1);
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.host.style.position, '');
  assert.equal(h.root.style.width, '26px');
});
void test('first interaction dismisses decoration without intercepting the Eve event', () => {
  const h = harness(); const pendingImage = h.lateLoad();
  h.listeners.get('pointerdown')({ preventDefault() { assert.fail('must not cancel user input'); } });
  pendingImage();
  assert.equal(h.stats.scans, 0); assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.stats.removed, 1);
});
void test('hidden document, removed logo and motion changes stop rendering and cannot restart', () => {
  for (const event of ['visibilitychange', 'pagehide', 'change', 'detached']) {
    const h = harness(); h.load(); h.step(0);
    if (event === 'visibilitychange') h.document.hidden = true;
    if (event === 'detached') { h.logo.isConnected = false; h.step(40); }
    else h.listeners.get(event)();
    h.load(); h.step(10000);
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.stats.removed, 1);
  }
});
void test('blocked session storage never blocks the application or finish cleanup', () => {
  const h = harness({ storageBlocked: true }); h.load(); h.step(0);
  h.listeners.get('keydown')();
  assert.equal(h.frames.size, 0); assert.equal(h.stats.removed, 1);
});
