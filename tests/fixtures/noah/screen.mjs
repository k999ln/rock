import * as collection from '../../../lib/noah-collection.ts';
import * as importParts from '../../../lib/noah-intake-import-parts.ts';
import * as operationLabels from '../../../lib/noah-operation-labels.ts';
import * as currencyFormat from '../../../lib/currency-format.ts';
// 画面の部品（components/*.tsx）を、ブラウザなしで動かす台。
// 部品のファイルを TypeScript で JS に直し、小さな React の代わり（関数の部品を入れ子で描く・useState・useRef・useEffect を、木の中の場所ごとに持つ）で動かす。
// fetch・sessionStorage・location・時計（setTimeout・setInterval）は、試験が渡す物。見た目（CSS）は確かめない。確かめるのは、出る文・押せる物・送る要求。
import * as pins from '../../../lib/noah-pins.ts';
import * as pinScene from '../../../lib/noah-pin-scene.ts';
import * as shelfScenes from '../../../lib/noah-pin-scenes-shelf.ts';
import * as readyView from '../../../lib/noah-ready-view.ts';
import * as agentShare from '../../../lib/noah-agent-share.ts';
import { existsSync, readFileSync } from 'node:fs';
import * as theaterFilms from '../../../lib/noah-theater-films.ts';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { noahTranslate } from '../../../lib/noah-i18n.ts';
import * as resultPresentation from '../../../lib/noah-result-presentation.ts';
import * as resultMedia from '../../../lib/noah-result-media.ts';
import * as workView from '../../../lib/noah-work-view.ts';
import * as profileContract from '../../../lib/noah-profile-contract.ts';
import * as explanation from '../../../lib/noah-agent-explanation.ts';
import * as shelfContract from '../../../lib/noah-shelf.ts';
import * as stepGraph from '../../../lib/noah-steps.ts';
import * as noahPageRoutes from '../../../services/sky-web/noah-page-routes.mjs';

const ROOT = new URL('../../../', import.meta.url);
const Fragment = Symbol('Fragment');
const jsx = (type, props, key) => ({ type, props: props ?? {}, key: key ?? null });

/**
 * options: { fetch, modules（'@/lib/…' などの実体）, now（始まりの時刻）, storage（sessionStorage の最初の中身）, document（画面が裏かどうかを見る `document`。例 `{ hidden: false }`。渡さなければ、`document` は無い） }
 * 返す物: mount(file, props) → { text(), find(...), click(label), press(node), change(node, value), submit(form), type(value), flush(), tick(ms) } と、calls・storage・visits。
 */
