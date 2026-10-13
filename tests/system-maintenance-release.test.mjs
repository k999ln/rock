import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import * as backup from '../lib/system-backup.ts';
import { releaseProgress } from '../lib/release-progress.ts';

function load(data, options = {}) {
  const componentSource = readFileSync(
    new URL('../components/system-maintenance.tsx', import.meta.url),
    'utf8',
  );
  const icons = [
    'Activity',
    'AlertCircle',
    'AppWindow',
    'ArchiveRestore',
    'ArrowLeft',
    'BellRing',
    'CheckCircle2',
    'CloudCog',
    'Database',
    'Download',
    'FileDown',
    'HardDrive',
    'House',
    'KeyRound',
    'LoaderCircle',
    'RefreshCw',
    'RotateCcw',
    'ShieldAlert',
    'Smartphone',
    'Upload',
    'XCircle',
  ];
  const transparent = ({ children }) =>
    React.createElement('div', {}, children);
  const modules = {
    react: options.react ?? React,
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': Object.fromEntries(icons.map((name) => [name, () => null])),
    'next/link': ({ children, ...props }) =>
      React.createElement('a', props, children),
    '@/components/ui/alert-dialog': Object.fromEntries(
      [
        'AlertDialog',
        'AlertDialogAction',
        'AlertDialogCancel',
        'AlertDialogContent',
        'AlertDialogDescription',
        'AlertDialogFooter',
        'AlertDialogHeader',
        'AlertDialogTitle',
        'AlertDialogTrigger',
      ].map((name) => [name, transparent]),
    ),
    '@/components/ui/dialog': Object.fromEntries(
      ['Dialog', 'DialogContent', 'DialogDescription', 'DialogTitle'].map(
        (name) => [name, transparent],
      ),
    ),
    '@/lib/device': { deviceToken: () => 'synthetic-device' },
    '@/lib/release-progress': { releaseProgress },
    '@/lib/system-backup': options.backup ?? backup,
    '@/data/release-readiness.json': data,
    './system-maintenance.module.css': new Proxy(
      {},
      { get: (_target, key) => String(key) },
    ),
  };
  const exports = {};
  runInNewContext(
    ts.transpileModule(componentSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      Error,
      localStorage: options.storage,
      Blob,
      URL: options.url ?? URL,
      document: options.document,
      window: options.window,
      require(name) {
        assert.ok(name in modules, name);
        return modules[name];
      },
    },
  );
  return exports.default;
}
function render(data) {
  return renderToStaticMarkup(React.createElement(load(data)));
}
void test('release screen follows observed public version and distinguishes readiness from publication and Pixel acceptance', () => {
  const data = JSON.parse(
    readFileSync(
      new URL('../data/release-readiness.json', import.meta.url),
      'utf8',
    ),
  );
  const before = JSON.stringify(data);
  const html = render(data);
  assert.ok(html.includes(`v${data.currentSiteObservation.version}`));
  assert.ok(
    html.includes(data.currentSiteObservation.sourceCommit.slice(0, 8)),
  );
  assert.match(html, /Web Developer Previewは一般公開済み/);
  assert.match(html, /Pixel 10 GL066／frankel/);
  assert.match(
    html,
    /本番本人認証の一周と静的配信のセキュリティヘッダーは未受入/,
  );
  assert.match(html, /旧本人限定Webの記録/);
  assert.match(html, /全OSの正式署名・実機flash・復旧の受入は残り/);
  assert.doesNotMatch(
    html,
    /対象端末未選択|対象機種未選択|安全に稼働中ですが最新版同期前|配信先の接続とライセンス条件が残る/,
  );
  const ready = data.targets.filter(
    (target) => target.declaredStatus === 'ready',
  ).length;
  assert.ok(html.includes(`${ready} / ${data.targets.length}`));
  assert.equal(
    JSON.stringify(data),
    before,
    'rendering does not change release gates or acceptance evidence',
  );
  const newer = structuredClone(data);
  newer.currentSiteObservation.version = 999;
  newer.currentSiteObservation.sourceCommit = 'e'.repeat(40);
  const changed = render(newer);
  assert.match(changed, /v999/);
  assert.match(changed, /eeeeeeee/);
});

