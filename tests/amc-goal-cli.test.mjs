import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { loadGoalSources, renderGoalWorkbench } from '../scripts/amc-goal.mjs';
import { applyGoalEvent, summarizeGoal } from '../scripts/amc-goal-engine.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'scripts/amc-goal.mjs');
const sources = loadGoalSources();

// This fixture checks DOM state and handlers, not browser layout or rendering.
function browser({
  stored = null,
  chatStored = null,
  selectionStored = null,
  clipboardFails = false,
  confirm = true,
} = {}) {
  const html = renderGoalWorkbench(sources);
  const elements = new Map();
  const downloads = [];
  const copied = [];
  const networkCalls = [];
  const confirmations = [];
  const objectUrls = new Map();
  const decode = (value) =>
    value.replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
        })[entity],
    );
  function node(tagName, attributes = {}, parentElement = null) {
    let inner = '';
    let content = '';
    let value;
    const item = {
      tagName: tagName.toUpperCase(),
      attributes,
      parentElement,
      children: [],
      listeners: {},
      focused: false,
      selected: false,
      scrolls: [],
      get innerHTML() {
        return inner;
      },
      set innerHTML(markup) {
        inner = String(markup);
        content = '';
        this.children = [];
        parse(inner, this);
        if (this.tagName === 'SELECT') value = undefined;
      },
      get textContent() {
        return (
          content + this.children.map((child) => child.textContent).join('')
        );
      },
      set textContent(text) {
        content = String(text);
        inner = '';
        this.children = [];
      },
      get value() {
        if (value !== undefined) return value;
        if (this.tagName === 'SELECT') {
          const options = this.querySelectorAll('option');
          return (
            (
              options.find((option) => option.hasAttribute('selected')) ??
              options[0]
            )?.value ?? ''
          );
        }
        return (
          attributes.value ??
          (this.tagName === 'TEXTAREA' ? this.textContent : '')
        );
      },
      set value(next) {
        value = String(next);
      },
      get hidden() {
        return this.hasAttribute('hidden');
      },
      set hidden(next) {
        if (next) this.setAttribute('hidden', '');
        else this.removeAttribute('hidden');
      },
      get open() {
        return this.hasAttribute('open');
      },
      set open(next) {
        if (next) this.setAttribute('open', '');
        else this.removeAttribute('open');
      },
      get disabled() {
        return this.hasAttribute('disabled');
      },
      set disabled(next) {
        if (next) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
      },
      get checked() {
        return this.hasAttribute('checked');
      },
      set checked(next) {
        if (next) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
      },
      get className() {
        return attributes.class ?? '';
      },
      get dataset() {
        return Object.fromEntries(
          Object.entries(attributes)
            .filter(([name]) => name.startsWith('data-'))
            .map(([name, next]) => [
              name
                .slice(5)
                .replace(/-([a-z])/g, (_match, char) => char.toUpperCase()),
              next,
            ]),
        );
      },
      set className(next) {
        attributes.class = String(next);
      },
      setAttribute(name, next) {
        attributes[name] = String(next);
      },
      getAttribute(name) {
        return attributes[name] ?? null;
      },
      hasAttribute(name) {
        return Object.hasOwn(attributes, name);
      },
      removeAttribute(name) {
        delete attributes[name];
      },
      matches(selector) {
        if (selector.startsWith('#'))
          return attributes.id === selector.slice(1);
        if (selector.startsWith('.'))
          return this.className.split(/\s+/).includes(selector.slice(1));
        const attribute = selector.match(
          /^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/,
        );
        if (attribute)
          return (
            this.hasAttribute(attribute[1]) &&
            (attribute[2] === undefined ||
              this.getAttribute(attribute[1]) === attribute[2])
          );
        return this.tagName.toLowerCase() === selector.toLowerCase();
      },
      closest(selector) {
        return this.matches(selector)
          ? this
          : (this.parentElement?.closest(selector) ?? null);
      },
      querySelectorAll(selector) {
        return this.children.flatMap((child) => [
          ...(child.matches(selector) ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
      },
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      focus() {
        this.focused = true;
      },
      select() {
        this.selected = true;
      },
      scrollIntoView(options) {
        this.scrolls.push(options);
      },
      click() {
        if (this.tagName === 'A')
          downloads.push({
            name: this.download,
            blob: objectUrls.get(this.href),
          });
      },
      requestSubmit() {
        return this.listeners.submit?.({ target: this, preventDefault() {} });
      },
      appendText(text) {
        content += decode(text);
      },
    };
    item.classList = {
      contains: (name) => item.className.split(/\s+/).includes(name),
      add: (...names) => {
        item.className = [
          ...new Set([
            ...item.className.split(/\s+/).filter(Boolean),
            ...names,
          ]),
        ].join(' ');
      },
      remove: (...names) => {
        item.className = item.className
          .split(/\s+/)
          .filter((name) => !names.includes(name))
          .join(' ');
      },
      toggle(name, force) {
        const add = force ?? !this.contains(name);
        if (add) this.add(name);
        else this.remove(name);
        return add;
      },
    };
    if (attributes.id) elements.set(attributes.id, item);
    return item;
  }
  function parse(markup, parent) {
    const stack = [parent];
    for (const token of markup.matchAll(
      /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g,
    )) {
      const text = token[0];
      if (text.startsWith('<!--')) continue;
      if (text.startsWith('</')) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      if (!text.startsWith('<')) {
        stack.at(-1).appendText(text);
        continue;
      }
      const tag = text.match(/^<([\w-]+)/)[1];
      const attrs = {};
      for (const attr of text
        .slice(tag.length + 1, -1)
        .matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        attrs[attr[1]] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      const child = node(tag, attrs, stack.at(-1));
      stack.at(-1).children.push(child);
      if (
        ![
          'area',
          'base',
          'br',
          'col',
          'embed',
          'hr',
          'img',
          'input',
          'link',
          'meta',
          'param',
          'source',
          'track',
          'wbr',
        ].includes(tag.toLowerCase())
      )
        stack.push(child);
    }
  }
  const documentRoot = node('document');
  // Keep every inline script and all surrounding markup, including the embedded
  // canonical board. Script bodies are data/code, never parsed as HTML elements.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  parse(
    html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>'),
    documentRoot,
  );
  for (const script of scripts) {
    const id = script[1].match(/\bid=["']([^"']+)["']/)?.[1];
    if (id) elements.get(id).textContent = script[2];
  }
  const goalKey = 'amc-goal-workbench-v1';
  const chatKey = 'amc-goal-chat-v1';
  const selectionKey = 'amc-mission-selection-v1';
  const storage = new Map([
    [goalKey, stored],
    [chatKey, chatStored],
    [selectionKey, selectionStored],
  ]);
  const storageWrites = new Map();
  const windowListeners = new Map();
  let idSequence = 0;
  const sandbox = {
    document: {
      getElementById: (id) => elements.get(id),
      querySelectorAll: (selector) => documentRoot.querySelectorAll(selector),
      createElement: (tag) => node(tag),
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, String(value));
        storageWrites.set(key, (storageWrites.get(key) ?? 0) + 1);
      },
      removeItem: (key) => storage.delete(key),
    },
    window: {
      addEventListener: (type, listener) => windowListeners.set(type, listener),
      confirm: (message) => {
        confirmations.push(message);
        return confirm;
      },
    },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          if (clipboardFails) throw new Error('Clipboard unavailable');
          copied.push(text);
        },
      },
    },
    fetch: async (...args) => {
      networkCalls.push(args);
      throw new Error('Unexpected network operation in the offline workbench');
    },
    crypto: { randomUUID: () => 'test-' + idSequence++ },
    setTimeout: (callback) => callback(),
    Blob,
    URL: {
      createObjectURL: (blob) => {
        const url = 'blob:fixture-' + objectUrls.size;
        objectUrls.set(url, blob);
        return url;
      },
      revokeObjectURL: () => {},
    },
  };
  for (const script of scripts)
    if (!/\btype=["']application\/json["']/i.test(script[1]))
      runInNewContext(script[2], sandbox);
  return {
    elements,
    boxes: documentRoot.querySelectorAll('[data-goal-squad]'),
    copied,
    networkCalls,
    downloads,
    confirmations,
    read: () =>
      storage.get(goalKey) ? JSON.parse(storage.get(goalKey)) : null,
    readChat: () =>
      storage.get(chatKey) ? JSON.parse(storage.get(chatKey)) : null,
    readSelection: () =>
      storage.get(selectionKey) ? JSON.parse(storage.get(selectionKey)) : null,
    raw: (key) => storage.get(key) ?? null,
    setStored: (value) => {
      storage.set(goalKey, value);
    },
    setChatStored: (value) => storage.set(chatKey, value),
    writes: () => storageWrites.get(goalKey) ?? 0,
    chatWrites: () => storageWrites.get(chatKey) ?? 0,
    selectionWrites: () => storageWrites.get(selectionKey) ?? 0,
    event: async (id, type = 'click', event = {}) => {
      const element = elements.get(id);
      assert.ok(element, 'expected fixture element: ' + id);
      assert.ok(
        element.listeners[type],
        'expected event listener: ' + id + '/' + type,
      );
      if (type === 'click' && element.disabled) return;
      await element.listeners[type]({
        target: element,
        preventDefault() {},
        ...event,
      });
    },
  };
}

await test('Goal artifact is standalone, offline and escapes source text', () => {
  const fixture = structuredClone(sources);
  fixture.mission.squads[0].name = '</script><script>bad()</script>';
  const html = renderGoalWorkbench(fixture);
  assert.ok(!html.includes('<script>bad()'));
  assert.match(html, /connect-src 'none'/);
  assert.ok(!html.includes('__AMC_GOAL_'));
  assert.ok(!html.includes('__AMC_BOARD__'));
  assert.equal((html.match(/<script/g) ?? []).length, 5);
  assert.equal(sources.provenance.length, 2);
  assert.ok(
    sources.provenance.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)),
  );
});