export function screen(options = {}) {
  const calls = [], visits = [], storage = new Map(Object.entries(options.storage ?? {}));
  const startTime = options.now ?? Date.UTC(2026, 10, 21, 3);
  let clock = startTime, timerId = 0, uuid = 0, inflight = 0;
  const timers = new Map();
  // 描いている途中の部品・描いた後に動かす effect・状態が変わった印。画面（mount）ごとの物は、mount の中に持つ。
  let current = null, effects = [], dirty = false, mounts = 0;

  /** useMemo・useCallback の値を、木の中の場所ごとに持つ。 */
  const memo = (make, deps) => {
    const instance = current, index = instance.cursor++, old = instance.slots[index];
    if (old && deps && old.deps && deps.length === old.deps.length && deps.every((value, n) => Object.is(value, old.deps[n]))) return old.value;
    const value = make();
    instance.slots[index] = { value, deps };
    return value;
  };
  const hooks = {
    useState(initial) {
      const instance = current, index = instance.cursor++;
      if (!(index in instance.slots)) instance.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = instance.slots[index];
      return [slot.value, (next) => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
    },
    useRef(initial) { const instance = current, index = instance.cursor++; return (instance.slots[index] ??= { current: initial }); },
    useEffect(run, deps) {
      const instance = current, index = instance.cursor++, old = instance.slots[index];
      if (!old || !deps || deps.length !== old.deps?.length || deps.some((value, n) => !Object.is(value, old.deps[n]))) {
        const slot = (instance.slots[index] = { deps, cleanup: old?.cleanup, effect: true });
        effects.push(() => { slot.cleanup?.(); slot.cleanup = run() ?? undefined; });
      }
    },
    // React と同じく、deps が変わらない間は、前の値を返す（deps を渡さない時は、毎回作り直す）。
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useMemo(make, deps) { return memo(make, deps); },
    useSyncExternalStore: (_subscribe,get)=>get(),
    useId: () => 'id',
    createContext: (value) => ({ Provider: Fragment, value }),
    useContext: (held) => held.value,
  };

  // The harness has no paint phase. Run layout effects in the existing effect queue.
  hooks.useLayoutEffect = (run, deps) => hooks.useEffect(run, deps);

  const context = createContext({
    FormData: class {constructor(form){this.form=form;}get(key){return this.form.values?.[key]??null;}},
    console, queueMicrotask, File, Blob, Uint8Array, atob, navigator: options.navigator ?? {}, URL, URLSearchParams, JSON, Math, Array, Object, Number, String, Boolean, Error, Promise, Symbol, Map, Set, RegExp, Reflect, Proxy, Intl, AbortController, AbortSignal,
    Date: class extends Date { constructor(...args) { if (args.length) super(...args); else super(clock); } static now() { return clock; } },
    performance: { now: () => clock - startTime },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    fetch: async (url, init = {}) => {
      const request = { url: String(url), method: init.method ?? 'GET', headers: { ...init.headers }, body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(request);
      inflight++;
      try {
        const reply = await options.fetch(request);
        return { status: reply.status ?? 200, ok: (reply.status ?? 200) < 400, json: async () => structuredClone(reply.body ?? {}), body: { cancel: async () => undefined } };
      } finally { inflight--; }
    },
    setTimeout: (fn, ms = 0) => { timers.set(++timerId, { at: clock + ms, fn }); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: (fn, ms = 0) => { timers.set(++timerId, { at: clock + ms, fn, every: ms }); return timerId; },
    clearInterval: (id) => { timers.delete(id); },
    requestAnimationFrame: (fn) => { timers.set(++timerId, { at: clock, fn }); return timerId; },
    cancelAnimationFrame: (id) => { timers.delete(id); },
  });
  // 画面が裏の間は読み直さない、の試験のため（試験が、hidden を書き換える）。
  context.document = { hidden:false, addEventListener(){}, removeEventListener(){}, ...options.document };
  if(options.document)context.document=Object.assign(options.document,{addEventListener:options.document.addEventListener??(()=>{}),removeEventListener:options.document.removeEventListener??(()=>{})});
  context.window = {
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, String(value)); }, removeItem: (key) => { storage.delete(key); } },
    location: { assign: (href) => { visits.push(String(href)); }, replace: (href) => { visits.push(String(href)); }, href: `https://noah.test/noah${options.search??''}`, hash: '', search: options.search ?? '', origin: 'https://noah.test' },
    history: {state:null,replaceState(_state,_title,href){ const url=new URL(href,'https://noah.test'); context.window.location.href=url.href;context.window.location.search=url.search;}},
    addEventListener() {}, removeEventListener() {},
    // 画面の幅（頼んだ画面の幅の区分に使う）。既定は、スマホの幅。
    innerWidth: options.width ?? 390,
    setTimeout: context.setTimeout, clearTimeout: context.clearTimeout,
  };
  if (options.matchMedia) context.window.matchMedia = options.matchMedia;
  if (options.IntersectionObserver) context.IntersectionObserver = options.IntersectionObserver;

  const loaded = new Map();
  function load(file) {
    if (loaded.has(file)) return loaded.get(file);
    const unit = { exports: {} };
    loaded.set(file, unit.exports);
    const code = ts.transpileModule(readFileSync(new URL(file, ROOT), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = (id) => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'next/image') return { default: 'img' };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, name) => String(name) });
      if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (options.modules?.[id]) return id === 'next/navigation' ? { useSearchParams: () => new URLSearchParams(options.search ?? ''), ...options.modules[id] } : options.modules[id];
      if (id === '@/lib/noah-collection') return collection;
      if (id === 'next/navigation') return { useSearchParams: () => new URLSearchParams(options.search ?? '') };
      if(id.startsWith('./')&&options.modules?.[`@/components/${id.slice(2)}`])return options.modules[`@/components/${id.slice(2)}`];
      if(id==='./noah-locale')return {useNoahLocale:()=>({t:(text,values)=>noahTranslate(options.locale??'ja',text,values),locale:options.locale??'ja'}),NoahLanguageSetting:()=>null};
      if(id==='@/lib/noah-operation-labels')return operationLabels;
      if(id==='@/lib/currency-format')return currencyFormat;
      if(id==='@/lib/noah-agent-explanation')return explanation;
      if(id==='@/lib/noah-shelf')return shelfContract;
      if(id==='@/lib/noah-steps')return stepGraph;
      if(id==='@/lib/noah-work-view')return workView;
      if(id==='@/lib/noah-result-presentation')return resultPresentation;
      if(id==='@/lib/noah-result-media')return resultMedia;
      if(id==='@/components/noah-work-page')return load('components/noah-work-page.tsx');
      if(id==='@/lib/noah-profile-contract')return profileContract;
      if (id === '../services/sky-web/noah-page-routes.mjs') return noahPageRoutes;
      if (id === '@/lib/noah-theater-films') return theaterFilms;
      if (id === '@/lib/noah-haptics') return load('lib/noah-haptics.ts');
      if (id === '@/lib/noah-connection-sound' || id === './noah-connection-sound') return load('lib/noah-connection-sound.ts');
      if (id === '@/lib/noah-tap-sound') return load('lib/noah-tap-sound.ts');
      // 通信も保存もしない、決まった式だけの lib（ピンタレスト風の一覧の分野・形。task 115）は、本物をそのまま渡す。
      if (id === '@/lib/noah-pins') return pins;
      // ピンの図解の形と、棚の 17 枚の図解（spec-115 の 9 章）。決まった表だけの式なので、本物をそのまま渡す。
      if (id === '@/lib/noah-pin-scene') return pinScene;
      if (id === '@/lib/noah-pin-scenes-shelf') return shelfScenes;
      // ピンの図解を描く式（しょうへいさんの図解パックの書き写し。canvas に描くだけで、通信も保存もしない）。
      if (id === '@/lib/noah-pin-diagram') return load('lib/noah-pin-diagram.ts');
      if (id === '@/lib/noah-agent-art' || id === './noah-agent-art.ts') return load('lib/noah-agent-art.ts');
      if (id === '@/lib/noah-cover') return load('lib/noah-cover.ts');
      if (id === '@/lib/noah-card-video-paint') return load('lib/noah-card-video-paint.ts');
      if (id === '@/lib/noah-intake-import-parts') return importParts;
      // 詳細の頁へのリンクを作るだけの式（集めたAgentのカードの「Noahで開く」。task 121）。
      if (id === '@/lib/noah-ready-view') return readyView;
      if (id === '@/lib/noah-detail-guide') return load('lib/noah-detail-guide.ts');
      if (id === '@/lib/noah-detail-starter') return load('lib/noah-detail-starter.ts');
      if (id === '@/lib/noah-project-view') return load('lib/noah-project-view.ts');
      // 読み込み中に遊ぶ点のトラのゲーム。通信も保存もしない計算だけなので、本物をそのまま渡す。
      if (id === '@/lib/noah-tiger-game') return load('lib/noah-tiger-game.ts');

      if (id === '@/lib/noah-agent-share') return agentShare;
      if (id.startsWith('./')) return load(`components/${id.slice(2)}.${existsSync(new URL(`components/${id.slice(2)}.tsx`, ROOT)) ? 'tsx' : 'ts'}`);
      throw Error(`画面の試験の台に、${id} がありません`);
    };
    runInContext(`(function (exports, require, module) {${code}\n})`, context)(unit.exports, require, unit);
    loaded.set(file, unit.exports);
    return unit.exports;
  }

  /** 画面を 1 つ開く（開くたびに、新しい画面。前に開いた画面の状態は、引き継がない。sessionStorage と時計は、同じ tab の物として共有する）。 */
  /** file は 'components/x.tsx'（default の部品）か 'components/x.tsx#名前'（名前の付いた部品）。 */
  function mount(file, props = {}) {
    const [path, exported = 'default'] = file.split('#');
    const Component = load(path)[exported], root = `screen${++mounts}`;
    const instances = new Map();
    let tree = null, visited = new Set();
    /** 関数の部品を、入れ子で描く。返すのは、HTML の要素だけの木。 */
    const expand = (node, path) => {
      if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}/${child && typeof child === 'object' && child.key !== null && child.key !== undefined ? `k:${child.key}` : index}`));
      if (node === null || node === undefined || typeof node !== 'object') return node;
      if (typeof node.type === 'function') {
        const id = `${path}<${node.type.name}${node.key !== null ? `:${node.key}` : ''}>`;
        const instance = instances.get(id) ?? { slots: [], cursor: 0 };
        instances.set(id, instance); visited.add(id);
        const before = current;
        current = instance; instance.cursor = 0;
        const output = node.type(node.props);
        current = before;
        return expand(output, id);
      }
      // Opt in to host refs only when the test models an element (focus, bounds, or media).
      const ref = node.props.ref;
      if (options.hostElement && ref && typeof ref === 'object' && ref.current == null) {
        ref.current = options.hostElement(node.type, node.props);
      }
      return { ...node, props: { ...node.props, children: expand(node.props.children, `${path}/${typeof node.type === 'symbol' ? 'fragment' : node.type}`) } };
    };
    const render = () => {
      for (let pass = 0; pass < 50; pass++) {
        dirty = false; visited = new Set(); effects = [];
        tree = expand(jsx(Component, props), root);
        // 描かれなくなった部品を片づける。
        for (const [id, instance] of instances) if (!visited.has(id)) { for (const slot of instance.slots) if (slot?.effect) slot.cleanup?.(); instances.delete(id); }
        for (const run of effects.splice(0)) run();
        if (!dirty) return;
      }
      throw Error('画面が、落ち着きません（描き直しが続いています）');
    };
    const collect = (value, out) => {
      if (Array.isArray(value)) value.forEach((child) => collect(child, out));
      else if (value && typeof value === 'object') { out.push(value); collect(value.props.children, out); }
      return out;
    };
    const read = (value) => (Array.isArray(value) ? value.map(read).join('') : value && typeof value === 'object' ? read(value.props.children) : value === null || value === undefined || typeof value === 'boolean' ? '' : String(value));
    /** 要素の並び（渡さなければ、画面の全部）。 */
    const nodes = (value) => collect(value === undefined ? tree : value, []);
    /** 中の文（渡さなければ、画面の全部）。 */
    const text = (value) => read(value === undefined ? tree : value);
    /** 進んでいる通信が終わり、画面が落ち着くまで待つ（回数ではなく、実際の時間で見張る。hash の計算は、別の thread で終わるため）。 */
    const flush = async () => {
      const deadline = performance.now() + 20_000;
      for (let quiet = 0; quiet < 4;) {
        await new Promise((resolve) => { if (inflight > 0) setTimeout(resolve, 1); else setImmediate(resolve); });
        const before = read(tree);
        render();
        quiet = inflight === 0 && read(tree) === before ? quiet + 1 : 0;
        if (performance.now() > deadline) throw Error('画面の通信が、終わりません');
      }
    };
    const api = {
      text, nodes, render, flush,
      /** 条件に合う要素（type と、中の文の一部）。 */
      find: (type, label) => nodes().filter((node) => node.type === type && (label === undefined || text(node).includes(label))),
      /** ボタンを押す。押せないボタン・無いボタンは、試験の失敗。 */
      async click(label) {
        const [button] = api.find('button', label);
        if (!button) throw Error(`「${label}」のボタンがありません: ${text()}`);
        if (button.props.disabled) throw Error(`「${label}」は、押せません`);
        button.props.onClick?.({ preventDefault() {} });
        render();
        await flush();
      },
      /** 入力欄へ打つ（最初の input）。 */
      async type(value) {
        const [input] = nodes().filter((node) => node.type === 'input');
        input.props.onChange({ target: { value } });
        render();
        await flush();
      },
      /** その要素を押す（ボタン・リンク）。 */
      async press(node) {
        if (!node) throw Error('押す要素がありません');
        if (node.props.disabled) throw Error('その要素は、押せません');
        node.props.onClick?.({ preventDefault() {} });
        render();
        await flush();
      },
      /** その欄の値を変える（input・textarea・select）。 */
      async change(node, value) {
        if (!node?.props.onChange) throw Error('値を変えられる要素がありません');
        node.props.onChange({ target: { value } });
        render();
        await flush();
      },
      /** その form を送る（Enter や、submit のボタンを押した時と同じ）。 */
      async submit(node) {
        if (!node?.props.onSubmit) throw Error('送れる form がありません');
        node.props.onSubmit({ preventDefault() {} });
        render();
        await flush();
      },
      /** 時計を進める。期限の来た timer を、順に動かす。 */
      async tick(ms) {
        const end = clock + ms;
        for (let guard = 0; guard < 1000; guard++) {
          const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) break;
          const [id, timer] = due;
          clock = Math.max(clock, timer.at);
          if (timer.every) timer.at += timer.every; else timers.delete(id);
          timer.fn();
          render();
          await flush();
        }
        clock = end;
        render();
        await flush();
      },
    };
    render();
    return api;
  }
  return { mount, calls, visits, storage, time: () => clock };
}
