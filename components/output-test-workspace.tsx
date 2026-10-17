'use client';

import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  Play,
  RotateCcw,
} from 'lucide-react';
import OSHeader from './os-header';
import {
  sampleValues,
  testModeLabels,
  testScenarios,
  type TestResult,
  type TestScenario,
} from '../lib/test-workspace';
import styles from './output-test-workspace.module.css';

export default function OutputTestWorkspace() {
  const [selected, setSelected] = useState(testScenarios[0].id);
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>(
    () => Object.fromEntries(testScenarios.map((s) => [s.id, sampleValues(s)])),
  );
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const scenario = testScenarios.find((s) => s.id === selected)!;
  const result = results[selected];
  const finished = Object.keys(results).length;

  async function run(item: TestScenario, values: Record<string, string>) {
    try {
      const response = await fetch('/api/output-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, values }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json()) as {
        result?: TestResult;
        error?: string;
      };
      if (!response.ok || !body.result)
        throw new Error(body.error || 'テストに失敗しました。');
      setResults((old) => ({ ...old, [item.id]: body.result! }));
      setErrors((old) => {
        const next = { ...old };
        delete next[item.id];
        return next;
      });
    } catch (error) {
      setResults((old) => {
        const next = { ...old };
        delete next[item.id];
        return next;
      });
      setErrors((old) => ({
        ...old,
        [item.id]:
          error instanceof Error ? error.message : '再実行してください。',
      }));
    }
  }
  async function execute(all = false) {
    if (busy) return;
    setBusy(all ? 'all' : selected);
    setMessage('');
    try {
      if (all) {
        // Each test has its own sample input; one failure does not hide the others.
        setInputs(
          Object.fromEntries(testScenarios.map((s) => [s.id, sampleValues(s)])),
        );
        for (const item of testScenarios) await run(item, sampleValues(item));
      } else await run(scenario, inputs[selected]);
    } finally {
      setBusy('');
    }
  }
  function edit(key: string, value: string) {
    setInputs((old) => ({
      ...old,
      [selected]: { ...old[selected], [key]: value },
    }));
    setResults((old) => {
      const next = { ...old };
      delete next[selected];
      return next;
    });
    setErrors((old) => {
      const next = { ...old };
      delete next[selected];
      return next;
    });
    setMessage('');
  }
  function download(all = false) {
    const text = all
      ? JSON.stringify(
          { mode: 'isolated_output_test', results, errors },
          null,
          2,
        )
      : result?.output;
    if (!text) return;
    const blob = new Blob([text], {
      type: all
        ? 'application/json'
        : result?.format === 'csv'
          ? 'text/csv;charset=utf-8'
          : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = all
      ? 'rockstar-test-results.json'
      : `test-${selected}.${result?.format || 'txt'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={styles.page}>
      <OSHeader title="出力テスト" running={!!busy} />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>ROCKSTAROS / TEST WORKSPACE</p>
            <h1>まず、動かしてみる。</h1>
            <p className={styles.lead}>
              登録なしで、入力から出力まで。
              <br />
              実処理・模擬データ・接続待ちを、一つずつ確認。
            </p>
          </div>
          <div className={styles.heroActions}>
            <button
              className={styles.primary}
              disabled={!!busy}
              onClick={() => void execute(true)}
            >
              <Play size={16} />
              {busy === 'all' ? '一括テスト中…' : 'サンプルを全部実行'}
            </button>
            <span>
              入力をサンプルに戻して全{testScenarios.length}項目を確認
            </span>
          </div>
        </section>
        <div className={styles.notice}>
          入力はこのサイトの処理サーバーに送信します。テスト用の文章を使ってください。アプリのDBには保存せず、画面を閉じると結果は消えます。課金・送金・外部投稿は発生しません。
        </div>
        <div className={styles.overview} aria-live="polite">
          <span>
            {finished} / {testScenarios.length} 確認済み
          </span>
          <span>
            {testScenarios.filter((s) => s.mode === 'local').length} 実処理
          </span>
          <span>
            {testScenarios.filter((s) => s.mode === 'simulation').length}{' '}
            模擬データ
          </span>
          <span>
            {testScenarios.filter((s) => s.mode === 'unconnected').length}{' '}
            接続待ち
          </span>
          {Object.keys(errors).length > 0 && (
            <span>{Object.keys(errors).length} エラー</span>
          )}
        </div>
        <div className={styles.workspace}>
          <nav className={styles.tools} aria-label="出力テストの機能">
            {testScenarios.map((item, index) => (
              <button
                key={item.id}
                disabled={!!busy}
                aria-pressed={selected === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setMessage('');
                }}
              >
                <span className={styles.index}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {testModeLabels[item.mode]}
                    {errors[item.id]
                      ? ' · 要確認'
                      : results[item.id]
                        ? ' · 確認済み'
                        : ''}
                  </small>
                </span>
                {results[item.id] && <Check size={14} />}
              </button>
            ))}
          </nav>
          <section className={styles.editor} aria-label={scenario.name}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.badge}>
                  {testModeLabels[scenario.mode]}
                </span>
                <h2>{scenario.name}</h2>
              </div>
              <span className={styles.version}>OUTPUT TEST / 01</span>
            </div>
            <p className={styles.scope}>{scenario.scope}</p>
            <div className={styles.panes}>
              <div className={styles.inputPane}>
                <h3>入力</h3>
                <fieldset disabled={!!busy}>
                  {scenario.fields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.multiline ? (
                        <textarea
                          value={inputs[selected][field.key]}
                          onChange={(e) => edit(field.key, e.target.value)}
                          maxLength={12000}
                          rows={7}
                        />
                      ) : (
                        <input
                          value={inputs[selected][field.key]}
                          onChange={(e) => edit(field.key, e.target.value)}
                          maxLength={12000}
                        />
                      )}
                    </label>
                  ))}
                  <button
                    className={styles.primary}
                    onClick={() => void execute()}
                  >
                    <Play size={15} />
                    {busy === selected
                      ? '確認中…'
                      : scenario.mode === 'unconnected'
                        ? '接続状態を確認'
                        : 'この入力で実行'}
                  </button>
                </fieldset>
              </div>
              <div className={styles.outputPane}>
                <div className={styles.outputTitle}>
                  <h3>出力</h3>
                  {result && (
                    <span>
                      {result.status === 'not_run'
                        ? '未実行'
                        : testModeLabels[result.mode]}
                    </span>
                  )}
                </div>
                {errors[selected] && (
                  <p role="alert" className={styles.error}>
                    {errors[selected]}
                  </p>
                )}
                {result ? (
                  <>
                    <pre className={styles.output}>{result.output}</pre>
                    {result.details !== undefined && (
                      <details>
                        <summary>処理の詳細</summary>
                        <pre className={styles.details}>
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      </details>
                    )}
                    <div className={styles.actions}>
                      <button
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(result.output)
                            .then(() => setMessage('コピーしました'))
                            .catch(() =>
                              setMessage(
                                'コピーできませんでした。保存を使ってください。',
                              ),
                            );
                        }}
                      >
                        <Copy size={14} />
                        コピー
                      </button>
                      <button onClick={() => download()}>
                        <Download size={14} />
                        保存
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.empty}>
                    <ArrowUpRight size={25} />
                    <p>
                      入力を変えて実行すると、
                      <br />
                      ここに結果が出ます。
                    </p>
                  </div>
                )}
                <output className={styles.feedback}>
                  {message}
                </output>
              </div>
            </div>
          </section>
        </div>
        <footer className={styles.footer}>
          <p>
            テスト結果は通常の仕事・収益・利用実績に入りません。クラウドAIの生成には別途接続が必要です。
          </p>
          <div className={styles.actions}>
            <button
              disabled={!finished || !!busy}
              onClick={() => download(true)}
            >
              <Download size={15} />
              全結果を保存
            </button>
            <button
              disabled={!!busy}
              onClick={() => {
                setResults({});
                setErrors({});
                setInputs(
                  Object.fromEntries(
                    testScenarios.map((s) => [s.id, sampleValues(s)]),
                  ),
                );
                setMessage('テスト入力と結果を消去しました');
              }}
            >
              <RotateCcw size={15} />
              リセット
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
