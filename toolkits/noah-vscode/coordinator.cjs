// Pure save-event coordination; filesystem/editor/API effects are injected.
function createCoordinator({ policy, validate, run, unchanged, apply, report }) {
  let revision = 0, pending, running = false, controller;
  const invalidate = () => { revision++; pending = undefined; controller?.abort(); };
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const snapshot = pending; pending = undefined;
        const expected = revision; controller = new AbortController(); const signal = controller.signal;
        const current = async generation => {
          if (signal.aborted || revision !== expected || !(await unchanged(snapshot))) throw new Error('編集内容が変わったため、反映しませんでした。');
          const state = await policy();
          if (!state.enabled || state.connected === false || (generation && state.generation !== generation)) throw new Error('運用が停止または変更されました。');
          return state.generation;
        };
        try {
          const generation = await current();
          const baseline = await validate(snapshot, snapshot.text, generation, signal);
          if (!baseline.passed) throw new Error('元コードの検証が通りません: ' + baseline.output);
          await current(generation);
          const result = await run(snapshot, generation, signal);
          await current(generation);
          if (result.text === snapshot.text) { report('変更なし'); continue; }
          const check = await validate(snapshot, result.text, generation, signal);
          if (!check.passed) throw new Error('修正後の検証が通りません。元ファイルを保持しました: ' + check.output);
          await current(generation);
          if (!(await apply(snapshot, result, generation))) throw new Error('編集版が変わったため、反映しませんでした。');
          report('リファクタを保存しました。指定した型・テストの範囲で検証済みです。');
        } catch (error) { report(signal.aborted ? '処理を停止しました。' : error.message); }
      }
    } finally { running = false; controller = undefined; }
  }
  return { saved(snapshot) { revision++; pending = snapshot; controller?.abort(); return drain(); }, invalidate, get running() { return running; } };
}
module.exports = { createCoordinator };