function interactive(storage, backupModule = backup, options = {}) {
  const data = JSON.parse(
    readFileSync(
      new URL('../data/release-readiness.json', import.meta.url),
      'utf8',
    ),
  );
  const slots = [],
    cleanups = [];
  let cursor = 0,
    tree;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (value) => {
          slots[i] = typeof value === 'function' ? value(slots[i]) : value;
        },
      ];
    },
    useRef(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    useCallback: (value) => value,
    useMemo: (calculate) => calculate(),
    useEffect(effect, deps) {
      if (deps?.length === 0 && cleanups.length === 0) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
    },
  };
  const component = load(data, {
    ...options,
    react,
    storage,
    backup: backupModule,
  });
  function rerender() {
    cursor = 0;
    tree = component();
  }
  function nodes(node, result = []) {
    if (Array.isArray(node)) node.forEach((child) => nodes(child, result));
    else if (node && typeof node === 'object') {
      result.push(node);
      nodes(
        typeof node.type === 'function'
          ? node.type(node.props)
          : node.props?.children,
        result,
      );
    }
    return result;
  }
  function text(node) {
    return typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(text).join('')
        : node && typeof node === 'object'
          ? text(
              typeof node.type === 'function'
                ? node.type(node.props)
                : node.props?.children,
            )
          : '';
  }
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
    rerender();
  }
  async function click(label) {
    const node = nodes(tree).find(
      (item) => item.props?.onClick && text(item) === label,
    );
    assert.ok(node, label);
    node.props.onClick();
    rerender();
    await flush();
  }
  function file(value) {
    const node = nodes(tree).find((item) => item.props?.type === 'file');
    assert.ok(node);
    node.props.onChange({ target: { files: [value] } });
    rerender();
  }
  rerender();
  return {
    click,
    file,
    get tree() {
      return tree;
    },
    nodes,
    text,
    rerender,
    flush,
    unmount() {
      cleanups.forEach((cleanup) => cleanup());
    },
    dialog() {
      return nodes(tree).find((node) => typeof node.props?.open === 'boolean');
    },
  };
}
function storageFixture() {
  const values = new Map([
    ['rockstaros.home.preferences.v1', 'old-home'],
    ['rockstaros.addons.v1', 'old-addons'],
  ]);
  return {
    values,
    fault: null,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      this.fault?.('set', key, value);
      values.set(key, value);
    },
    removeItem(key) {
      this.fault?.('remove', key);
      values.delete(key);
    },
  };
}
void test('restore quota failure stays in the dialog with visible error and keeps original settings; retry can succeed', async () => {
  const storage = storageFixture();
  storage.fault = (action, key, value) => {
    if (
      action === 'set' &&
      key === 'rockstaros.addons.v1' &&
      value === 'new-addons'
    )
      throw new Error('synthetic storage quota');
  };
  const h = interactive(storage, {
    ...backup,
    decryptDeviceBackup: async () => ({
      createdAt: '2026-10-13T00:00:00Z',
      records: {
        'rockstaros.home.preferences.v1': 'new-home',
        'rockstaros.addons.v1': 'new-addons',
      },
    }),
  });
  await h.click('バックアップから復元改ざん検知後に端末設定を戻す');
  h.file({
    name: 'synthetic.rockstarbackup',
    text: async () => 'synthetic-encrypted-file',
  });
  await h.click('確認して復元');
  assert.equal(h.dialog().props.open, true);
  const alert = h
    .nodes(h.dialog())
    .find((node) => node.props?.role === 'alert');
  assert.ok(alert);
  assert.match(h.text(alert), /変更前の設定に戻しました/);
  assert.doesNotMatch(h.text(h.tree), /端末設定を復元しました/);
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), 'old-home');
  assert.equal(storage.getItem('rockstaros.addons.v1'), 'old-addons');
  storage.fault = null;
  await h.click('確認して復元');
  assert.equal(h.dialog().props.open, false);
  assert.match(h.text(h.tree), /端末設定を復元しました/);
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), 'new-home');
});
void test('reset failure is caught and never displays successful reset', async () => {
  const storage = storageFixture();
  storage.fault = (action, key) => {
    if (action === 'remove' && key === 'rockstaros.addons.v1')
      throw new Error('synthetic removal failure');
  };
  const h = interactive(storage);
  await h.click('初期化する');
  assert.match(h.text(h.tree), /変更前の設定に戻しました/);
  assert.doesNotMatch(
    h.text(h.tree),
    /ホームの外観と並び順を初期状態に戻しました/,
  );
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), 'old-home');
  assert.equal(storage.getItem('rockstaros.addons.v1'), 'old-addons');
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const recoveredBackup = {
  createdAt: '2026-10-13T00:00:00Z',
  records: {
    'rockstaros.home.preferences.v1': 'backup-home',
    'rockstaros.addons.v1': 'backup-addons',
  },
};
async function startRestore(h, text = async () => 'synthetic-encrypted-file') {
  await h.click('バックアップから復元改ざん検知後に端末設定を戻す');
  h.file({ name: 'synthetic.rockstarbackup', text });
  await h.click('確認して復元');
}
void test('closed async restore cannot revive settings after an explicit successful reset', async () => {
  const pending = deferred(),
    storage = storageFixture();
  const h = interactive(storage, {
    ...backup,
    decryptDeviceBackup: () => pending.promise,
  });
  await startRestore(h);
  h.dialog().props.onOpenChange(false);
  h.rerender();
  await h.click('初期化する');
  pending.resolve(recoveredBackup);
  await h.flush();
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), null);
  assert.equal(storage.getItem('rockstaros.addons.v1'), null);
  assert.doesNotMatch(h.text(h.tree), /端末設定を復元しました/);
});
void test('closing while file text is loading prevents later decrypt and storage effects', async () => {
  const loading = deferred(),
    storage = storageFixture();
  let decrypts = 0;
  const h = interactive(storage, {
    ...backup,
    decryptDeviceBackup: async () => {
      decrypts++;
      return recoveredBackup;
    },
  });
  await startRestore(h, () => loading.promise);
  h.dialog().props.onOpenChange(false);
  h.rerender();
  loading.resolve('synthetic-encrypted-file');
  await h.flush();
  assert.equal(decrypts, 0);
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), 'old-home');
});
void test('an old rejected decrypt does not unlock or replace the next pending restore', async () => {
  const old = deferred(),
    latest = deferred(),
    storage = storageFixture();
  let calls = 0;
  const h = interactive(storage, {
    ...backup,
    decryptDeviceBackup: () => (++calls === 1 ? old.promise : latest.promise),
  });
  await startRestore(h);
  h.dialog().props.onOpenChange(false);
  h.rerender();
  await startRestore(h);
  old.reject(new Error('obsolete-decrypt-error'));
  await h.flush();
  const submit = h
    .nodes(h.tree)
    .find(
      (node) => node.props?.onClick && h.text(node).includes('確認して復元'),
    );
  assert.equal(
    submit.props.disabled,
    true,
    'new pending restore must retain its own busy state',
  );
  assert.doesNotMatch(h.text(h.tree), /obsolete-decrypt-error/);
  latest.resolve(recoveredBackup);
  await h.flush();
  assert.equal(
    storage.getItem('rockstaros.home.preferences.v1'),
    'backup-home',
  );
  assert.equal(h.dialog().props.open, false);
});
void test('cancelled async encryption does not download an archive or report success', async () => {
  const pending = deferred(),
    storage = storageFixture();
  let urls = 0,
    downloads = 0;
  const h = interactive(
    storage,
    { ...backup, encryptDeviceBackup: () => pending.promise },
    {
      url: {
        createObjectURL() {
          urls++;
          return 'blob:synthetic';
        },
        revokeObjectURL() {},
      },
      document: {
        createElement() {
          return {
            click() {
              downloads++;
            },
          };
        },
      },
      window: { setTimeout() {} },
    },
  );
  await h.click('暗号化バックアップ端末内の外観・設定を安全に保存');
  await h.click('暗号化して保存');
  h.dialog().props.onOpenChange(false);
  h.rerender();
  pending.resolve('{}');
  await h.flush();
  assert.equal(urls, 0);
  assert.equal(downloads, 0);
  assert.doesNotMatch(h.text(h.tree), /暗号化バックアップを保存しました/);
});
void test('unmount fences an outstanding decrypted backup before preferences are written', async () => {
  const pending = deferred(),
    storage = storageFixture();
  const h = interactive(storage, {
    ...backup,
    decryptDeviceBackup: () => pending.promise,
  });
  await startRestore(h);
  h.unmount();
  pending.resolve(recoveredBackup);
  await h.flush();
  assert.equal(storage.getItem('rockstaros.home.preferences.v1'), 'old-home');
  assert.equal(storage.getItem('rockstaros.addons.v1'), 'old-addons');
});
