const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createCoordinator } = require('./coordinator.cjs');
const ORIGIN = 'http://127.0.0.1:3107';
const hash = text => createHash('sha256').update(text).digest('hex');
function activate(context) {
  if (!vscode.workspace.isTrusted) return;
  const output = vscode.window.createOutputChannel('Noah 保存時リファクタ'); context.subscriptions.push(output);
  let config = context.workspaceState.get('saveRefactor'), scope, applying, coordinator;
  const report = text => output.appendLine(new Date().toISOString() + ' ' + text);
  async function api(route, body, signal) {
    const response = await fetch(ORIGIN + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(scope ? { 'X-Rock-Owner-Scope': scope } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || 'Noahへ接続できません。'), { status: response.status });
    if (scope && value.ownerScope !== scope) throw new Error('Noahの本人が変わりました。接続し直してください。');
    return value;
  }
  const route = suffix => `/__noah/save-refactor/${config.id}${suffix || ''}`;
  async function safeFile(relative) {
    const root = await fs.realpath(config.root), file = await fs.realpath(path.join(root, relative));
    if (!file.startsWith(root + path.sep) || relative.split(/[\\/]/).some(p => !p || p.startsWith('.'))) throw new Error('対象フォルダの外や隠しファイルは使えません。');
    return file;
  }
  async function register() {
    const owner = await (await fetch(ORIGIN + '/api/noah/catalog/owner', { signal: AbortSignal.timeout(15000) })).json();
    if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(owner.ownerScope)) throw new Error('このMacのNoahへ接続してください。');
    scope = owner.ownerScope;
    await safeFile(config.target); await safeFile(config.test);
    await api('/__noah/save-refactor', { id: config.id, label: config.label, target: config.target, test: config.test });
    coordinator = createCoordinator({
      policy: async () => (await api(route())).session,
      unchanged: async snapshot => {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === snapshot.uri);
        return Boolean(doc && !doc.isDirty && doc.version === snapshot.version && doc.getText() === snapshot.text && await fs.readFile(await safeFile(config.test), 'utf8') === snapshot.testText);
      },
      validate: async (snapshot, text, generation, signal) => {
        // A cancelled earlier check may still be releasing its container. Only
        // an explicit busy rejection can be retried; ambiguous failures cannot.
        const body = { generation, snapshot: { target: config.target, test: config.test, files: [{ name: config.target, content: text }, { name: config.test, content: snapshot.testText }] } };
        for (let attempt = 0; ; attempt++) {
          signal.throwIfAborted();
          try { return (await api(route('/validate'), body, signal)).validation; }
          catch (error) { if (error.status !== 429 || attempt >= 9) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
        }
      },
      run: async (snapshot, generation, signal) => {
        const id = randomUUID();
        const prompt = `Refactor the source below for clarity and remove duplication while preserving exports and behavior. Do not edit tests. Save the complete revised source (no Markdown fences) to /workspace/refactored.txt. Use your file tool.\nSOURCE (${config.target}):\n${snapshot.text}\nFIXED TEST (${config.test}):\n${snapshot.testText}`;
        if (Buffer.byteLength(prompt) > 12000) throw new Error('この実行器の入力上限を超えています。小さい対象を指定してください。');
        try {
          await api(route('/execute'), { id, prompt, generation }, signal);
          const deadline = Date.now() + 270000;
          while (Date.now() < deadline) {
            signal.throwIfAborted();
            const state = (await api(route(), undefined, signal)).session;
            if (!state.enabled || state.generation !== generation) throw new Error('Noahで運用を停止しました。');
            const job = (await api('/__noah/executions/' + id, undefined, signal)).job;
            const execution = job.noahExecution;
            if (!['queued', 'running'].includes(execution.state)) {
              if (execution.state !== 'returned' || execution.result?.exitCode !== 0) throw new Error(execution.error || 'Agentが修正を返しませんでした。');
              const file = execution.result.files.find(f => f.name === 'refactored.txt');
              if (!file) throw new Error('修正ファイルがありません。');
              const bytes = Buffer.from(file.base64, 'base64');
              if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes || bytes.length > 16384) throw new Error('修正ファイルを照合できません。');
              return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), workId: id };
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          throw new Error('実行結果が時間内に届きませんでした。');
        } catch (error) { await api('/__noah/executions/' + id + '/stop', {}).catch(() => {}); throw error; }
      },
      apply: async (snapshot, result, generation) => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === snapshot.uri);
        if (!editor || editor.document.isDirty || editor.document.version !== snapshot.version) return false;
        if (!context.storageUri) throw new Error('復元データの保存先がありません。');
        await fs.mkdir(context.storageUri.fsPath, { recursive: true });
        if ((await fs.readdir(context.storageUri.fsPath)).filter(name => /^refactor-[a-f0-9-]+\.json$/.test(name)).length >= 100) throw new Error('復元データが100件に達しました。整理してから再開してください。');
        const backupName = 'refactor-' + result.workId + '.json';
        const backup = { target: config.target, before: snapshot.text, afterSha256: hash(result.text), workId: result.workId };
        await fs.writeFile(path.join(context.storageUri.fsPath, backupName), JSON.stringify(backup), { mode: 0o600 });
        const finalPolicy = (await api(route())).session;
        if (!finalPolicy.enabled || finalPolicy.generation !== generation || editor.document.isDirty || editor.document.version !== snapshot.version) return false;
        applying = { uri: snapshot.uri, expected: result.text };
        try {
          const end = editor.document.positionAt(editor.document.getText().length);
          const edited = await editor.edit(edit => edit.replace(new vscode.Range(new vscode.Position(0, 0), end), result.text), { undoStopBefore: true, undoStopAfter: true });
          if (!edited || editor.document.getText() !== result.text || editor.document.version !== snapshot.version + 1) return false;
          const saved = await editor.document.save();
          if (saved) await context.workspaceState.update('lastRefactorBackup', backupName);
          return saved;
        } finally { applying = undefined; }
      }, report,
    });
    report('接続済み。Noahの保存時運用画面で対象を確認して開始してください。');
  }
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (!config || event.document.uri.scheme !== 'file' || path.relative(config.root, event.document.uri.fsPath) !== config.target) return;
    if (applying?.uri === event.document.uri.toString() && event.document.getText() === applying.expected) return;
    coordinator?.invalidate();
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
    if (!config || !coordinator || document.uri.scheme !== 'file' || path.relative(config.root, document.uri.fsPath) !== config.target || applying?.uri === document.uri.toString()) return;
    const snapshot = { uri: document.uri.toString(), version: document.version, text: document.getText() };
    void (async () => { await safeFile(config.target); snapshot.testText = await fs.readFile(await safeFile(config.test), 'utf8'); if (document.version !== snapshot.version || document.isDirty) return; await coordinator.saved(snapshot); })().catch(error => report(error.message));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('noah.saveRefactor.connect', async () => {
    try {
      const doc = vscode.window.activeTextEditor?.document, folder = doc && vscode.workspace.getWorkspaceFolder(doc.uri);
      if (!doc || doc.uri.scheme !== 'file' || !folder || doc.isDirty) throw new Error('対象コードを保存して、ワークスペース内で開いてください。');
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: '対応する .test.mjs を選ぶ', defaultUri: folder.uri, filters: { 'Node test': ['mjs'] } });
      if (!selected?.[0]) return;
      coordinator?.invalidate();
      if (config && scope) await api(route('/stop'), {}).catch(() => {});
      config = { id: randomUUID(), root: folder.uri.fsPath, label: folder.name, target: path.relative(folder.uri.fsPath, doc.uri.fsPath), test: path.relative(folder.uri.fsPath, selected[0].fsPath) };
      await register(); await context.workspaceState.update('saveRefactor', config); await vscode.env.openExternal(vscode.Uri.parse(ORIGIN + '/noah/code'));
    } catch (error) { void vscode.window.showErrorMessage(error.message); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('noah.saveRefactor.open', () => vscode.env.openExternal(vscode.Uri.parse(ORIGIN + '/noah/code'))));
  context.subscriptions.push(vscode.commands.registerCommand('noah.saveRefactor.stop', async () => { coordinator?.invalidate(); if (config && scope) await api(route('/stop'), {}).catch(error => report(error.message)); }));
  context.subscriptions.push(vscode.commands.registerCommand('noah.saveRefactor.restore', async () => {
    try {
      if (!context.storageUri || !config) return;
      coordinator?.invalidate(); await api(route('/stop'), {});
      const backupName = context.workspaceState.get('lastRefactorBackup');
      if (!backupName || !/^refactor-[a-f0-9-]+\.json$/.test(backupName)) throw new Error('復元対象がありません。');
      const backup = JSON.parse(await fs.readFile(path.join(context.storageUri.fsPath, backupName), 'utf8'));
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.isDirty || path.relative(config.root, editor.document.uri.fsPath) !== backup.target || hash(editor.document.getText()) !== backup.afterSha256) throw new Error('復元対象の編集版が変わっています。上書きしません。');
      applying = { uri: editor.document.uri.toString(), expected: backup.before };
      try { const ok = await editor.edit(edit => edit.replace(new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(editor.document.getText().length)), backup.before)); if (ok && editor.document.getText() === backup.before) await editor.document.save(); }
      finally { applying = undefined; }
    } catch (error) { void vscode.window.showErrorMessage(error.message); }
  }));
  const heartbeat = setInterval(() => { if (config && scope) void api(route('/heartbeat'), {}).then(data => { if (!data.session.enabled) coordinator?.invalidate(); }).catch(error => { coordinator?.invalidate(); report(error.message); }); }, 5000);
  context.subscriptions.push({ dispose() { clearInterval(heartbeat); coordinator?.invalidate(); } });
  if (config) void register().catch(error => report(error.message));
}
module.exports = { activate };
