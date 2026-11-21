'use client';
import { useEffect, useState } from 'react';
import type { IntakeStatus } from '@/lib/noah-intake-store';
import type { NoahLaunchStatus, NoahLaunchWindow } from '@/lib/noah-launch-status';
import styles from './noah-intake-review.module.css';
const labels: Record<string, string> = {
  unsupported_registry: '型紙の無い配布', no_endpoint: '接続先が無い', legacy_sse_only: '旧い接続先だけ', bad_url: '接続先を確認できない',
  needs_host_file: '本人の端末のファイルが要る', needs_runtime_arguments: '起動の用意が要る', bad_argument: '起動の指定を確認できない',
  published_secret: '鍵が公開されている', bad_identifier: '版が1つに決まらない', bad_env: '準備する項目を確認できない', bad_header: '接続の指定を確認できない',
  withdrawn: '取り下げ', hidden: 'しばらくつながっていない', unsupported: 'つなげない', later_source: '別の台帳', later_mouth: '端末で動かす', bulk: '同じ提供者の道具', needs_key: '鍵の入力が要る', not_checked: 'まだ確かめていない', needs_permission: '相手の許可が要る', needs_payment: '支払いが要る', not_responding: '応答を確認できない', no_form_tool: '入力欄で使える道具が無い',
};
const date = (value: number | null) => value === null ? 'まだありません' : new Date(value).toLocaleString('ja-JP');
type State = IntakeStatus & { warnings: string[]; ownerScope: string; error?: string; launch?: NoahLaunchStatus | null };
// 見張る数（docs/noah/spec-97-launch-ops.md の 6 章）の、行の文。数だけを出す（本人の ID・依頼の中身・接続先の URL は、応答に無い）。
const handshakeLabels: Record<string, string> = { ok: '通った', auth_required: '相手の許可が要る', payment_required: '支払いが要る', forbidden: '断られた', rate_limited: '混んでいる', unreachable: '応答しない', incompatible: '形が合わない', too_large: '大きすぎる', blocked: 'つなげない', unchecked: '握手していない（握手しない物を含む）' };
const connectionLabels: Record<string, string> = { connected: 'つながった', failed: '失敗', disconnected: '切った', blocked: '使えない', planned: '途中', entitling: '途中', preparing: '途中', probing: '途中', needs_action: '本人の操作待ち', unknown: '不明' };
const askLabels: Record<string, string> = { succeeded: '成果', failed: '失敗', unknown: '結果不明', stopped: '止めた', running: '進んでいる', queued: '待っている', your_turn: '本人の番', limit: '上限' };
// 並びは、行の文の表（上の 3 つ）の順。同じ文になる状態（途中の 4 つ）は、足して 1 つにする。表に無い状態は、最後に「その他」。
const counts = (values: Record<string, number>, names: Record<string, string>) => {
  const merged = new Map<string, number>();
  for (const key of [...Object.keys(names).filter(name => name in values), ...Object.keys(values).filter(name => !(name in names))]) merged.set(names[key] ?? 'その他', (merged.get(names[key] ?? 'その他') ?? 0) + values[key]);
  return [...merged].map(([name, count]) => `${name} ${count}`).join(' ／ ') || 'ありません';
};
const onOff = (open: boolean) => (open ? '開' : '閉');
const connections = (window: NoahLaunchWindow) => counts(Object.fromEntries(Object.entries(window.connections).map(([state, value]) => [state, value.count])), connectionLabels);
const handshakeMs = (window: NoahLaunchWindow) => (window.probeMs == null ? 'まだありません' : `${window.probeMs} ミリ秒`);
const screens = (window: NoahLaunchWindow) => `狭い ${window.screens.narrow} ／ 広い ${window.screens.wide}${window.screens.unknown ? ` ／ 不明 ${window.screens.unknown}` : ''}`;
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
  return <section className={styles.intake} aria-labelledby="noah-intake-heading">
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
      {state.confirmed && <>
        <h3>つながると確かめた数</h3>
        <p>動いた（人が動かして、成果が出た）：{state.confirmed.ran}</p>
        <p>握手まで確かめた（まだ誰も動かしていない）：{state.confirmed.handshake}</p>
        <p>本人の Mac で動かす（台帳とは別の、固定の物）：{state.confirmed.fixed}</p>
      </>}
      {state.launch === null && <p>見張る数は、今は数えられません。</p>}
      {state.launch && <>
        <h3>見張る数</h3>
        <p>切り替え：巡回 {onOff(state.launch.flags.patrol)} ／ 一覧 {onOff(state.launch.flags.intakePublic)} ／ 接続と依頼 {onOff(state.launch.flags.askForm)} ／ 自動の見本 {onOff(state.launch.flags.probeL2)}</p>
        {state.launch.registry
          ? <p>台帳の巡回：最後の成功 {date(state.launch.registry.lastSuccessAt)} ／ 最後に全件を読み終えた巡回の開始 {date(state.launch.registry.lastFullAt)} ／ 見た記録 {state.launch.registry.observed}{state.launch.registry.sweeping ? ' ／ 読み取り中' : ''}{state.launch.registry.failureCount ? ` ／ 続けて失敗 ${state.launch.registry.failureCount} 回` : ''}{state.launch.registry.stalled ? ' ／ 止まっています（この 2 時間、成功も、読み取りの開始もありません）' : ''}</p>
          : <p>台帳の巡回：まだ動いていません。</p>}
        <p>まだ握手していない数（0 になったら、最初の 1 巡が終わっています）：{state.launch.unchecked}</p>
        <p>握手の結果：{counts(state.launch.handshakes, handshakeLabels)}</p>
        <p>同じ接続先へ、1 時間に 2 回以上握手した数：{state.launch.hostsProbedTwice}</p>
        <p>混んでいる接続先：直近 60 秒の枠を使い切った {state.launch.hosts.full} ／ 待つ時刻まで送らない {state.launch.hosts.waiting}</p>
        {/* 期間ごとの数。表にしない（スマホの幅で、横にはみ出さないように、1 行ずつの文で出す）。 */}
        {([['直近 24 時間', state.launch.day], ['直近 7 日', state.launch.week]] as const).map(([label, window]) => <div key={label}>
          <h4>{label}</h4>
          <p>接続：{connections(window)}</p>
          <p>握手の時間（握手が通った接続の平均）：{handshakeMs(window)}</p>
          <p>依頼：{counts(window.asks, askLabels)}</p>
          <p>つないだ人：{window.people.connected} ／ 成果が出た人：{window.people.succeeded}</p>
          <p>頼んだ画面の幅：{screens(window)}</p>
        </div>)}
        <p>戻ってきた人（成果が、2 日以上にある人）：{state.launch.returned}</p>
        <p>失敗の多い接続先（直近 7 日。依頼が 5 件以上あり、失敗か結果不明がある接続先だけ）：{state.launch.failingHosts.map(row => `${row.host} 失敗 ${row.failed}・結果不明 ${row.unknown}／${row.total}`).join(' ／ ') || 'ありません'}</p>
        <p>数えた時刻：{date(state.launch.at)}（5 分ごとに数え直します）</p>
      </>}
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
