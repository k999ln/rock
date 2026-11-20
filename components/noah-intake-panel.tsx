'use client';
// 運営の画面の「取り込み」の節（審査者だけ）。公式台帳の巡回の状態、件数、載せていない理由、系列の取り下げと戻し。
// 仕様: docs/noah/spec-85-intake.md 6 章・11.5。利用者の画面には出さない（審査者でない人には、API が 404 を返し、この節は何も出さない）。
import { useEffect, useRef, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-agent-catalog.module.css';

type Source = {
  id: string; label: string; lastSuccessAt: number | null; nextRunAt: number; sweepStartedAt: number | null; sweepMode: 'full' | 'updated' | null;
  checkpointAt: number | null; lastFullAt: number | null; errorCode: string | null; failureCount: number; observed: number; withdrawn: number;
};
type Status = {
  sources: Source[];
  table: { mouth: string; label: string; candidates: number; noInput: number; setup: number }[];
  unsupported: { reason: string; label: string; count: number }[];
  listing: { listed: number; families: { ran: number; new: number }; reasons: { reason: string; label: string; count: number }[] };
  withdrawn: { id: string; name: string; revision: number; withdrawnAt: number }[];
  warnings: string[];
  ownerScope: string;
};
type Agent = {
  id: string; name: string; provider: string; summary: string; host: string | null; section: 'ran' | 'new' | null; members: number;
  review?: { revision: number; withdrawnAt: number | null; hiddenAt: number | null; mouth: string | null; level: 0 | 1 | 2 | null; listing: { listed: true } | { listed: false; reason: string; label: string } };
};
type Found = { id: string; name: string; provider: string; section: 'ran' | 'new' | null };

const count = (value: number) => value.toLocaleString('ja-JP');
const when = (ms: number | null) => (ms === null || ms <= 0 ? 'まだありません' : new Date(ms).toLocaleString('ja-JP'));
const mouthLabel = (mouth: string | null) => (mouth === 'mcp-remote' ? '相手のサーバー' : mouth === 'mcp-package' ? '端末で動かす' : mouth ?? '下書きなし');
const depthLabel = (level: 0 | 1 | 2 | null) => (level === 2 ? '動いた' : level === 1 ? '握手まで' : 'まだ確かめていない');
const errorLabel: Record<string, string> = { rate_limited: '台帳が混んでいます', unavailable: '台帳を読めませんでした', invalid_response: '台帳の応答の形が違いました' };

export default function NoahIntakePanel() {
  const [status, setStatus] = useState<Status | null>(null),
    [absent, setAbsent] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [text, setText] = useState(''),
    [found, setFound] = useState<Found[] | null>(null),
    [agent, setAgent] = useState<Agent | null>(null),
    [pending, setPending] = useState(false);
  // 送っている間は、もう 1 回送らない（画面が描き直される前の 2 度押しも止める）。
  const busy = useRef(false);
  const begin = () => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError('');
    return true;
  };
  const end = () => {
    busy.current = false;
    setPending(false);
  };
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/noah/intake?state=1', { signal: c.signal, cache: 'no-store' })
      .then(async (r) => {
        // 審査者でない人には、無い物として返る。この節は何も出さない。
        if (r.status === 404 || r.status === 401) {
          setAbsent(true);
          return;
        }
        const d = (await r.json()) as Status & { error?: string };
        if (!r.ok) throw new Error(d.error ?? '取り込みの状態を読み込めません。');
        setStatus(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : '取り込みの状態を読み込めません。');
      });
    return () => c.abort();
  }, [refresh]);

  async function open(id: string) {
    if (!begin()) return;
    try {
      // 系列の ID は / と : を含むので、query で渡す。
      const r = await fetch(`/api/noah/intake?id=${encodeURIComponent(id)}`, { cache: 'no-store' }),
        d = (await r.json()) as { agent?: Agent; error?: string };
      if (!r.ok || !d.agent) throw new Error(r.status === 404 ? 'その ID の系列は、取り込みの記録にありません。' : (d.error ?? '系列を読み込めません。'));
      setAgent(d.agent);
    } catch (e) {
      setAgent(null);
      setError(e instanceof Error ? e.message : '系列を読み込めません。');
    } finally {
      end();
    }
  }
  async function find() {
    const value = text.trim();
    if (!value || busy.current) return;
    setFound(null);
    // 「出どころ:名前」の形は ID として開く。台帳の名前（名前空間/名前）は、公式台帳の ID に直して開く。それ以外は、載せている系列を語で探す。
    if (value.includes(':')) return open(value);
    if (/^[^\s/]+\/[^\s/]+$/.test(value)) return open(`mcp-registry:${value}`);
    if (!begin()) return;
    setAgent(null);
    try {
      const r = await fetch(`/api/noah/intake?q=${encodeURIComponent(value)}`, { cache: 'no-store' }),
        d = (await r.json()) as { items?: Found[]; error?: string };
      if (!r.ok || !d.items) throw new Error(d.error ?? '探せませんでした。');
      setFound(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '探せませんでした。');
    } finally {
      end();
    }
  }
  async function change(action: 'withdraw' | 'restore', id: string, revision: number) {
    if (!status || !begin()) return;
    try {
      const r = await fetch('/api/noah/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: status.ownerScope },
          body: JSON.stringify({ action, id, revision }),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? '保存できませんでした。');
      setAgent(null);
      setFound(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      end();
    }
  }

  if (absent) return null;
  const unsupportedTotal = status?.unsupported.reduce((total, row) => total + row.count, 0) ?? 0;
  return (
    <section aria-labelledby="noah-intake-title" className={styles.notice}>
      <h2 id="noah-intake-title">取り込み</h2>
      <p className={styles.muted}>外の台帳から読んだ記録の数です。握手や実行で確かめた数ではありません。出どころ: Official MCP Registry。</p>
      {error && <p role="alert">{error}</p>}
      {!status && !error && <p>読み込んでいます…</p>}
      {status && (
        <>
          {status.warnings.map((warning) => (
            <p key={warning} role="alert">
              切り替えの値: {warning}
            </p>
          ))}
          {status.sources.length === 0 && <p>まだ、台帳を読んでいません（巡回を開けると、最初の全件から始まります）。</p>}
          {status.sources.map((source) => (
            <p key={source.id}>
              {source.label}: 最後に読み終えた時刻 {when(source.lastSuccessAt)} ／ 次 {when(source.nextRunAt)}
              {source.sweepMode && `／ ${source.sweepMode === 'full' ? '全件を読んでいます' : '更新された記録を読んでいます'}`}
              {source.errorCode && `／ ${errorLabel[source.errorCode] ?? source.errorCode}（続けて ${count(source.failureCount)} 回）`}
              {source.lastSuccessAt !== null && `／ 前の巡回で読んだ記録 ${count(source.observed)} 件`}
            </p>
          ))}
          <div className={styles.tableWrap}>
            <table>
              <caption className={styles.muted}>有効な候補の数（下書きを作れた物）</caption>
              <thead>
                <tr>
                  <th scope="col">動く所</th>
                  <th scope="col">候補</th>
                  <th scope="col">入力なし</th>
                  <th scope="col">準備が要る</th>
                </tr>
              </thead>
              <tbody>
                {status.table.map((row) => (
                  <tr key={row.mouth}>
                    <th scope="row">{row.label}</th>
                    <td>{count(row.candidates)}</td>
                    <td>{count(row.noInput)}</td>
                    <td>{count(row.setup)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            つなげない {count(unsupportedTotal)}
            {status.unsupported.length > 0 && `: ${status.unsupported.map((row) => `${row.label} ${count(row.count)}`).join(' ／ ')}`}
          </p>
          <p>
            一覧に載せている系列: 動いた {count(status.listing.families.ran)} ／ 握手まで {count(status.listing.families.new)}
          </p>
          <p>
            載せていない候補{status.listing.reasons.length > 0 ? `: ${status.listing.reasons.map((row) => `${row.label} ${count(row.count)}`).join(' ／ ')}` : ' 0'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void find();
            }}
          >
            <label>
              系列を探す（語、台帳の名前、または系列の ID）
              <input value={text} onChange={(event) => setText(event.target.value)} maxLength={400} placeholder="例: ac.mizan/registry" />
            </label>
            <button type="submit" disabled={pending || !text.trim()}>
              探す
            </button>
          </form>
          {found && found.length === 0 && <p>載せている系列には、見つかりません。載せていない系列は、台帳の名前か ID で開けます。</p>}
          {found?.map((item) => (
            <p key={item.id}>
              {item.name}（提供: {item.provider}・{item.section === 'ran' ? '動いた' : '握手まで'}）
              <button type="button" disabled={pending} onClick={() => void open(item.id)}>
                開く
              </button>
            </p>
          ))}
          {agent?.review && (
            <div>
              <h3>{agent.members > 1 ? `${agent.provider} の道具 ${count(agent.members)} 個` : agent.name}</h3>
              <p className={styles.digest}>{agent.id}</p>
              <p>
                提供: {agent.provider}・{mouthLabel(agent.review.mouth)}・{depthLabel(agent.review.level)}・
                {agent.review.listing.listed ? '一覧に載せています' : `一覧に載せていません（${agent.review.listing.label}）`}
              </p>
              {agent.review.withdrawnAt === null ? (
                <button type="button" disabled={pending} onClick={() => void change('withdraw', agent.id, agent.review!.revision)}>
                  取り下げる
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => void change('restore', agent.id, agent.review!.revision)}>
                  戻す
                </button>
              )}
              <p className={styles.muted}>取り下げると、一覧・検索・詳細から消えます。記録は残ります。</p>
            </div>
          )}
          {status.withdrawn.length > 0 && <h3>取り下げている系列</h3>}
          {status.withdrawn.map((row) => (
            <p key={row.id}>
              {row.name}（{when(row.withdrawnAt)}）
              <button type="button" disabled={pending} onClick={() => void change('restore', row.id, row.revision)}>
                戻す
              </button>
            </p>
          ))}
        </>
      )}
    </section>
  );
}
