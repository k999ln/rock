import {
  LinuxServiceError,
  linuxMonthUsage,
  linuxPeriod,
  type LinuxListing,
  type LinuxWorkspace,
} from './sky-linux-service.ts';
import type { linuxServiceStore } from './sky-linux-service-store.ts';
import { esc, layout } from '../toolkits/esim-bootstrap/noah-trial/view.mjs';

const root = '/api/noah/cloud-work/metered';
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
type Store = Pick<
  ReturnType<typeof linuxServiceStore>,
  'ownerResponse' | 'catalog' | 'command'
>;
type Context = { owner: string; order: string; device: string };
const money = (minor: number) => (minor / 100).toFixed(2) + ' USD';
const hidden = (name: string, value: string | number) =>
  `<input type="hidden" name="${name}" value="${esc(value)}">`;
const page = (body: string, status = 200) =>
  new Response(
    layout(
      '契約中のクラウド',
      body +
        '<p><a href="/api/noah/cloud-work/metered">状態を更新</a> · <a href="/api/noah/cloud-work">専用クラウドに戻る</a></p>',
      'eSIMクラウド',
    ),
    { status, headers },
  );

function display(
  w: LinuxWorkspace,
  revision: number,
  catalog: LinuxListing[],
  canExecute: boolean,
) {
  const usage = linuxMonthUsage(w, linuxPeriod(Date.now()));
  const terms = w.terms;
  const fields =
    hidden('revision', revision) + hidden('contract', w.contractDigest);
  const listings = catalog
    .filter(
      (item) => canExecute && item.active && w.attachments.includes(item.id),
    )
    .map(
      (item) =>
        `<section><h2>${esc(item.agent.name)}</h2><p>実行先はavokadoの専用Linux。選んだAgentに依頼文を送ります。</p>
    <p>版 ${esc(item.digest.slice(0, 12))} · Agent料 ${money(item.authorFeeMinor)} · 計算料金 ${terms.cpuUnitMs} CPUミリ秒につき ${money(terms.cpuUnitMinor)}。</p>
    <form method="post" action="${root}">${fields}${hidden('action', 'run')}${hidden('requestId', crypto.randomUUID())}${hidden('listing', item.id)}${hidden('version', item.digest)}
    <label>依頼文<input name="text" required maxlength="4000"></label>
    <label>CPU上限（ミリ秒）<input name="cpu" type="number" min="1" max="170000" required></label>
    <label>今回の料金上限（米セント）<input name="maximum" type="number" min="0" max="${terms.monthlyCapMinor}" required></label>
    <label><input type="checkbox" name="accepted" value="yes" required>送信先・料金条件・上限を確認した</label><button>この条件で実行</button></form></section>`,
    )
    .join('');
  const jobs = w.jobs
    .slice()
    .reverse()
    .map((j) => {
      const confirmed = !!j.receiptId;
      const stop = ['queued', 'running'].includes(j.state)
        ? `<form method="post" action="${root}">${fields}${hidden('action', 'cancel')}${hidden('id', j.id)}<button>停止を依頼</button></form>`
        : '';
      const state = {
        queued: '受付済み',
        running: '実行中',
        completed: '完了',
        review: '成果を確認',
        cancel_requested: '停止確認待ち',
        cancelled: '停止',
        unknown: '実行状況を照会中',
      }[j.state];
      return `<li><b>${esc(j.listing.agent.name)}</b> · ${esc(state)}<p>仕事番号 ${esc(j.id)} · 版 ${esc(j.listing.digest.slice(0, 12))}</p>
      <p>承認上限 ${money(j.reservedMinor)}。${confirmed ? `使用量 ${j.cpuMs} CPUミリ秒、確定計算料 ${money(j.computeMinor)}、確定Agent料 ${money(j.authorMinor)}。受領記録 ${esc(j.receiptId)}` : '確定使用量・料金は未確定。'}</p>
      ${j.run.text ? `<p>${esc(j.run.text)}</p>` : ''}${stop}</li>`;
    })
    .join('');
  return page(`<p>${esc(usage.period)}の明細 · ${w.mode === 'sandbox' ? '試験契約' : '契約中'} · 料金条件 ${esc(terms.version)}</p>
    <p>基本料 ${money(usage.baseMinor)} · 確定計算料 ${money(usage.computeMinor)} · 確定Agent料 ${money(usage.authorMinor)} · 予約中 ${money(usage.reservedMinor)} · 月間上限 ${money(terms.monthlyCapMinor)}</p>
    ${listings || '<p>この契約で現在実行できる追加済みAgentはありません。<a href="/noah/linux">契約と追加済みAgentを確認</a></p>'}
    <section><h2>仕事と従量明細</h2>${jobs ? '<ul>' + jobs + '</ul>' : '<p>まだ依頼がありません。</p>'}</section>`);
}