await test('CLI compiles, exports and refuses overwrite/unknown options', () => {
  const dir = mkdtempSync(join(tmpdir(), 'amc-goal-cli-'));
  try {
    const instruction = join(dir, 'instruction.txt');
    const goalPath = join(dir, 'goal.json');
    writeFileSync(instruction, 'AMCの部隊責任と合格条件を整理する');
    const args = [
      cli,
      'compile',
      '--instruction-file',
      instruction,
      '--squads',
      'H1',
      '--out',
      goalPath,
    ];
    execFileSync(process.execPath, args);
    const goal = JSON.parse(readFileSync(goalPath, 'utf8'));
    assert.equal(goal.state, 'draft');
    assert.equal(goal.reviewRequired, true);
    assert.ok(goal.tasks.some((task) => task.id === 'AMC01-01'));
    assert.equal(goal.sourceFiles.length, 2);
    const repeated = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /EEXIST/);
    const promptPath = join(dir, 'goal.md');
    execFileSync(process.execPath, [
      cli,
      'prompt',
      '--goal',
      goalPath,
      '--out',
      promptPath,
    ]);
    assert.match(readFileSync(promptPath, 'utf8'), /AMC01-01/);
    const status = JSON.parse(
      execFileSync(process.execPath, [cli, 'status', '--goal', goalPath], {
        encoding: 'utf8',
      }),
    );
    assert.equal(status.leafTotal, 6);
    assert.equal(status.leafCompleted, 0);
    const bad = spawnSync(
      process.execPath,
      [cli, 'status', '--goal', goalPath, '--send', 'true'],
      { encoding: 'utf8' },
    );
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /Unknown option/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function createH1(ui) {
  ui.elements.get('instruction').value =
    '部隊の責任とMini単独・Pro任意の境界を確認したい';
  ui.boxes.find((box) => box.value === 'H1').checked = true;
  await ui.event('compile-form', 'submit');
  assert.equal(ui.elements.get('error').textContent, '');
}

async function approveH1(ui) {
  ui.elements.get('coverage').value =
    'AMC01の責任表だけを対象とし、実機・製造は含めない';
  ui.elements.get('goal-criteria').value =
    '責任表の主担当と未決事項を証拠付きでレビューする';
  await ui.event('approve');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.read().state, 'active');
}

async function chat(ui, text) {
  ui.elements.get('chat-input').value = text;
  await ui.event('chat-form', 'submit');
  assert.equal(ui.elements.get('error').textContent, '');
}

async function chatAction(ui, action) {
  const button = ui.elements
    .get('chat-actions')
    .querySelector('[data-chat-action="' + action + '"]');
  assert.ok(button, 'expected chat action: ' + action);
  assert.equal(
    button.disabled,
    false,
    'chat action must be enabled: ' + action,
  );
  await ui.event('chat-actions', 'click', { target: button });
  assert.equal(ui.elements.get('error').textContent, '');
}

async function simpleReview(ui, request = 'メモアプリを作りたい') {
  await ui.event('request-tab');
  if (ui.elements.get('simple-home').hidden) await ui.event('new-goal');
  ui.elements.get('simple-request').value = request;
  await ui.event('simple-request-form', 'submit');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.elements.get('simple-review').hidden, false);
}

async function simpleConfirm(
  ui,
  intent = 'メモを一か所にまとめて、探す時間を減らしたい',
) {
  ui.elements.get('simple-intent').value = intent;
  await ui.event('simple-confirm');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.read().state, 'active');
}

function optionValues(ui) {
  return ui.elements
    .get('event-type')
    .querySelectorAll('option')
    .map((option) => option.value);
}

await test('Workbench starts with only request and reveals suggested squads without persisting a Goal', async () => {
  const ui = browser();
  assert.equal(ui.elements.get('request-view').hidden, false);
  for (const id of [
    'workspace',
    'plan-view',
    'progress-view',
    'team-picker',
    'save-json-top',
  ])
    assert.equal(ui.elements.get(id).hidden, true, id + ' must start hidden');
  assert.equal(ui.elements.get('new-goal').hidden, false);
  assert.equal(
    ui.elements.get('nav-request').getAttribute('aria-current'),
    'step',
  );
  assert.equal(ui.elements.get('nav-plan').disabled, true);
  assert.equal(ui.elements.get('nav-progress').disabled, true);
  assert.equal(ui.elements.get('parallel').value, '1');
  await ui.event('recommend');
  assert.match(ui.elements.get('error').textContent, /入力/);
  assert.equal(ui.elements.get('team-picker').hidden, true);
  ui.elements.get('instruction').value = 'AMCの責任分担を確認したい';
  await ui.event('recommend');
  assert.equal(ui.elements.get('team-picker').hidden, false);
  assert.ok(ui.boxes.some((box) => box.checked));
  assert.ok(ui.elements.get('selection-preview').innerHTML.length > 0);
  assert.equal(ui.writes(), 0);
  assert.equal(ui.read(), null);
  await ui.event('instruction', 'input');
  assert.match(
    ui.elements.get('selection-summary').textContent,
    /指示が変わりました/,
  );
  await ui.event('select-none');
  assert.equal(
    ui.boxes.some((box) => box.checked),
    false,
  );
});

await test('Workbench moves from review to progress and copies instructions without starting work', async () => {
  const ui = browser();
  await createH1(ui);
  assert.equal(ui.elements.get('request-view').hidden, true);
  assert.equal(ui.elements.get('plan-view').hidden, false);
  assert.equal(ui.elements.get('progress-view').hidden, true);
  assert.equal(ui.elements.get('record-section').hidden, true);
  assert.equal(
    ui.elements.get('nav-plan').getAttribute('aria-current'),
    'step',
  );
  assert.equal(ui.elements.get('approve').disabled, false);
  assert.equal(ui.elements.get('approval-blocker').hidden, true);
  await ui.event('approve');
  assert.equal(ui.read().state, 'draft');
  assert.match(ui.elements.get('error').textContent, /範囲/);
  await approveH1(ui);
  assert.equal(ui.elements.get('plan-view').hidden, true);
  assert.equal(ui.elements.get('progress-view').hidden, false);
  assert.equal(
    ui.elements.get('nav-progress').getAttribute('aria-current'),
    'step',
  );
  assert.equal(ui.elements.get('approval-section').hidden, true);
  assert.equal(ui.elements.get('approved-plan').hidden, false);
  assert.match(ui.elements.get('next-action').textContent, /コピー/);
  const before = JSON.stringify(ui.read());
  const writes = ui.writes();
  await ui.event('next-action');
  assert.equal(ui.copied.length, 1);
  assert.match(ui.copied[0], /AMC01-01/);
  assert.match(ui.elements.get('notice').textContent, /実行していません/);
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
  for (const view of ['request', 'plan', 'progress']) {
    await ui.event('nav-' + view);
    assert.equal(ui.elements.get(view + '-view').hidden, false);
    assert.equal(
      ui.elements.get('nav-' + view).getAttribute('aria-current'),
      'step',
    );
  }
  assert.equal(JSON.stringify(ui.read()), before);
});

