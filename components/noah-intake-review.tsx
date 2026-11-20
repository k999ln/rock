'use client';
import { useEffect, useState } from 'react';
import type { IntakeStatus } from '@/lib/noah-intake-store';
const labels: Record<string, string> = {
  unsupported_registry: '型紙の無い配布', no_endpoint: '接続先が無い', legacy_sse_only: '旧い接続先だけ', bad_url: '接続先を確認できない',
  needs_host_file: '本人の端末のファイルが要る', needs_runtime_arguments: '起動の用意が要る', bad_argument: '起動の指定を確認できない',
  published_secret: '鍵が公開されている', bad_identifier: '版が1つに決まらない', bad_env: '準備する項目を確認できない', bad_header: '接続の指定を確認できない',
  withdrawn: '取り下げ', hidden: 'しばらくつながっていない', unsupported: 'つなげない', later_source: '別の台帳', later_mouth: '端末で動かす', bulk: '同じ提供者の道具', needs_key: '鍵の入力が要る', not_checked: 'まだ確かめていない', needs_permission: '相手の許可が要る', needs_payment: '支払いが要る', not_responding: '応答を確認できない', no_form_tool: '入力欄で使える道具が無い',
};
const date = (value: number | null) => value === null ? 'まだありません' : new Date(value).toLocaleString('ja-JP');
type State = IntakeStatus & { warnings: string[]; ownerScope: string; error?: string };
export default function NoahIntakeReview({ ownerScope }: { ownerScope: string }) {
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [mouth, setMouth] = useState(''), [level, setLevel] = useState(''), [query, setQuery] = useState(''), [q, setQ] = useState(''), [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0), [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ state: '1', mouth, level, q, offset: String(offset) });
    void fetch(`/api/noah/intake?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (response.status === 404) return;
      const data = await response.json() as State;
      if (!response.ok) throw Error(data.error ?? '取り込みを確認できません。');
      if (data.ownerScope !== ownerScope) throw Error('アカウントが変わりました。再読込してください。');
      if (!controller.signal.aborted) { setState(data); setError(''); }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '取り込みを確認できません。'); });
    return () => controller.abort();
  }, [ownerScope, mouth, level, q, offset, refresh]);
  async function moderate(row: IntakeStatus['families'][number]) {
    if (pending || !state || state.ownerScope !== ownerScope) return;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/noah/intake', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': ownerScope }, body: JSON.stringify({ action: row.withdrawn ? 'restore' : 'withdraw', id: row.id, revision: row.revision }) });
      const result = await response.json() as { ownerScope?: string; error?: string };
      if (!response.ok || result.ownerScope !== ownerScope) throw Error(result.error ?? '再読込してから操作してください。');
      setRefresh(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '保存できません。'); } finally { setPending(false); }
  }
  if (!state && !error) return null;
  return <section aria-labelledby="noah-intake-heading">
    <h2 id="noah-intake-heading">取り込み</h2>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={pending} onClick={() => setRefresh(n => n + 1)}>更新する</button>
    {state && <>
      {state.sources.length === 0 && <p>公式台帳の取り込みは、まだ始まっていません。</p>}
      {state.sources.map(source => <p key={source.id}>公式台帳：最後の確認 {date(source.last_success_at)} ／ 次の確認 {date(source.next_run_at || null)}{source.sweep_started_at !== null ? ' ／ 取り込み中' : ''}{source.error_code ? ' ／ 確認を待っています' : ''}</p>)}
      <table><thead><tr><th>動く場所</th><th>候補</th><th>入力なし</th><th>準備が要る</th></tr></thead><tbody>
        <tr><th>相手のサーバー</th><td>{state.mouths.remote}</td><td>{state.mouths.remoteReady}</td><td>{state.mouths.remote - state.mouths.remoteReady}</td></tr>
        <tr><th>端末で動かす</th><td>{state.mouths.terminal}</td><td>{state.mouths.terminalReady}</td><td>{state.mouths.terminal - state.mouths.terminalReady}</td></tr>
      </tbody></table>
      <p>一覧に載せている数：{state.listed}</p>
      <p>載せていない理由：{Object.entries(state.reasons).map(([reason, count]) => `${labels[reason] ?? 'その他'} ${count}`).join(' ／ ') || 'ありません'}</p>
      <p>つなげない物の内訳：{Object.entries(state.unsupported).map(([reason, count]) => `${labels[reason] ?? 'その他'} ${count}`).join(' ／ ') || 'ありません'}</p>
      {state.warnings.map(warning => <output key={warning}>{warning}</output>)}
    </>}
    <form onSubmit={event => { event.preventDefault(); setQ(query.trim()); setOffset(0); }}>
      <label>動く場所 <select value={mouth} onChange={event => { setMouth(event.target.value); setOffset(0); }}><option value="">すべて</option><option value="mcp-remote">相手のサーバー</option><option value="mcp-package">端末で動かす</option></select></label>
      <label>確認の段階 <select value={level} onChange={event => { setLevel(event.target.value); setOffset(0); }}><option value="">すべて</option><option value="0">まだ確かめていない</option><option value="1">つながった</option><option value="2">動いた</option></select></label>
      <label>名前・説明 <input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label><button type="submit">絞り込む</button>
    </form>
    {state?.families.map(row => <p key={row.id}>{row.name}{row.members > 1 ? ` の道具 ${row.members} 個` : ''} · {row.mouth === 'mcp-remote' ? '相手のサーバー' : row.mouth === 'mcp-package' ? '端末で動かす' : '接続先を確認できない'} · {['まだ確かめていない', 'つながった', '動いた'][row.level]} <button type="button" disabled={pending} onClick={() => { void moderate(row); }}>{row.withdrawn ? '一覧の対象に戻す' : '取り下げる'}</button></p>)}
    {offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, offset - 20))}>前の20件</button>}
    {state?.nextOffset != null && <button type="button" onClick={() => setOffset(state.nextOffset!)}>次の20件</button>}
  </section>;
}