export async function handleEsimMeteredWork(
  body: string | undefined,
  context: Context,
  store: Store,
  session: () => Promise<string>,
) {
  // Called only after the private carrier gate authorizes this exact URL, body and account.
  // The spending authority is the separate owner session and an already accepted contract.
  try {
    if ((await session()) !== context.owner)
      return page('<p>この回線の契約者としてサインインしてください。</p>', 403);
    const listings = await store.catalog();
    const { workspace, access } = await store.ownerResponse(context.owner);
    if (
      !workspace ||
      !access?.canRead ||
      workspace.payload.orderId !== context.order ||
      workspace.payload.deviceRef !== context.device
    )
      return page(
        '<p>この回線と端末に対応する専用クラウド契約を確認できません。<a href="/noah/linux">契約設定を見る</a></p>',
        403,
      );
    const w = workspace.payload;
    if (access.reason === 'dispatch_schema_unsupported')
      return page(
        '<p>旧形式の契約です。契約設定から確認してください。</p>',
        409,
      );
    if (body === undefined)
      return display(w, workspace.revision, listings, access.canExecute);
    const form = new URLSearchParams(body);
    if (
      [...form.keys()].length !== new Set(form.keys()).size ||
      form.get('contract') !== w.contractDigest
    )
      return page('<p>契約条件を再度確認してください。</p>', 409);
    const revision = form.get('revision');
    if (revision !== String(workspace.revision))
      return page(
        '<p>状態が更新されました。仕事番号を確認してください。</p>',
        409,
      );
    const action = form.get('action');
    if (action === 'run') {
      const item = listings.find(
        (i) =>
          i.active &&
          i.id === form.get('listing') &&
          i.digest === form.get('version'),
      );
      if (
        !access.canExecute ||
        !item ||
        !w.attachments.includes(item.id) ||
        form.get('accepted') !== 'yes'
      )
        return page(
          '<p>実行権とAgentの版・料金条件を確認してください。</p>',
          403,
        );
      const cpu = form.get('cpu') ?? '',
        max = form.get('maximum') ?? '';
      if (!/^[1-9]\d{0,5}$/.test(cpu) || !/^(0|[1-9]\d{0,12})$/.test(max))
        return page('<p>計算上限と料金上限を整数で入力してください。</p>', 400);
      await store.command(context.owner, workspace.revision, {
        action,
        listingId: item.id,
        listingDigest: item.digest,
        requestId: form.get('requestId') ?? '',
        input: form.get('text') ?? '',
        cpuLimitMs: Number(cpu),
        maximumMinor: Number(max),
        accepted: true,
      });
    } else if (action === 'cancel') {
      const id = form.get('id');
      if (!id || !w.jobs.some((j) => j.id === id))
        return page('<p>仕事が見つかりません。</p>', 404);
      await store.command(context.owner, workspace.revision, {
        action,
        jobId: id,
      });
    } else return page('<p>操作を選んでください。</p>', 400);
    return new Response(null, {
      status: 303,
      headers: { ...headers, Location: root },
    });
  } catch (error) {
    if (error instanceof LinuxServiceError)
      return page('<p>' + esc(error.message) + '</p>', error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return page('<p>クラウド契約者としてサインインしてください。</p>', 401);
    return page(
      '<p>契約状態を確認できません。仕事を開き直してください。</p>',
      503,
    );
  }
}