await test('Workbench only offers state-appropriate record operations and fields', async () => {
  const ui = browser();
  await createH1(ui);
  await approveH1(ui);
  await ui.event('task-select', 'change', { target: { value: 'AMC01-01' } });
  assert.deepEqual(optionValues(ui), ['start_task', 'block_task', 'pause']);
  for (const id of [
    'field-outcome',
    'field-summary',
    'field-deliverables',
    'field-evidence',
  ])
    assert.equal(ui.elements.get(id).hidden, true, id);
  ui.elements.get('actor').value = 'worker';
  await ui.event('record');
  assert.deepEqual(optionValues(ui), ['submit_result', 'pause']);
  for (const id of [
    'field-outcome',
    'field-summary',
    'field-deliverables',
    'field-evidence',
  ])
    assert.equal(ui.elements.get(id).hidden, false, id);
  await ui.event('next-action');
  assert.equal(ui.elements.get('event-type').value, 'submit_result');
  assert.equal(ui.elements.get('record-section').open, true);
  assert.equal(ui.elements.get('record-section').scrolls.length, 1);
  ui.elements.get('event-type').value = 'pause';
  await ui.event('event-type', 'change');
  assert.equal(ui.elements.get('field-summary').hidden, false);
  for (const id of ['field-outcome', 'field-deliverables', 'field-evidence'])
    assert.equal(ui.elements.get(id).hidden, true, id);
  ui.elements.get('result-summary').value = 'fixture: wait for human review';
  await ui.event('record');
  assert.equal(ui.read().state, 'paused');
  assert.deepEqual(optionValues(ui), ['submit_result', 'resume']);
  await ui.event('next-action');
  assert.equal(ui.elements.get('event-type').value, 'resume');
  assert.match(
    ui.elements.get('record-help').textContent,
    /外部.*停止・再開されません/,
  );
  await ui.event('record');
  assert.equal(ui.read().state, 'active');
});

await test('Workbench filters tasks and clears results when selecting another task', async () => {
  const ui = browser();
  await createH1(ui);
  await approveH1(ui);
  ui.elements.get('task-filter').value = 'ready';
  await ui.event('task-filter', 'change');
  const buttons = ui.elements
    .get('task-list')
    .querySelectorAll('[data-task-id]');
  assert.ok(buttons.length > 0);
  assert.ok(
    buttons.some(
      (button) => button.getAttribute('data-task-id') === 'AMC01-01',
    ),
  );
  ui.elements.get('result-summary').value = 'must not carry to another task';
  ui.elements.get('evidence').value = 'docs/old-evidence.json';
  await ui.event('task-list', 'click', { target: buttons[0].children[0] });
  assert.equal(
    ui.elements.get('task-select').value,
    buttons[0].getAttribute('data-task-id'),
  );
  assert.equal(ui.elements.get('result-summary').value, '');
  assert.equal(ui.elements.get('evidence').value, '');
  assert.equal(ui.elements.get('task-detail').focused, true);
  ui.elements.get('deliverables').value = 'docs/old-output.md';
  await ui.event('task-select', 'change', { target: { value: 'AMC01' } });
  assert.equal(ui.elements.get('deliverables').value, '');
  assert.match(ui.elements.get('task-detail').innerHTML, /AMC01/);
  assert.ok(
    !optionValues(ui).includes('start_task'),
    'parent cannot start before child acceptance',
  );
  ui.elements.get('task-filter').value = 'done';
  await ui.event('task-filter', 'change');
  assert.equal(ui.elements.get('task-count').textContent, '0件を表示');
  assert.match(ui.elements.get('task-list').innerHTML, /ありません/);
});

await test('Workbench blocks incomplete plans and repair copy remains an unapproved proposal', async () => {
  const ui = browser();
  ui.elements.get('instruction').value = 'Miniの設計範囲を確認する';
  ui.boxes.find((box) => box.value === 'M1').checked = true;
  await ui.event('compile-form', 'submit');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.read().state, 'draft');
  assert.equal(ui.elements.get('approve').disabled, true);
  assert.equal(ui.elements.get('approval-blocker').hidden, false);
  assert.equal(ui.elements.get('repair-prompt').hidden, false);
  const before = JSON.stringify(ui.read());
  await ui.event('repair-prompt');
  assert.match(ui.copied[0], /実行や承認はしない/);
  assert.equal(JSON.stringify(ui.read()), before);
});

await test('Workbench creates a real draft, approves, records result and separate review', async () => {
  const ui = browser();
  assert.equal(ui.writes(), 0);
  await createH1(ui);
  assert.equal(ui.read().state, 'draft');
  ui.elements.get('coverage').value =
    'AMC01の責任表を対象とし、実機・製造は含めない';
  ui.elements.get('goal-criteria').value =
    '責任表の主担当と未決事項を証拠付きでレビューする';
  await ui.event('approve');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.read().state, 'active');
  const task = ui.read().tasks.find((item) => item.id === 'AMC01-01');
  await ui.event('task-select', 'change', { target: { value: task.id } });
  ui.elements.get('actor').value = 'worker';
  ui.elements.get('event-type').value = 'start_task';
  await ui.event('record');
  assert.equal(ui.elements.get('error').textContent, '');
  ui.elements.get('event-type').value = 'submit_result';
  ui.elements.get('outcome').value = 'succeeded';
  ui.elements.get('result-summary').value =
    'fixture only: documented acceptance';
  ui.elements.get('deliverables').value = task.deliverables
    .map((item) => item.path + (item.section ? '#' + item.section : ''))
    .join('\n');
  ui.elements.get('evidence').value = 'docs/evidence/test-only.json';
  await ui.event('record');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.deepEqual(optionValues(ui), ['verify_task', 'pause']);
  assert.equal(ui.elements.get('field-outcome').hidden, false);
  assert.equal(ui.elements.get('field-evidence').hidden, false);
  assert.equal(ui.elements.get('field-summary').hidden, true);
  assert.equal(ui.elements.get('field-deliverables').hidden, true);
  ui.elements.get('event-type').value = 'verify_task';
  await ui.event('record');
  assert.match(ui.elements.get('error').textContent, /reviewer/i);
  ui.elements.get('actor').value = 'reviewer';
  ui.elements.get('evidence').value = 'docs/evidence/test-only-review.json';
  await ui.event('record');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(
    ui.read().tasks.find((item) => item.id === task.id).status,
    'done',
  );
  assert.equal(
    ui.read().tasks.find((item) => item.id === 'AMC01').status,
    'pending',
  );
  assert.equal(ui.read().state, 'active');
  const restored = browser({ stored: JSON.stringify(ui.read()) });
  assert.equal(restored.writes(), 0);
  assert.equal(restored.read().revision, ui.read().revision);
});

await test('Workbench can replace malformed local storage and rejects concurrent same-revision replacement', async () => {
  const ui = browser({ stored: '{invalid' });
  await createH1(ui);
  assert.equal(ui.read().state, 'draft');
  const forged = ui.read();
  forged.instruction += ' elsewhere';
  ui.setStored(JSON.stringify(forged));
  ui.elements.get('coverage').value = 'scope';
  ui.elements.get('goal-criteria').value = 'criterion';
  await ui.event('approve');
  assert.match(ui.elements.get('error').textContent, /別の画面/);
});

await test('Workbench malformed import is rejected before persistence', async () => {
  const ui = browser();
  await createH1(ui);
  const before = JSON.stringify(ui.read());
  const malformed = ui.read();
  delete malformed.tasks[0].childTaskIds;
  await ui.event('import-file', 'change', {
    target: {
      files: [{ size: 100, text: async () => JSON.stringify(malformed) }],
    },
  });
  assert.ok(ui.elements.get('error').textContent);
  assert.ok(
    JSON.stringify(ui.read()) === before,
    'invalid import must not modify the stored Goal',
  );
});

