'use client';
/* Local Blob previews cannot use the remote image optimizer. User media has no supplied caption track. */
/* eslint-disable next/no-img-element, jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from 'react';
import {
  mediaKind,
  mediaOperation,
  type MediaKind,
  type MediaOperation,
} from '@/lib/eve-media-edit';
import { editMedia, type MediaEditResult } from '@/lib/eve-media-app';
import styles from './eve-media-studio.module.css';
type Material = { id: string; file: File; url: string; kind: MediaKind };
type Saved = {
  id: string;
  name: string;
  blob: Blob;
  kind: MediaKind;
  created: number;
  sources: string[];
  operation: MediaOperation;
};
const titles: Record<MediaOperation, string> = {
  'photo-layer': '写真を透かして重ねる',
  'audio-mix': '音楽を重ねてミックス',
  'video-sequence': 'A → B の順につなぐ',
  'video-soundtrack': '動画に音楽を重ねる',
};
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('eve-media-studio', 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('works', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(Error('このブラウザへ保存できません。ダウンロードしてください。'));
  });
}
async function stored(owner: string, save?: Saved): Promise<Saved[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('works', save ? 'readwrite' : 'readonly'),
        store = tx.objectStore('works');
      if (save) store.put({ ...save, id: `${owner}:${save.id}`, owner });
      const request = store.getAll();
      let rows: Saved[] = [];
      request.onsuccess = () => {
        rows = (request.result as (Saved & { owner: string })[])
          .filter((v) => v.owner === owner)
          .sort((a, b) => b.created - a.created);
      };
      tx.oncomplete = () => resolve(rows);
      tx.onerror = () =>
        reject(Error('保存に失敗しました。ダウンロードできます。'));
      tx.onabort = () => reject(Error('保存を中止しました。'));
    });
  } finally {
    db.close();
  }
}
function Waveform({ file }: { file: File }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const ctx = new AudioContext();
    void file
      .arrayBuffer()
      .then((b) => ctx.decodeAudioData(b))
      .then((buffer) => {
        if (!active || !ref.current) return;
        const canvas = ref.current,
          c = canvas.getContext('2d');
        if (!c) return;
        const data = buffer.getChannelData(0);
        c.fillStyle = '#c8966a';
        for (let x = 0; x < 160; x++) {
          let peak = 0;
          const start = Math.floor((x * data.length) / 160),
            end = Math.floor(((x + 1) * data.length) / 160),
            stride = Math.max(1, Math.floor((end - start) / 80));
          for (let i = start; i < end; i += stride)
            peak = Math.max(peak, Math.abs(data[i]));
          const h = Math.max(2, peak * 70);
          c.fillRect(x * 2, 40 - h / 2, 1, h);
        }
      })
      .catch(() => {})
      .finally(() => {
        void ctx.close();
      });
    return () => {
      active = false;
    };
  }, [file]);
  return (
    <canvas
      ref={ref}
      width={320}
      height={80}
      className={styles.wave}
      aria-label={`${file.name}の波形`}
    />
  );
}
function MediaPreview({
  kind,
  url,
  name,
}: {
  kind: MediaKind;
  url: string;
  name: string;
}) {
  return kind === 'image' ? (
    <img src={url} alt={name} />
  ) : kind === 'video' ? (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      aria-label={name}
    />
  ) : (
    <audio src={url} controls preload="metadata" aria-label={name} />
  );
}
function SavedWork({ work }: { work: Saved }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(work.blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(u);
    };
  }, [work.blob]);
  return (
    <article className={styles.savedCard}>
      <MediaPreview kind={work.kind} url={url} name={work.name} />
      <strong>{work.name}</strong>
      <small>{work.sources.join(' ＋ ')}</small>
      <a href={url} download={work.name}>
        ダウンロード ↗
      </a>
    </article>
  );
}
export default function EveMediaStudio({ owner }: { owner: string }) {
  const [materials, setMaterials] = useState<Material[]>([]),
    [pair, setPair] = useState<[string | null, string | null]>([null, null]),
    [amount, setAmount] = useState(0.5),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [notice, setNotice] = useState(''),
    [result, setResult] = useState<
      | (MediaEditResult & {
          url: string;
          id: string;
          kind: MediaKind;
          sources: string[];
          operation: MediaOperation;
        })
      | null
    >(null),
    [saved, setSaved] = useState<Saved[]>([]),
    [saving, setSaving] = useState(false),
    [savedId, setSavedId] = useState(''),
    [dragging, setDragging] = useState<{
      id: string;
      x: number;
      y: number;
    } | null>(null),
    [over, setOver] = useState<string | null>(null);
  const life = useRef({
    active: true,
    controller: null as AbortController | null,
    urls: new Set<string>(),
    drag: null as { id: string; x: number; y: number } | null,
  });
  useEffect(() => {
    const scope = life.current;
    scope.active = true;
    void stored(owner)
      .then((v) => {
        if (scope.active) setSaved(v);
      })
      .catch(() => {});
    return () => {
      scope.active = false;
      scope.controller?.abort();
      scope.urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [owner]);
  const a = materials.find((m) => m.id === pair[0]),
    b = materials.find((m) => m.id === pair[1]);
  let operation: MediaOperation | undefined,
    invalid = '';
  if (a && b) {
    try {
      operation = mediaOperation(a.kind, b.kind);
    } catch (e) {
      invalid = (e as Error).message;
    }
  }
  function place(id: string, side: 0 | 1) {
    setPair((p) =>
      side === 0
        ? [id, p[1] === id ? null : p[1]]
        : [p[0] === id ? null : p[0], id],
    );
  }
  function add(files: FileList | null) {
    if (!files || busy) return;
    try {
      if (materials.length + files.length > 4)
        throw Error('素材は4つまで。使わない素材を棚から外してください。');
      const next = Array.from(files)
        .map((file) => {
          const kind = mediaKind(file.type);
          if (!kind || file.size === 0 || file.size > 100 * 1024 * 1024)
            throw Error(
              '写真・動画・音楽を選んでください。1本100 MB以内です。',
            );
          return { file, kind };
        })
        .map(({ file, kind }) => {
          const url = URL.createObjectURL(file);
          life.current.urls.add(url);
          return { id: crypto.randomUUID(), file, kind, url };
        });
      setMaterials((v) => [...v, ...next]);
      setNotice('素材の上部をつかんで、別の素材に重ねてください。');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function run() {
    if (!a || !b || !operation || busy) return;
    const controller = new AbortController();
    life.current.controller = controller;
    setBusy(true);
    setProgress(0);
    setNotice('Eveが編集アプリで作業コピーを作成しています。');
    try {
      const output = await editMedia(
        a.file,
        b.file,
        operation,
        amount,
        controller.signal,
        (n) => {
          if (life.current.active) setProgress(n);
        },
      );
      controller.signal.throwIfAborted();
      if (!life.current.active) return;
      if (result) {
        URL.revokeObjectURL(result.url);
        life.current.urls.delete(result.url);
      }
      const url = URL.createObjectURL(output.blob);
      life.current.urls.add(url);
      setResult({
        ...output,
        url,
        id: crypto.randomUUID(),
        kind:
          operation === 'photo-layer'
            ? 'image'
            : operation === 'audio-mix'
              ? 'audio'
              : 'video',
        sources: [a.file.name, b.file.name],
        operation,
      });
      setSavedId('');
      setNotice(
        '作業コピーができました。再生・表示を確認して、作品に保存できます。',
      );
    } catch (e) {
      if (life.current.active)
        setNotice(
          controller.signal.aborted
            ? '編集を中止しました。原本は残っています。'
            : (e as Error).message,
        );
    } finally {
      if (life.current.active) setBusy(false);
    }
  }
  async function save() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const work: Saved = {
        id: result.id,
        name: `eve-${result.operation}-${result.id.slice(0, 8)}.${result.extension}`,
        blob: result.blob,
        kind: result.kind,
        created: Date.now(),
        sources: result.sources,
        operation: result.operation,
      };
      const items = await stored(owner, work);
      if (life.current.active) {
        setSaved(items);
        setSavedId(result.id);
        setNotice(
          'このブラウザの作品棚に保存しました。閉じた後も同じブラウザで開けます。',
        );
      }
    } catch (e) {
      if (life.current.active) setNotice((e as Error).message);
    } finally {
      if (life.current.active) setSaving(false);
    }
  }
  return (
    <section className={styles.studio} aria-label="Eveのメディア編集スタジオ">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>Eve creative studio</span>
          <h2>
            重ねたら、
            <br />
            <em>次の作品に。</em>
          </h2>
          <p>写真、映像、音楽。好きなふたつを連れてきて。</p>
        </div>
        <label className={styles.add}>
          ＋ 素材をひらく
          <input
            aria-label="写真・動画・音楽を取り込む"
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </header>
      <div className={styles.desk}>
        <div className={styles.shelf} aria-label="メディアの素材棚">
          {materials.length === 0 ? (
            <div className={styles.invitation}>
              <span>＋</span>
              <h3>ふたつの素材から、はじめよう。</h3>
              <p>写真を透かす。映像をつなぐ。音を重ねる。</p>
              <small>すべてこの端末で編集。原本はそのまま。</small>
            </div>
          ) : (
            materials.map((m, i) => (
              <article
                key={m.id}
                className={styles.material}
                data-media-card={m.id}
                data-over={over === m.id || undefined}
                data-chosen={pair.includes(m.id) || undefined}
              >
                <button
                  type="button"
                  disabled={busy}
                  className={styles.handle}
                  aria-label={`${m.file.name}をつかんで重ねる`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      place(m.id, pair[0] ? 1 : 0);
                    }
                  }}
                  onPointerDown={(e) => {
                    if (busy) return;
                    life.current.drag = {
                      id: m.id,
                      x: e.clientX,
                      y: e.clientY,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = life.current.drag;
                    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8)
                      return;
                    setDragging({ id: d.id, x: e.clientX, y: e.clientY });
                    const hit = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>('[data-media-card]')
                      ?.dataset.mediaCard;
                    setOver(hit && hit !== d.id ? hit : null);
                  }}
                  onPointerCancel={() => {
                    life.current.drag = null;
                    setDragging(null);
                    setOver(null);
                  }}
                  onPointerUp={(e) => {
                    const d = life.current.drag;
                    life.current.drag = null;
                    setDragging(null);
                    setOver(null);
                    if (!d || busy) return;
                    const hit = document.elementFromPoint(e.clientX, e.clientY);
                    const other =
                      hit?.closest<HTMLElement>('[data-media-card]')?.dataset
                        .mediaCard;
                    const slot =
                      hit?.closest<HTMLElement>('[data-media-slot]')?.dataset
                        .mediaSlot;
                    if (other && other !== d.id) {
                      setPair([d.id, other]);
                      setNotice(
                        'ふたつが重なりました。編集内容を確認してください。',
                      );
                    } else if (slot === '0' || slot === '1')
                      place(d.id, Number(slot) as 0 | 1);
                    else if (Math.abs(e.clientX - d.x) > 45)
                      place(d.id, e.clientX > d.x ? 1 : 0);
                  }}
                >
                  <span>
                    ⠿{' '}
                    {m.kind === 'image'
                      ? 'PHOTO'
                      : m.kind === 'video'
                        ? 'FILM'
                        : 'SOUND'}{' '}
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <strong>{m.file.name}</strong>
                </button>
                <div className={styles.preview}>
                  {m.kind === 'audio' && <Waveform file={m.file} />}
                  <MediaPreview kind={m.kind} url={m.url} name={m.file.name} />
                </div>
                <div className={styles.actions}>
                  <button
                    disabled={busy}
                    onClick={() => place(m.id, 0)}
                    aria-label={`${m.file.name}をメディアAへ`}
                  >
                    Aへ
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => place(m.id, 1)}
                    aria-label={`${m.file.name}をメディアBへ`}
                  >
                    Bへ
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setMaterials((v) => v.filter((f) => f.id !== m.id));
                      setPair(
                        (p) =>
                          p.map((id) =>
                            id === m.id ? null : id,
                          ) as typeof pair,
                      );
                      URL.revokeObjectURL(m.url);
                      life.current.urls.delete(m.url);
                    }}
                    aria-label={`${m.file.name}をメディア棚から外す`}
                  >
                    外す
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <aside className={styles.mixer}>
          <span className={styles.kicker}>Make something together</span>
          <div className={styles.pair}>
            {[a, b].map((m, i) => (
              <div key={i} data-media-slot={i}>
                <span>{i === 0 ? 'A' : 'B'}</span>
                {m ? (
                  <>
                    <div className={styles.miniPreview}>
                      {m.kind === 'image' ? (
                        <img src={m.url} alt="" />
                      ) : (
                        <span>{m.kind === 'video' ? '▶' : '♫'}</span>
                      )}
                    </div>
                    <strong>{m.file.name}</strong>
                  </>
                ) : (
                  <p>ここに重ねる</p>
                )}
              </div>
            ))}
          </div>
          {operation ? (
            <>
              <h3>{titles[operation]}</h3>
              <p>
                {operation === 'photo-layer'
                  ? 'Aを背景に、Bを透かして中央に重ねます。'
                  : operation === 'audio-mix'
                    ? '同じタイミングで再生し、音量のバランスを整えます。'
                    : operation === 'video-sequence'
                      ? '左の映像のあとに、右の映像を。元の音声も一緒につなぎます。'
                      : '映像の長さに合わせて音楽を重ねます。短い音楽は繰り返します。'}
              </p>
              {operation !== 'video-sequence' && (
                <label className={styles.balance}>
                  {operation === 'photo-layer'
                    ? 'Bを重ねる濃さ'
                    : '音のバランス'}
                  <input
                    aria-label="重ね合わせの割合"
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(amount * 100)}
                    disabled={busy}
                    onChange={(e) => setAmount(Number(e.target.value) / 100)}
                  />
                  <span>
                    {operation === 'photo-layer'
                      ? `Bを${Math.round(amount * 100)}%重ねる`
                      : `元の音 ${100 - Math.round(amount * 100)}% / 重ねる音 ${Math.round(amount * 100)}%`}
                  </span>
                </label>
              )}
            </>
          ) : (
            <p className={styles.hint}>
              {invalid || 'カードの上部をつかんで、もうひとつのカードへ。'}
            </p>
          )}
          <button
            className={styles.create}
            disabled={!operation || busy}
            onClick={() => void run()}
          >
            {busy ? `編集しています ${progress}%` : 'Eveと編集する ↗'}
          </button>
          {busy && (
            <>
              <progress max="100" value={progress} />
              <button
                className={styles.cancel}
                onClick={() => life.current.controller?.abort()}
              >
                編集を中止
              </button>
            </>
          )}
          <small>
            写真はPNG、音楽はWAV、動画はWebMまたはMP4。動画は完成尺60秒まで。書き出す間はこの画面を開いてください。
          </small>
        </aside>
      </div>
      {notice && <output className={styles.status}>{notice}</output>}
      {result && (
        <section className={styles.result} aria-label="メディアの編集結果">
          <div>
            <span className={styles.kicker}>Your next piece</span>
            <h3>
              できた。<em>見て、聴いて。</em>
            </h3>
            <p>{result.sources.join(' ＋ ')}</p>
            <p>
              {result.width ? `${result.width} × ${result.height} · ` : ''}
              {result.duration ? `${result.duration.toFixed(1)}秒 · ` : ''}
              {(result.blob.size / 1024).toFixed(0)} KB
            </p>
            <div className={styles.resultActions}>
              <button
                disabled={saving || savedId === result.id}
                onClick={() => void save()}
              >
                {savedId === result.id ? '作品棚に保存済み' : '作品棚に保存'}
              </button>
              <a
                href={result.url}
                download={`eve-${result.id.slice(0, 8)}.${result.extension}`}
              >
                ファイルを保存 ↗
              </a>
            </div>
            <details>
              <summary>編集の記録</summary>
              <p>
                {result.app}
                <br />
                {titles[result.operation]}
                <br />
                端末内で実行・クラウド送信なし。外部のデスクトップ編集アプリは使用していません。
              </p>
            </details>
          </div>
          <div className={styles.resultPreview}>
            <MediaPreview
              kind={result.kind}
              url={result.url}
              name="編集した作業コピー"
            />
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section className={styles.gallery} aria-label="保存したメディア作品">
          <h3>
            作品棚 <span>{saved.length}</span>
          </h3>
          <p>
            このブラウザに保存した作品。別の端末へ持ち出すときはダウンロードしてください。
          </p>
          <div>
            {saved.map((work) => (
              <SavedWork key={work.id} work={work} />
            ))}
          </div>
        </section>
      )}
      {dragging && (
        <div
          className={styles.ghost}
          style={{ left: dragging.x - 70, top: dragging.y - 25 }}
        >
          ＋ 重ねてつくる
        </div>
      )}
    </section>
  );
}
