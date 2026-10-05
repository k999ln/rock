'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Check, Plus } from 'lucide-react';
import skyTasks from '@/data/amc/sky-quick-checklist.json';
import styles from './amc-quick-board.module.css';

type Status = 'todo' | 'doing' | 'done';
type Task = {
  id: string;
  title: string;
  owner: string;
  note: string;
  status: Status;
};
type Board = { id: string; title: string; tasks: Task[] };
type Draft = { version: 1; selectedId: string; boards: Board[]; input: string };
const key = 'zema.amc.tab-checklists.v1';
const empty: Draft = { version: 1, selectedId: '', boards: [], input: '' };
const labels: Record<Status, string> = {
  todo: '未着手',
  doing: '作業中',
  done: '完了',
};
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Draft;
  return (
    d.version === 1 &&
    typeof d.input === 'string' &&
    typeof d.selectedId === 'string' &&
    Array.isArray(d.boards) &&
    d.boards.length <= 30 &&
    new Set(d.boards.map((b) => b?.id)).size === d.boards.length &&
    d.boards.every(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        typeof b.title === 'string' &&
        Array.isArray(b.tasks) &&
        b.tasks.length <= 100 &&
        new Set(b.tasks.map((t) => t?.id)).size === b.tasks.length &&
        b.tasks.every(
          (t) =>
            t &&
            typeof t.id === 'string' &&
            typeof t.title === 'string' &&
            typeof t.owner === 'string' &&
            typeof t.note === 'string' &&
            ['todo', 'doing', 'done'].includes(t.status),
        ),
    ) &&
    (d.selectedId === '' || d.boards.some((b) => b.id === d.selectedId))
  );
}
export default function AmcQuickBoard() {
  const [draft, setDraft] = useState<Draft>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // Hydrate tab-only data after the server-rendered shell is mounted.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (!validDraft(parsed)) throw new Error('invalid');
          setDraft(parsed);
          setSaved(true);
        }
      } catch {
        setError(
          'このタブの保存データを読み込めませんでした。保存済みGoalは「詳細管理」から確認できます。',
        );
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  function store(next: Draft) {
    setDraft(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
      setSaved(true);
      setError('');
    } catch {
      setSaved(false);
      setError(
        'このタブに保存できません。画面を閉じる前に「書き出す」で控えてください。',
      );
    }
  }
  const board = draft.boards.find((b) => b.id === draft.selectedId);
  const completed = board?.tasks.filter((t) => t.status === 'done').length ?? 0;
  const doing = board?.tasks.filter((t) => t.status === 'doing').length ?? 0;
  function create(
    title: string,
    tasks: Task[],
    id: string = crypto.randomUUID(),
  ) {
    if (draft.boards.some((b) => b.id === id)) {
      store({ ...draft, selectedId: id });
      return;
    }
    if (draft.boards.length >= 30) {
      setError(
        'このタブでは30件まで管理できます。書き出した一覧は別に保管できます。',
      );
      return;
    }
    store({
      ...draft,
      input: '',
      selectedId: id,
      boards: [...draft.boards, { id, title, tasks }],
    });
  }
  function organize(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const titles = draft.input
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*(?:[-*・]|\d+[.)、])\s*/, '').trim())
      .filter(Boolean);
    if (!titles.length) {
      setError('やることを1つ以上書いてください。');
      return;
    }
    if (titles.length > 100) {
      setError('1つの仕事に100項目まで追加できます。');
      return;
    }
    create(
      titles[0].slice(0, 80),
      titles.map((title) => ({
        id: crypto.randomUUID(),
        title,
        owner: '',
        note: '',
        status: 'todo',
      })),
    );
  }
  function updateBoard(next: Board) {
    store({
      ...draft,
      boards: draft.boards.map((b) => (b.id === next.id ? next : b)),
    });
  }
  function updateTask(id: string, changes: Partial<Task>) {
    if (board)
      updateBoard({
        ...board,
        tasks: board.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
      });
  }
  const exportText = board
    ? [
        board.title,
        '',
        ...board.tasks.map(
          (t) =>
            `[${labels[t.status]}] ${t.title}${t.owner ? ` / 担当：${t.owner}` : ''}${t.note ? `\n${t.note}` : ''}`,
        ),
      ].join('\n\n')
    : draft.input;
  function exportBoard() {
    const url = URL.createObjectURL(
      new Blob([exportText], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amc-work.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.root} aria-label="AMC 業務の整理">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>AMC / WORK ORGANIZER</p>
          <h1>仕事を、シンプルに。</h1>
          <p className={styles.intro}>やることを並べて、進めて、終わらせる。</p>
        </div>
        <output className={styles.storage}>
          {!ready
            ? '読み込み中'
            : saved
              ? 'このタブに保存済み'
              : 'ログインなしで始められます'}
        </output>
      </header>
      <p className={styles.storageNote}>
        このタブだけの作業メモです。再読込しても残ります。閉じる前に書き出してください。
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {draft.boards.length > 0 && (
        <nav className={styles.boards} aria-label="作業メモの一覧">
          {draft.boards.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === draft.selectedId}
              onClick={() => {
                store({ ...draft, selectedId: b.id });
                setNewTask('');
              }}
            >
              {b.title}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={!board}
            onClick={() => {
              store({ ...draft, selectedId: '' });
              setNewTask('');
            }}
          >
            <Plus size={15} />
            別の仕事
          </button>
        </nav>
      )}
      {!board ? (
        <div className={styles.composer}>
          <form onSubmit={organize}>
            <label htmlFor="amc-quick-input">何を進めますか？</label>
            <textarea
              id="amc-quick-input"
              value={draft.input}
              onChange={(e) => store({ ...draft, input: e.target.value })}
              rows={5}
              maxLength={16000}
              disabled={!ready}
              placeholder={
                '請求書を確認する\n見積もりを送る\n来週の予定をまとめる'
              }
            />
            <div className={styles.formFoot}>
              <small>1行に1件。まとめて貼り付けできます。</small>
              <button
                className={styles.primary}
                disabled={!ready || !draft.input.trim()}
                type="submit"
              >
                一覧にする <ArrowRight size={17} />
              </button>
            </div>
          </form>
          <div className={styles.templates}>
            <span>すぐに使う</span>
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                create(
                  'Skyの残作業',
                  skyTasks.map((t) => ({
                    ...t,
                    owner: '',
                    status: 'todo' as Status,
                  })),
                  'sky-remaining-checklist',
                )
              }
            >
              Skyの残作業 <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : (
        <section className={styles.board} aria-label="作業一覧">
          <div className={styles.boardHeading}>
            <input
              aria-label="仕事の名前"
              value={board.title}
              maxLength={120}
              onChange={(e) => updateBoard({ ...board, title: e.target.value })}
            />
            <button type="button" onClick={() => setExportOpen(!exportOpen)}>
              <ArrowDownToLine size={15} />
              書き出す
            </button>
          </div>
          <div className={styles.progress}>
            <span>
              <Check size={15} />
              {completed} / {board.tasks.length} 完了
            </span>
            <span>{doing} 作業中</span>
            <span>{board.tasks.length - completed - doing} 未着手</span>
          </div>
          <progress
            className={styles.progressTrack}
            aria-label="手動チェックの完了数"
            max={board.tasks.length}
            value={completed}
          />
          <ol className={styles.tasks}>
            {board.tasks.map((task, index) => (
              <li key={task.id} data-status={task.status}>
                <span className={styles.number}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className={styles.taskBody}>
                  <textarea
                    rows={1}
                    className={styles.taskTitle}
                    aria-label={`作業${index + 1}`}
                    value={task.title}
                    maxLength={2000}
                    onChange={(e) =>
                      updateTask(task.id, { title: e.target.value })
                    }
                  />
                  <details>
                    <summary>担当・メモ</summary>
                    <label>
                      担当
                      <input
                        value={task.owner}
                        maxLength={100}
                        placeholder="未設定"
                        onChange={(e) =>
                          updateTask(task.id, { owner: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      メモ・結果
                      <textarea
                        value={task.note}
                        rows={3}
                        maxLength={8000}
                        placeholder="必要なことや、終わった内容を書く"
                        onChange={(e) =>
                          updateTask(task.id, { note: e.target.value })
                        }
                      />
                    </label>
                  </details>
                </div>
                <select
                  aria-label={`作業${index + 1}の進捗`}
                  value={task.status}
                  onChange={(e) =>
                    updateTask(task.id, { status: e.target.value as Status })
                  }
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ol>
          <form
            className={styles.addTask}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTask.trim()) return;
              if (board.tasks.length >= 100) {
                setError('1つの仕事に100項目まで追加できます。');
                return;
              }
              updateBoard({
                ...board,
                tasks: [
                  ...board.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: newTask.trim(),
                    owner: '',
                    note: '',
                    status: 'todo',
                  },
                ],
              });
              setNewTask('');
            }}
          >
            <input
              aria-label="追加する作業"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              maxLength={2000}
              placeholder="やることを追加…"
            />
            <button type="submit" disabled={!newTask.trim()}>
              <Plus size={16} />
              追加
            </button>
          </form>
          <p className={styles.footnote}>
            進捗は手動のメモです。AI実行や正式な検収は「詳細管理」で扱います。
          </p>
        </section>
      )}
      {exportOpen && (
        <section className={styles.export} aria-label="作業メモの書き出し">
          <label htmlFor="amc-export-text">コピーして使える作業一覧</label>
          <textarea
            id="amc-export-text"
            readOnly
            value={exportText}
            rows={8}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" onClick={exportBoard}>
            テキストファイルを保存
          </button>
        </section>
      )}
      {!board && draft.input && (
        <button
          className={styles.textButton}
          type="button"
          onClick={() => setExportOpen(!exportOpen)}
        >
          入力を書き出す
        </button>
      )}
    </section>
  );
}