await test('Workbench restores or imports parallelism and keeps an existing Goal while preparing a new one', async () => {
  const ui = browser();
  ui.elements.get('parallel').value = '3';
  await createH1(ui);
  const draft = ui.read();
  const restoredDraft = browser({ stored: JSON.stringify(draft) });
  assert.equal(restoredDraft.elements.get('parallel').value, '3');
  assert.equal(restoredDraft.elements.get('plan-view').hidden, false);
  assert.equal(restoredDraft.writes(), 0);
  await approveH1(ui);
  const active = JSON.stringify(ui.read());
  const restored = browser({ stored: active });
  assert.equal(restored.elements.get('parallel').value, '3');
  assert.equal(restored.elements.get('progress-view').hidden, false);
  assert.equal(restored.boxes.find((box) => box.value === 'H1').checked, true);
  assert.equal(restored.writes(), 0);
  await restored.event('new-goal');
  assert.equal(restored.elements.get('request-view').hidden, false);
  assert.equal(restored.elements.get('team-picker').hidden, true);
  assert.equal(restored.elements.get('instruction').value, '');
  assert.equal(JSON.stringify(restored.read()), active);
  assert.equal(restored.writes(), 0);
  const imported = browser();
  await imported.event('import-file', 'change', {
    target: { files: [{ size: active.length, text: async () => active }] },
  });
  assert.equal(imported.elements.get('error').textContent, '');
  assert.equal(imported.elements.get('parallel').value, '3');
  assert.equal(imported.elements.get('progress-view').hidden, false);
  assert.equal(JSON.stringify(imported.read()), active);
});

await test('Workbench rejects oversized and older imports without changing the saved Goal', async () => {
  const ui = browser();
  await createH1(ui);
  const older = JSON.stringify(ui.read());
  await approveH1(ui);
  const before = JSON.stringify(ui.read());
  const writes = ui.writes();
  await ui.event('import-file', 'change', {
    target: {
      files: [
        {
          size: 16_000_001,
          text: async () => {
            throw new Error('must not read');
          },
        },
      ],
    },
  });
  assert.match(ui.elements.get('error').textContent, /16MB/);
  assert.equal(JSON.stringify(ui.read()), before);
  await ui.event('import-file', 'change', {
    target: { files: [{ size: older.length, text: async () => older }] },
  });
  assert.match(ui.elements.get('error').textContent, /古いrevision/);
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
});

await test('Workbench cancelled replacement preserves the Goal and malformed storage is downloadable', async () => {
  const ui = browser();
  await createH1(ui);
  const before = JSON.stringify(ui.read());
  const writes = ui.writes();
  assert.equal(ui.elements.get('save-json-top').hidden, false);
  assert.equal(ui.elements.get('save-json-top').disabled, false);
  await ui.event('save-json-top');
  assert.equal(ui.downloads.length, 1);
  assert.deepEqual(JSON.parse(await ui.downloads[0].blob.text()), ui.read());
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
  const cancelled = browser({ stored: before, confirm: false });
  await cancelled.event('new-goal');
  await createH1(cancelled);
  assert.equal(cancelled.confirmations.length, 1);
  assert.equal(JSON.stringify(cancelled.read()), before);
  assert.equal(cancelled.writes(), 0);
  const corrupt = browser({ stored: '{invalid' });
  assert.equal(corrupt.elements.get('save-unreadable').hidden, false);
  await corrupt.event('save-unreadable');
  assert.equal(corrupt.downloads.length, 1);
  assert.equal(await corrupt.downloads[0].blob.text(), '{invalid');
  assert.equal(corrupt.writes(), 0);
});

await test('Workbench clipboard fallback opens and selects readable instructions without changing the Goal', async () => {
  const ui = browser({ clipboardFails: true });
  await createH1(ui);
  await approveH1(ui);
  const before = JSON.stringify(ui.read());
  await ui.event('copy-prompt');
  const prompt = ui.elements.get('prompt');
  assert.equal(prompt.focused, true);
  assert.equal(prompt.selected, true);
  assert.equal(prompt.closest('details').open, true);
  assert.match(prompt.value, /AMC01-01/);
  assert.match(ui.elements.get('notice').textContent, /手動でコピー/);
  assert.equal(JSON.stringify(ui.read()), before);
});

await test('Chat builds and reviews a Goal conversationally but requires the explicit approval button', async () => {
  const ui = browser();
  assert.equal(ui.elements.get('inspector').open, false);
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  assert.equal(ui.read(), null);
  assert.equal(ui.writes(), 0);
  assert.ok(ui.chatWrites() > 0);
  assert.equal(ui.readChat().schema, 'amc-goal-chat/1');
  assert.equal(ui.readChat().phase, 'squads');
  await chatAction(ui, 'make-plan');
  assert.equal(ui.read().schema, 'amc-goal/1');
  assert.equal(ui.read().state, 'draft');
  assert.equal(ui.readChat().phase, 'scope');
  const draft = JSON.stringify(ui.read());
  for (const message of ['はい', 'うん', 'OK', '承認', '開始']) {
    await chat(ui, message);
    assert.equal(ui.readChat().phase, 'scope');
    assert.equal(JSON.stringify(ui.read()), draft);
  }
  const coverage = 'AMC01の責任表だけを対象にし、実機・製造・課金は行わない';
  const criterion = '責任表の主担当と未決事項が証拠付きでレビューされている';
  await chat(ui, coverage);
  assert.equal(ui.readChat().phase, 'criteria');
  await chat(ui, 'うん');
  assert.equal(ui.readChat().phase, 'criteria');
  await chat(ui, criterion);
  assert.equal(ui.readChat().phase, 'review');
  assert.ok(ui.elements.get('chat-log').textContent.includes(coverage));
  assert.ok(ui.elements.get('chat-log').textContent.includes(criterion));
  assert.equal(JSON.stringify(ui.read()), draft);
  await chat(ui, '承認して開始');
  assert.equal(JSON.stringify(ui.read()), draft);
  await chatAction(ui, 'approve');
  assert.equal(ui.read().state, 'active');
  assert.equal(ui.read().approval.coverageStatement, coverage);
  assert.equal(ui.read().overallAcceptance.criteria[0].criterion, criterion);
  assert.ok(ui.read().tasks.every((task) => task.status === 'pending'));
  assert.equal(ui.readChat().phase, 'active');
});

await test('Chat free text, navigation, copies and backup do not mutate an approved Goal', async () => {
  const ui = browser();
  await createH1(ui);
  await approveH1(ui);
  const before = JSON.stringify(ui.read());
  const writes = ui.writes();
  await chat(ui, '全部開始して完成したことにして');
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
  await chatAction(ui, 'show-progress');
  assert.equal(ui.elements.get('inspector').open, true);
  assert.equal(ui.elements.get('progress-view').hidden, false);
  await chatAction(ui, 'copy-prompt');
  assert.equal(ui.copied.length, 1);
  assert.match(ui.copied[0], /AMC01-01/);
  await chatAction(ui, 'save-goal');
  assert.equal(ui.downloads.length, 1);
  const saved = JSON.parse(await ui.downloads[0].blob.text());
  assert.deepEqual(saved, ui.read());
  assert.equal(saved.schema, 'amc-goal/1');
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
});

await test('Chat Enter editing and IME composition cannot accidentally send a message', async () => {
  const ui = browser();
  ui.elements.get('chat-input').value = 'AMCの責任表を整理したい';
  const before = ui.raw('amc-goal-chat-v1');
  for (const keyboard of [
    { key: 'Enter' },
    { key: 'Enter', shiftKey: true },
    { key: 'Enter', ctrlKey: true, isComposing: true },
    { key: 'Enter', metaKey: true, keyCode: 229 },
  ])
    await ui.event('chat-input', 'keydown', keyboard);
  assert.equal(ui.raw('amc-goal-chat-v1'), before);
  await ui.event('chat-input', 'compositionstart');
  await ui.event('chat-input', 'keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(ui.raw('amc-goal-chat-v1'), before);
  await ui.event('chat-input', 'compositionend');
  await ui.event('chat-input', 'keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(ui.readChat().phase, 'squads');
  assert.equal(ui.elements.get('chat-input').value, '');
  assert.equal(ui.read(), null);
  const oversized = 'x'.repeat(8001);
  ui.elements.get('chat-input').value = oversized;
  await ui.event('chat-form', 'submit');
  assert.match(ui.elements.get('error').textContent, /8,000/);
  assert.equal(ui.elements.get('chat-input').value, oversized);
  assert.equal(ui.read(), null);
});

await test('Chat renders user text as escaped text, including after restoration', async () => {
  const ui = browser();
  const payload =
    'AMCの責任表 <img src=x onerror="alert(1)"><script>bad()</script>';
  await chat(ui, payload);
  assert.ok(ui.elements.get('chat-log').textContent.includes(payload));
  assert.equal(ui.elements.get('chat-log').querySelectorAll('img').length, 0);
  assert.equal(
    ui.elements.get('chat-log').querySelectorAll('script').length,
    0,
  );
  assert.ok(ui.elements.get('chat-log').innerHTML.includes('&lt;img'));
  const restored = browser({ chatStored: ui.raw('amc-goal-chat-v1') });
  assert.ok(restored.elements.get('chat-log').textContent.includes(payload));
  assert.equal(
    restored.elements.get('chat-log').querySelectorAll('img').length,
    0,
  );
  assert.equal(restored.read(), null);
  assert.equal(restored.writes(), 0);
});

await test('Chat restoration cannot replace the authoritative Goal with stale or malformed conversation state', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  const staleChat = ui.raw('amc-goal-chat-v1');
  await approveH1(ui);
  const active = JSON.stringify(ui.read());
  const stale = browser({ stored: active, chatStored: staleChat });
  assert.equal(JSON.stringify(stale.read()), active);
  assert.equal(stale.read().state, 'active');
  assert.equal(stale.writes(), 0);
  assert.equal(
    stale.elements
      .get('chat-actions')
      .querySelector('[data-chat-action="approve"]'),
    null,
  );
  const malformed = browser({ stored: active, chatStored: '{invalid' });
  assert.equal(JSON.stringify(malformed.read()), active);
  assert.equal(malformed.writes(), 0);
  await chat(malformed, '開始');
  assert.equal(JSON.stringify(malformed.read()), active);
});

await test('Chat draft details and incomplete plans stay reviewable without granting approval', async () => {
  const ui = browser();
  await chat(ui, 'Miniの設計を確認したい');
  await chatAction(ui, 'edit-squads');
  assert.equal(ui.elements.get('inspector').open, true);
  assert.equal(ui.elements.get('request-view').hidden, false);
  await ui.event('select-none');
  ui.boxes.find((box) => box.value === 'M1').checked = true;
  await ui.event('squads', 'change');
  await chatAction(ui, 'make-plan');
  assert.equal(ui.read().state, 'draft');
  assert.equal(ui.readChat().phase, 'blocked');
  assert.equal(
    ui.elements
      .get('chat-actions')
      .querySelector('[data-chat-action="approve"]'),
    null,
  );
  await chatAction(ui, 'show-plan');
  assert.equal(ui.elements.get('inspector').open, true);
  assert.equal(ui.elements.get('plan-view').hidden, false);
  const before = JSON.stringify(ui.read());
  await chat(ui, '承認して進めて');
  assert.equal(JSON.stringify(ui.read()), before);
});

await test('Chat approval still rejects a concurrent Goal replacement', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  await chat(ui, 'AMC01の責任表のみを対象にし、実機・製造は行わない');
  await chat(ui, '全担当と未決事項を証拠付きでレビューしている');
  const replacement = ui.read();
  replacement.instruction += ' 別画面で更新';
  const replacementRaw = JSON.stringify(replacement);
  ui.setStored(replacementRaw);
  const writes = ui.writes();
  const button = ui.elements
    .get('chat-actions')
    .querySelector('[data-chat-action="approve"]');
  assert.ok(button);
  await ui.event('chat-actions', 'click', { target: button });
  assert.match(ui.elements.get('error').textContent, /別の画面/);
  assert.equal(JSON.stringify(ui.read()), replacementRaw);
  assert.equal(ui.read().state, 'draft');
  assert.equal(ui.writes(), writes);
});

await test('Chat restores unfinished scope and criteria without granting approval', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  const coverage = '責任表の確認だけを進め、実機導入は行わない';
  await chat(ui, coverage);
  const draft = JSON.stringify(ui.read());
  const criteriaStep = browser({
    stored: draft,
    chatStored: ui.raw('amc-goal-chat-v1'),
  });
  assert.equal(criteriaStep.readChat().phase, 'criteria');
  assert.equal(criteriaStep.elements.get('coverage').value, coverage);
  assert.equal(criteriaStep.writes(), 0);
  assert.equal(criteriaStep.chatWrites(), 0);
  await chat(criteriaStep, '全ての担当と未決事項をレビューしている');
  const reviewStep = browser({
    stored: draft,
    chatStored: criteriaStep.raw('amc-goal-chat-v1'),
  });
  assert.equal(reviewStep.readChat().phase, 'review');
  assert.equal(
    reviewStep.elements.get('goal-criteria').value,
    '全ての担当と未決事項をレビューしている',
  );
  assert.equal(JSON.stringify(reviewStep.read()), draft);
  assert.equal(reviewStep.writes(), 0);
  await chatAction(reviewStep, 'approve');
  assert.equal(reviewStep.read().state, 'active');
  assert.equal(reviewStep.read().approval.coverageStatement, coverage);
});

await test('Chat storage conflicts preserve the other conversation and never write the Goal', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  const goal = JSON.stringify(ui.read());
  const otherChat = ui.readChat();
  otherChat.messages.push({ role: 'user', text: '別画面からのメモ' });
  const otherRaw = JSON.stringify(otherChat);
  ui.setChatStored(otherRaw);
  const writes = ui.writes();
  const chatWrites = ui.chatWrites();
  await chat(ui, '責任表を進め、実機導入は行わない');
  assert.equal(ui.raw('amc-goal-chat-v1'), otherRaw);
  assert.equal(JSON.stringify(ui.read()), goal);
  assert.equal(ui.writes(), writes);
  assert.equal(ui.chatWrites(), chatWrites);
  assert.match(ui.elements.get('chat-storage-note').textContent, /競合/);
});

await test('Starting a new conversation requires confirmation and retains the current Goal', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  const goal = JSON.stringify(ui.read());
  const conversation = ui.raw('amc-goal-chat-v1');
  const cancelled = browser({
    stored: goal,
    chatStored: conversation,
    confirm: false,
  });
  await cancelled.event('new-goal');
  assert.equal(cancelled.confirmations.length, 1);
  assert.equal(cancelled.raw('amc-goal-chat-v1'), conversation);
  assert.equal(JSON.stringify(cancelled.read()), goal);
  assert.equal(cancelled.writes(), 0);
  assert.equal(cancelled.chatWrites(), 0);
  const accepted = browser({ stored: goal, chatStored: conversation });
  await accepted.event('new-goal');
  assert.equal(accepted.confirmations.length, 1);
  assert.equal(accepted.readChat().phase, 'request');
  assert.equal(
    accepted.readChat().messages.some((message) => message.role === 'user'),
    false,
  );
  assert.equal(JSON.stringify(accepted.read()), goal);
  assert.equal(accepted.writes(), 0);
});

await test('Form edits after chat review require reconfirmation instead of silently approving the earlier scope', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  await chat(ui, '責任表Aのみ、実機導入なし');
  await chat(ui, '担当Aと未決事項の証拠をレビューする');
  const draft = JSON.stringify(ui.read());
  ui.elements.get('coverage').value = '責任表Bのみ、実機導入なし';
  ui.elements.get('goal-criteria').value =
    '担当Bと未決事項の証拠をレビューする';
  const button = ui.elements
    .get('chat-actions')
    .querySelector('[data-chat-action="approve"]');
  await ui.event('chat-actions', 'click', { target: button });
  assert.equal(ui.read().state, 'draft');
  assert.equal(JSON.stringify(ui.read()), draft);
  assert.equal(ui.elements.get('coverage').value, '責任表Bのみ、実機導入なし');
  assert.equal(ui.readChat().phase, 'review');
  assert.ok(ui.readChat().messages.at(-1).text.includes('責任表Bのみ'));
  await chatAction(ui, 'approve');
  assert.equal(ui.read().state, 'active');
  assert.equal(
    ui.read().approval.coverageStatement,
    '責任表Bのみ、実機導入なし',
  );
});

await test('Clearing reviewed form values sends chat back to the missing question without approval', async () => {
  for (const [field, phase] of [
    ['coverage', 'scope'],
    ['goal-criteria', 'criteria'],
  ]) {
    const ui = browser();
    await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
    await chatAction(ui, 'make-plan');
    await chat(ui, '責任表のみ、実機導入なし');
    await chat(ui, '担当と未決事項の証拠をレビューする');
    const before = JSON.stringify(ui.read());
    ui.elements.get(field).value = '';
    await chatAction(ui, 'approve');
    assert.equal(JSON.stringify(ui.read()), before);
    assert.equal(ui.readChat().phase, phase);
    assert.equal(
      ui.elements
        .get('chat-actions')
        .querySelector('[data-chat-action="approve"]'),
      null,
    );
  }
});

await test('Form approval synchronizes the actual accepted scope back to chat and stale chat buttons cannot approve twice', async () => {
  const ui = browser();
  await chat(ui, 'AMCの部隊責任と合格条件を整理したい');
  await chatAction(ui, 'make-plan');
  await chat(ui, '責任表Aのみ、実機導入なし');
  await chat(ui, '担当Aと未決事項の証拠をレビューする');
  const staleButton = ui.elements
    .get('chat-actions')
    .querySelector('[data-chat-action="approve"]');
  const coverage = '責任表Bのみ、実機導入なし';
  const criterion = '担当Bと未決事項の証拠をレビューする';
  ui.elements.get('coverage').value = coverage;
  ui.elements.get('goal-criteria').value = criterion;
  await ui.event('approve');
  assert.equal(ui.elements.get('error').textContent, '');
  assert.equal(ui.read().approval.coverageStatement, coverage);
  assert.equal(ui.readChat().coverage, coverage);
  assert.equal(ui.readChat().criteria, criterion);
  assert.ok(ui.readChat().messages.at(-1).text.includes(coverage));
  assert.ok(ui.readChat().messages.at(-1).text.includes(criterion));
  const before = JSON.stringify(ui.read());
  await ui.event('chat-actions', 'click', { target: staleButton });
  assert.equal(JSON.stringify(ui.read()), before);
});

await test('Request tab opens the simple entry and reviews Goal plus intent without saving', async () => {
  const ui = browser();
  assert.equal(ui.elements.get('mission-board-view').hidden, false);
  assert.equal(ui.elements.get('simple-home').hidden, true);
  await ui.event('request-tab');
  assert.equal(ui.elements.get('simple-home').hidden, false);
  assert.equal(ui.elements.get('simple-review').hidden, true);
  assert.equal(ui.elements.get('simple-progress').hidden, true);
  assert.equal(ui.elements.get('advanced-workbench').open, false);
  const request = 'AMCを、指示するだけで部隊が動くツールにしたい';
  await simpleReview(ui, request);
  assert.equal(ui.elements.get('simple-goal').value, request);
  assert.equal(ui.elements.get('simple-intent').value, '');
  assert.equal(ui.read(), null);
  assert.equal(ui.writes(), 0);
  await ui.event('simple-back');
  assert.equal(ui.elements.get('simple-home').hidden, false);
  assert.equal(ui.elements.get('simple-review').hidden, true);
  assert.equal(ui.elements.get('simple-request').value, request);
  assert.equal(ui.writes(), 0);
});

await test('Simple confirmation creates only a local request-scoped plan and never reports AI work as running', async () => {
  const ui = browser();
  await simpleReview(ui);
  ui.elements.get('simple-goal').value =
    '  メモを保存・検索できるローカルアプリを作る  ';
  await simpleConfirm(ui, '  必要なメモをすぐ見つけたい  ');
  const goal = ui.read();
  assert.equal(goal.schema, 'amc-goal/1');
  assert.deepEqual(goal.requestBrief, {
    schema: 'amc-request-brief/1',
    request: 'メモアプリを作りたい',
    goal: 'メモを保存・検索できるローカルアプリを作る',
    intent: '必要なメモをすぐ見つけたい',
    templateId: 'software-local-prototype-v1',
  });
  assert.deepEqual(
    [...goal.selectedSquadIds].sort((left, right) => left.localeCompare(right)),
    ['REQ-BUILD', 'REQ-DESIGN', 'REQ-LEAD', 'REQ-TEST'],
  );
  assert.equal(goal.tasks.length, 7);
  assert.ok(goal.tasks.every((task) => task.status === 'pending'));
  assert.ok(goal.tasks.every((task) => !task.id.startsWith('AMC01')));
  assert.equal(goal.eventLog.length, 1);
  assert.equal(goal.eventLog[0].type, 'approve_plan');
  assert.equal(
    ui.writes(),
    1,
    'confirmation persists one fully validated approved Goal',
  );
  assert.equal(ui.elements.get('simple-progress').hidden, false);
  assert.match(
    ui.elements.get('simple-progress-state').textContent,
    /AIへの引渡し待ち/,
  );
  assert.ok(
    ui.elements
      .get('simple-goal-title')
      .textContent.includes(goal.requestBrief.goal),
  );
  assert.ok(
    ui.elements
      .get('simple-intent-label')
      .textContent.includes(goal.requestBrief.intent),
  );
  assert.ok(ui.elements.get('simple-metrics').textContent.length > 0);
  assert.ok(ui.elements.get('simple-squads').textContent.length > 0);
  assert.match(ui.elements.get('simple-metrics').textContent, /残作業の仮置き/);
  assert.match(ui.elements.get('simple-metrics').textContent, /人時/);
  assert.match(
    ui.elements.get('simple-boundary').textContent,
    /実測ではない仮係数/,
  );
  assert.match(
    ui.elements.get('simple-boundary').textContent,
    /所要時間・納期・料金ではありません/,
  );
});

await test('The reported Jev cryptocurrency bot request reaches review and explicit confirmation without sending or executing work', async () => {
  const existing = browser();
  await createH1(existing);
  const originalRaw = JSON.stringify(existing.read());
  const ui = browser({ stored: originalRaw });
  const request = 'jevで仮想通貨のbot作成して';
  await simpleReview(ui, request);
  assert.equal(ui.elements.get('simple-goal').value, request);
  assert.equal(ui.elements.get('simple-intent').value, '');
  assert.equal(ui.raw('amc-goal-workbench-v1'), originalRaw);
  assert.equal(ui.writes(), 0);
  assert.equal(ui.networkCalls.length, 0);
  await simpleConfirm(ui, '実資金を動かさず、売買戦略をローカルで検証したい');
  const goal = ui.read();
  assert.equal(goal.requestBrief.request, request);
  assert.equal(goal.requestBrief.goal, request);
  assert.equal(goal.tasks.length, 7);
  assert.ok(goal.tasks.every((task) => task.status === 'pending'));
  assert.deepEqual(
    goal.eventLog.map((event) => event.type),
    ['approve_plan'],
  );
  assert.equal(ui.writes(), 1);
  assert.equal(ui.confirmations.length, 1);
  assert.equal(ui.networkCalls.length, 0);
  assert.equal(ui.copied.length, 0);
  assert.equal(ui.downloads.length, 0);
  assert.match(
    ui.elements.get('simple-progress-state').textContent,
    /AIへの引渡し待ち/,
  );
  assert.match(
    ui.elements.get('simple-boundary').textContent,
    /自動送信.*未接続/,
  );
  assert.match(goal.approval.coverageStatement, /外部送信.*資産移動/);
});

await test('Simple entry rejects unsupported requests and incomplete or oversized confirmation fields without writes', async () => {
  for (const request of [
    'ロケットを製造したい',
    'パンを焼きたい',
    'x'.repeat(8001),
  ]) {
    const ui = browser();
    ui.elements.get('simple-request').value = request;
    await ui.event('simple-request-form', 'submit');
    assert.ok(ui.elements.get('error').textContent);
    assert.equal(ui.elements.get('simple-request').value, request);
    assert.equal(ui.read(), null);
    assert.equal(ui.writes(), 0);
  }
  for (const [goal, intent] of [
    ['', '整理したい'],
    ['メモアプリを作る', '  '],
    ['メモアプリを作る' + 'x'.repeat(8000), '整理したい'],
    ['メモアプリを作る', 'x'.repeat(2001)],
  ]) {
    const ui = browser();
    await simpleReview(ui);
    ui.elements.get('simple-goal').value = goal;
    ui.elements.get('simple-intent').value = intent;
    await ui.event('simple-confirm');
    assert.ok(ui.elements.get('error').textContent);
    assert.equal(ui.read(), null);
    assert.equal(ui.writes(), 0);
    assert.equal(ui.elements.get('simple-review').hidden, false);
  }
  const naturalGoal = browser();
  await simpleReview(
    naturalGoal,
    'AMCを、指示するだけで部隊が動くツールにしたい',
  );
  naturalGoal.elements.get('simple-goal').value =
    '指示すると担当と次の行動がわかる';
  await simpleConfirm(naturalGoal, '部隊の作業を把握し、迷わず次へ進めたい');
  assert.equal(
    naturalGoal.read().requestBrief.goal,
    '指示すると担当と次の行動がわかる',
  );
  assert.ok(
    naturalGoal.read().tasks.every((task) => task.status === 'pending'),
  );
});

await test('Simple review and cancelled confirmation cannot overwrite an existing or unreadable Goal', async () => {
  const existing = browser();
  await createH1(existing);
  await approveH1(existing);
  const before = JSON.stringify(existing.read());
  for (const stored of [before, '{unreadable']) {
    const ui = browser({ stored, confirm: false });
    await simpleReview(ui, 'Webサイトを作る');
    assert.equal(ui.raw('amc-goal-workbench-v1'), stored);
    assert.equal(ui.writes(), 0);
    ui.elements.get('simple-intent').value = '自分の活動を紹介したい';
    await ui.event('simple-confirm');
    assert.equal(ui.confirmations.length, 1);
    assert.equal(ui.raw('amc-goal-workbench-v1'), stored);
    assert.equal(ui.writes(), 0);
  }
});

await test('Simple confirmation rejects a concurrent same-revision Goal replacement', async () => {
  const existing = browser();
  await createH1(existing);
  const ui = browser({ stored: JSON.stringify(existing.read()) });
  await simpleReview(ui);
  const replacement = ui.read();
  replacement.instruction += ' updated elsewhere';
  const raw = JSON.stringify(replacement);
  ui.setStored(raw);
  ui.elements.get('simple-intent').value = '探す時間を減らしたい';
  await ui.event('simple-confirm');
  assert.match(ui.elements.get('error').textContent, /別の画面/);
  assert.equal(ui.raw('amc-goal-workbench-v1'), raw);
  assert.equal(ui.writes(), 0);
});

await test('Simple handoff and details are non-executing, and both old and request-scoped Goal files restore', async () => {
  const ui = browser();
  await simpleReview(ui);
  await simpleConfirm(ui);
  const before = JSON.stringify(ui.read());
  const chatBefore = ui.raw('amc-goal-chat-v1');
  const writes = ui.writes();
  await ui.event('simple-handoff');
  assert.equal(ui.copied.length, 1);
  assert.ok(ui.copied[0].includes('メモ'));
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
  await ui.event('simple-details');
  assert.equal(ui.elements.get('advanced-workbench').open, true);
  assert.equal(ui.elements.get('progress-view').hidden, false);
  assert.equal(JSON.stringify(ui.read()), before);
  await ui.event('new-goal');
  assert.equal(ui.elements.get('simple-home').hidden, false);
  assert.equal(JSON.stringify(ui.read()), before);
  assert.equal(ui.writes(), writes);
  const restored = browser({ stored: before, chatStored: chatBefore });
  await restored.event('request-tab');
  assert.equal(restored.elements.get('simple-progress').hidden, false);
  assert.equal(restored.writes(), 0);
  assert.doesNotMatch(
    restored.elements.get('chat-storage-note').textContent,
    /復元できません/,
  );
  const imported = browser();
  await imported.event('import-file', 'change', {
    target: { files: [{ size: before.length, text: async () => before }] },
  });
  assert.equal(imported.elements.get('error').textContent, '');
  assert.equal(JSON.stringify(imported.read()), before);
  await imported.event('request-tab');
  assert.equal(imported.elements.get('simple-progress').hidden, false);
  const old = browser();
  await createH1(old);
  const oldRestored = browser({ stored: JSON.stringify(old.read()) });
  await oldRestored.event('request-tab');
  assert.equal(oldRestored.elements.get('simple-progress').hidden, false);
  assert.equal(oldRestored.read().state, 'draft');
  assert.match(
    oldRestored.elements.get('simple-squads').innerHTML,
    /0 \/ 6件を検収済み/,
  );
});

await test('Simple request examples do not submit and IME composition cannot submit unfinished input', async () => {
  const ui = browser();
  await ui.event('request-tab');
  await ui.event('simple-example');
  assert.match(ui.elements.get('simple-request').value, /AMC/);
  assert.equal(ui.elements.get('simple-review').hidden, true);
  assert.equal(ui.read(), null);
  await ui.event('simple-request', 'compositionstart');
  await ui.event('simple-request', 'keydown', { key: 'Enter', ctrlKey: true });
  await ui.event('simple-request-form', 'submit', { isComposing: true });
  assert.equal(ui.elements.get('simple-review').hidden, true);
  assert.equal(ui.read(), null);
  await ui.event('simple-request', 'compositionend');
  await ui.event('simple-request', 'keydown', { key: 'Enter', metaKey: true });
  assert.equal(ui.elements.get('simple-review').hidden, false);
  assert.equal(ui.writes(), 0);
});

await test('Simple progress asks for overall acceptance after all tasks are verified, not another AI handoff', async () => {
  const ui = browser();
  await simpleReview(ui);
  await simpleConfirm(ui);
  let goal = ui.read();
  let eventNumber = 0;
  const apply = (event) => {
    goal = applyGoalEvent(goal, {
      id: 'fixture-completion-' + eventNumber++,
      expectedRevision: goal.revision,
      at: '2026-09-27T12:00:00.000Z',
      ...event,
    });
  };
  while (goal.tasks.some((task) => task.status !== 'done')) {
    const taskId = summarizeGoal(goal).readyTaskIds[0];
    assert.ok(taskId, 'fixture must have a next eligible task');
    const task = goal.tasks.find((item) => item.id === taskId);
    apply({ type: 'start_task', taskId, actor: 'fixture-worker' });
    apply({
      type: 'submit_result',
      taskId,
      actor: 'fixture-worker',
      outcome: 'succeeded',
      summary: 'fixture only: accepted task evidence',
      evidence: ['docs/evidence/test-only.json'],
      deliverables: task.deliverables.map(
        (item) => item.path + (item.section ? '#' + item.section : ''),
      ),
    });
    apply({
      type: 'verify_task',
      taskId,
      actor: 'fixture-reviewer',
      role: 'reviewer',
      accepted: true,
      evidence: ['docs/evidence/test-only-review.json'],
      criterionResults: task.acceptanceCriteria.map((criterion) => ({
        criterionId: criterion.id,
        passed: true,
        evidence: ['docs/evidence/test-only-review.json'],
      })),
    });
  }
  const restored = browser({ stored: JSON.stringify(goal) });
  await restored.event('request-tab');
  assert.equal(restored.read().state, 'active');
  assert.match(
    restored.elements.get('simple-progress-state').textContent,
    /全体.*検収/,
  );
  assert.match(
    restored.elements.get('simple-attention').textContent,
    /全体.*検収/,
  );
  assert.doesNotMatch(
    restored.elements.get('simple-progress-state').textContent,
    /引渡し待ち/,
  );
  assert.equal(restored.elements.get('simple-handoff').hidden, true);
  assert.equal(restored.writes(), 0);
});

await test('Simple Goal and intent render untrusted markup as text', async () => {
  const ui = browser();
  const request = 'メモアプリを作る <img src=x onerror="alert(1)">';
  const intent = '探す時間を減らしたい <script>bad()</script>';
  await simpleReview(ui, request);
  await simpleConfirm(ui, intent);
  const title = ui.elements.get('simple-goal-title');
  const label = ui.elements.get('simple-intent-label');
  assert.ok(title.textContent.includes('<img'));
  assert.ok(label.textContent.includes('<script>'));
  assert.equal(title.querySelectorAll('img').length, 0);
  assert.equal(label.querySelectorAll('script').length, 0);
});

await test('The default board shows the canonical 32 squads and O2 AI04 without creating a Goal', () => {
  const ui = browser();
  assert.equal(ui.elements.get('mission-board-view').hidden, false);
  assert.equal(
    ui.elements.get('board-tab').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    ui.elements.get('request-tab').getAttribute('aria-pressed'),
    'false',
  );
  for (const id of [
    'simple-home',
    'simple-review',
    'simple-progress',
    'advanced-workbench',
  ])
    assert.equal(
      ui.elements.get(id).hidden,
      true,
      id + ' is outside the board',
    );
  const squads = ui.elements
    .get('amc-divisions')
    .querySelectorAll('[data-squad]');
  assert.equal(squads.length, 32);
  assert.deepEqual(
    new Set(squads.map((button) => button.dataset.squad)),
    new Set(sources.mission.squads.map((squad) => squad.id)),
  );
  assert.match(ui.elements.get('amc-selected-line').textContent, /^O2 /);
  assert.equal(ui.elements.get('amc-task-select').value, 'AI04');
  assert.match(ui.elements.get('amc-task').innerHTML, /AI04/);
  assert.match(ui.elements.get('amc-task').innerHTML, /進め方/);
  assert.match(ui.elements.get('amc-task').innerHTML, /合格条件/);
  assert.match(
    ui.elements.get('amc-counts').textContent,
    new RegExp('^' + sources.project.tasks.length + '登録レコード'),
  );
  assert.match(
    ui.elements.get('amc-snapshot').textContent,
    /手動更新・自動同期なし/,
  );
  assert.equal(ui.read(), null);
  assert.equal(ui.writes(), 0);
  assert.equal(ui.networkCalls.length, 0);
});

await test('Board squad, cross-squad dependency and child selections navigate independently of the Goal ledger', async () => {
  const existing = browser();
  await simpleReview(existing);
  await simpleConfirm(existing);
  const goalRaw = JSON.stringify(existing.read());
  const ui = browser({ stored: goalRaw });
  const board = ui.elements.get('amc-task-dashboard');
  const select = async (selector, container = board) => {
    const target = container.querySelector(selector);
    assert.ok(target, 'expected board navigation button: ' + selector);
    await ui.event('amc-task-dashboard', 'click', { target });
  };
  await select('[data-squad="P4"]');
  assert.match(ui.elements.get('amc-selected-line').textContent, /^P4 /);
  assert.equal(ui.elements.get('amc-task-select').value, 'PRO04');
  await select('[data-task="PRO01"]', ui.elements.get('amc-task'));
  assert.match(ui.elements.get('amc-selected-line').textContent, /^P1 /);
  assert.equal(ui.elements.get('amc-task-select').value, 'PRO01');
  await select('[data-task="PRO01-01"]', ui.elements.get('amc-task'));
  assert.equal(ui.elements.get('amc-task-select').value, 'PRO01-01');
  assert.deepEqual(ui.readSelection(), {
    selectedUnit: 'P1',
    selectedTask: 'PRO01-01',
  });
  assert.equal(ui.selectionWrites(), 3);
  await select('[data-task="PRO01"]', ui.elements.get('amc-task'));
  assert.equal(ui.elements.get('amc-task-select').value, 'PRO01');
  await ui.event('amc-task-select', 'change', {
    target: { value: 'PRO01-02' },
  });
  assert.equal(ui.readSelection().selectedTask, 'PRO01-02');
  const selectionRaw = ui.raw('amc-mission-selection-v1');
  await ui.event('amc-task-select', 'change', {
    target: { value: 'unknown-task' },
  });
  assert.equal(ui.raw('amc-mission-selection-v1'), selectionRaw);
  assert.equal(ui.raw('amc-goal-workbench-v1'), goalRaw);
  assert.equal(ui.writes(), 0);
  assert.equal(
    ui.read().tasks.length,
    7,
    'request-scoped plan remains separate from canonical records',
  );
  assert.ok(ui.read().tasks.every((task) => task.status === 'pending'));
  assert.equal(ui.networkCalls.length, 0);
});

await test('Board selection restores only known squad and task pairs and ignores malformed presentation storage', () => {
  const selection = JSON.stringify({
    selectedUnit: 'M1',
    selectedTask: 'MINI01-03',
  });
  const restored = browser({ selectionStored: selection });
  assert.match(restored.elements.get('amc-selected-line').textContent, /^M1 /);
  assert.equal(restored.elements.get('amc-task-select').value, 'MINI01-03');
  assert.equal(restored.selectionWrites(), 0);
  assert.equal(restored.writes(), 0);
  for (const selectionStored of [
    '{invalid',
    'x'.repeat(8193),
    JSON.stringify({ selectedUnit: '__proto__', selectedTask: 'AI04' }),
  ]) {
    const ui = browser({ selectionStored });
    assert.match(ui.elements.get('amc-selected-line').textContent, /^O2 /);
    assert.equal(ui.elements.get('amc-task-select').value, 'AI04');
    assert.equal(ui.writes(), 0);
  }
  const mismatched = browser({
    selectionStored: JSON.stringify({
      selectedUnit: 'O2',
      selectedTask: 'PRO04',
    }),
  });
  assert.match(
    mismatched.elements.get('amc-selected-line').textContent,
    /^O2 /,
  );
  assert.equal(mismatched.elements.get('amc-task-select').value, 'AI04');
});

await test('Board and request tabs retain the saved Goal, and a new request does not overwrite it', async () => {
  const source = browser();
  await simpleReview(source);
  await simpleConfirm(source);
  const raw = JSON.stringify(source.read());
  const ui = browser({ stored: raw });
  assert.equal(ui.elements.get('mission-board-view').hidden, false);
  await ui.event('request-tab');
  assert.equal(ui.elements.get('mission-board-view').hidden, true);
  assert.equal(ui.elements.get('simple-progress').hidden, false);
  assert.equal(
    ui.elements.get('request-tab').getAttribute('aria-pressed'),
    'true',
  );
  await ui.event('simple-details');
  assert.equal(ui.elements.get('advanced-workbench').open, true);
  await ui.event('board-tab');
  assert.equal(ui.elements.get('mission-board-view').hidden, false);
  for (const id of [
    'simple-home',
    'simple-review',
    'simple-progress',
    'advanced-workbench',
  ])
    assert.equal(ui.elements.get(id).hidden, true);
  await ui.event('request-tab');
  assert.equal(ui.elements.get('simple-progress').hidden, false);
  await ui.event('board-tab');
  await ui.event('new-goal');
  assert.equal(ui.elements.get('mission-board-view').hidden, true);
  assert.equal(ui.elements.get('simple-home').hidden, false);
  assert.equal(ui.raw('amc-goal-workbench-v1'), raw);
  assert.equal(ui.writes(), 0);
});

await test('New request from the board protects unfinished request and brief fields until discard is confirmed', async () => {
  const source = browser();
  await createH1(source);
  await approveH1(source);
  const savedGoal = JSON.stringify(source.read());
  for (const stage of ['input', 'review']) {
    for (const confirm of [false, true]) {
      const ui = browser({ stored: savedGoal, confirm });
      await ui.event('new-goal');
      ui.elements.get('simple-request').value = 'メモアプリを作りたい';
      if (stage === 'review') {
        await ui.event('simple-request-form', 'submit');
        ui.elements.get('simple-goal').value = '保存したメモを検索できる';
        ui.elements.get('simple-intent').value = '調べ直す時間を減らしたい';
      }
      const fields = ['simple-request', 'simple-goal', 'simple-intent'];
      const values = fields.map((id) => ui.elements.get(id).value);
      const chatBefore = ui.raw('amc-goal-chat-v1');
      await ui.event('board-tab');
      await ui.event('new-goal');
      assert.equal(ui.confirmations.length, 1, stage);
      assert.match(ui.confirmations[0], /入力途中.*破棄/);
      assert.equal(ui.raw('amc-goal-workbench-v1'), savedGoal);
      assert.equal(ui.writes(), 0);
      if (confirm) {
        assert.equal(ui.elements.get('mission-board-view').hidden, true);
        assert.equal(ui.elements.get('simple-home').hidden, false);
        assert.equal(ui.elements.get('simple-review').hidden, true);
        assert.deepEqual(
          fields.map((id) => ui.elements.get(id).value),
          ['', '', ''],
        );
      } else {
        assert.equal(ui.elements.get('mission-board-view').hidden, false);
        assert.deepEqual(
          fields.map((id) => ui.elements.get(id).value),
          values,
        );
        assert.equal(ui.raw('amc-goal-chat-v1'), chatBefore);
        await ui.event('request-tab');
        assert.equal(
          ui.elements.get(stage === 'review' ? 'simple-review' : 'simple-home')
            .hidden,
          false,
        );
        assert.deepEqual(
          fields.map((id) => ui.elements.get(id).value),
          values,
        );
      }
    }
  }
});
