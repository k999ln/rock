import {
  SITE_ADAPTERS,
  siteTool,
  siteInput,
  siteReady,
  sitePublications,
  executeSiteDiagnosis,
  completeSiteDiagnosis,
  siteReportText,
} from './site-diagnostics.mjs';
import { diagnosticPage } from './site-diagnostics-page.mjs';
import {
  SITE_DESTINATIONS,
  acquisitionSource,
  isAcquisitionNavigation,
  recordAcquisition,
  acquisitionReport,
} from './site-acquisition.mjs';
import {
  advanceDiscovery,
  validateOfferIndex,
  matchRevenueCandidates,
  revenuePublications,
  observeBusinessAdapter,
} from './revenue-matching.mjs';
import { loadRevenue, saveRevenue } from './revenue-storage.mjs';
import {
  validateCombinationConfig,
  emptyCombinationState,
  runCombinations,
  publicCombination,
  combinationVerdict,
  prepareCombination,
  applyCombinationObservation,
  combinationReport,
} from './combination-core.mjs';
const ORIGIN = 'https://noah-revenue-agents.mr-kirin999.workers.dev';
const common = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
const json = (v, status = 200) => Response.json(v, { status, headers: common });
const configFor = (env) => {
  const parts = [];
  for (let i = 1; i <= 32; i++) {
    const part = env['COMBINATION_CONFIG_PART_' + String(i).padStart(2, '0')];
    if (part === undefined) break;
    parts.push(part);
  }
  return validateCombinationConfig(
    JSON.parse(parts.length ? parts.join('') : env.COMBINATION_CONFIG_JSON),
  );
};
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('JSONで入力してください。');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('入力がありません。');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 196608) {
      await reader.cancel();
      throw new Error('入力が大きすぎます。');
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}
async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const raw = request.headers.get('authorization') ?? '';
  if (raw.length > 512) return false;
  const hash = async (s) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([hash(raw), hash('Bearer ' + secret)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export class CombinationLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async reconcileRevenue() {
    if (this.revenueFlight) return this.revenueFlight;
    this.revenueFlight = (async () => {
      const current = await this.ctx.storage.transaction((tx) =>
        loadRevenue(tx),
      );
      if (!current.enabled) return;
      const [discovery, business] = await Promise.all([
        advanceDiscovery(current.discovery),
        observeBusinessAdapter(this.env.BUSINESS_OPERATIONS_TOKEN),
      ]);
      await this.ctx.storage.transaction(async (tx) => {
        const latest = await loadRevenue(tx);
        // A stop or index replacement while fetching cancels this generation.
        if (!latest.enabled || latest.revision !== current.revision) return;
        latest.discovery = discovery;
        latest.business = business;
        latest.matches =
          latest.index && discovery.snapshot
            ? matchRevenueCandidates(discovery.snapshot.cards, latest.index)
            : null;
        latest.updatedAt = new Date().toISOString();
        await saveRevenue(tx, latest);
      });
    })();
    try {
      await this.revenueFlight;
    } finally {
      this.revenueFlight = null;
    }
  }
  async alarm() {
    await this.ctx.storage.transaction(async (tx) => {
      await tx.put(
        'acquisition',
        acquisitionReport(await tx.get('acquisition')).rows,
      );
      const current = (await tx.get('state')) || emptyCombinationState();
      if (!current.enabled) {
        if ((await tx.get('revenue'))?.enabled)
          await tx.setAlarm(Date.now() + 900000);
        else await tx.deleteAlarm();
        return;
      }
      try {
        const { state } = runCombinations(current, configFor(this.env));
        await tx.put('state', state);
        await tx.setAlarm(state.nextRunAt);
      } catch {
        current.lastError = 'configuration_or_storage';
        current.nextRunAt = Date.now() + 900000;
        await tx.put('state', current);
        await tx.setAlarm(current.nextRunAt);
      }
    });
    await this.reconcileRevenue();
  }
  async diagnose(id, raw) {
    const input = siteInput(id, raw),
      config = configFor(this.env),
      scheme = config.schemes.find((s) => s.id === id);
    const state =
        (await this.ctx.storage.get('state')) || emptyCombinationState(),
      pipeline = await this.ctx.storage.transaction((tx) => loadRevenue(tx));
    if (!siteReady(scheme, state, pipeline))
      throw Error('条件の確認中、または紹介受付を停止しています。');
    const cacheKey =
      'diagnosis.v2.' +
      id +
      '.' +
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(input.url),
          ),
        ),
      )
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
    this.diagnosticFlights ||= new Map();
    let report = await this.ctx.storage.get(cacheKey);
    if (!report || Date.now() - Date.parse(report.checkedAt) > 86400000) {
      if (!this.diagnosticFlights.has(cacheKey)) {
        const flight = (async () => {
          await this.ctx.storage.transaction(async (tx) => {
            const key = 'diagnosis-rate.' + id,
              old = await tx.get(key),
              hour = Math.floor(Date.now() / 3600000),
              rate = old?.hour === hour ? old : { hour, count: 0 };
            if (rate.count >= SITE_ADAPTERS[id].limit)
              throw Error(
                '無料診断の利用上限です。次の時間帯に再実行してください。',
              );
            rate.count++;
            await tx.put(key, rate);
          });
          const result = await executeSiteDiagnosis(scheme, input);
          await this.ctx.storage.transaction(async (tx) => {
            const keys = (await tx.get('diagnosis-cache-index')) || [];
            const fresh = keys.filter(
              (x) => x.key !== cacheKey && Date.now() - x.at < 86400000,
            );
            fresh.push({ key: cacheKey, at: Date.now() });
            const keep = fresh.slice(-100),
              remove = keys.filter((x) => !keep.some((k) => k.key === x.key));
            for (const x of remove) await tx.delete(x.key);
            await tx.put(cacheKey, result);
            await tx.put('diagnosis-cache-index', keep);
          });
          return result;
        })();
        this.diagnosticFlights.set(cacheKey, flight);
      }
      try {
        report = await this.diagnosticFlights.get(cacheKey);
      } finally {
        this.diagnosticFlights.delete(cacheKey);
      }
    }
    return this.ctx.storage.transaction(async (tx) => {
      const latest = (await tx.get('state')) || emptyCombinationState(),
        revenue = await loadRevenue(tx);
      const { result, record } = completeSiteDiagnosis(scheme, input, report, {
        state: latest,
        pipeline: revenue,
      });
      latest.diagnosticCounts ||= {};
      const counts = (latest.diagnosticCounts[id] ||= {
        executions: 0,
        referrals: 0,
      });
      counts.executions++;
      if (record.referralIssued) counts.referrals++;
      latest.receipts.push({ kind: 'diagnosis', ...record });
      latest.receipts = latest.receipts.slice(-100);
      latest.revision++;
      await tx.put('state', latest);
      return json(result);
    });
  }
  async fetch(request) {
    try {
      const input = await request.json(),
        config = configFor(this.env);
      if (input.action === 'diagnose')
        return await this.diagnose(input.schemeId, input.input);
      if (input.action === 'acquisition') {
        return this.ctx.storage.transaction(async (tx) => {
          const state = await tx.get('state'),
            pipeline = await loadRevenue(tx);
          if (
            !Object.hasOwn(SITE_DESTINATIONS, input.schemeId) ||
            !sitePublications(config, state, pipeline).some(
              (s) => s.id === 'noah-' + input.schemeId,
            )
          )
            return json({ error: '条件を確認中です。' }, 503);
          if (input.count === true)
            await tx.put(
              'acquisition',
              recordAcquisition(
                await tx.get('acquisition'),
                input.schemeId,
                input.source,
              ),
            );
          return json({ url: SITE_DESTINATIONS[input.schemeId] });
        });
      }
      if (input.action === 'revenue_sync') {
        await this.reconcileRevenue();
        return json({ reconciled: true });
      }
      if (
        [
          'revenue_status',
          'revenue_index',
          'revenue_start',
          'revenue_stop',
          'revenue_public',
        ].includes(input.action)
      ) {
        return this.ctx.storage.transaction(async (tx) => {
          const state = await loadRevenue(tx);
          if (input.action === 'revenue_public')
            return json({
              items: [
                ...revenuePublications(state),
                ...sitePublications(config, await tx.get('state'), state),
              ],
            });
          if (input.action === 'revenue_status')
            return json({
              enabled: state.enabled,
              revision: state.revision,
              updatedAt: state.updatedAt,
              catalog: {
                complete: !!state.discovery?.snapshot,
                total: state.discovery?.snapshot?.total ?? null,
                checkedAt: state.discovery?.snapshot?.checkedAt ?? null,
                pending: state.discovery?.cycle?.cards.length ?? 0,
                error: state.discovery?.error ?? null,
              },
              index: state.index
                ? {
                    count: state.index.offers.length,
                    checkedAt: state.index.checkedAt,
                    sourceSha256: state.index.sourceSha256,
                  }
                : null,
              matches: state.matches,
              business: state.business,
              published: [
                ...revenuePublications(state),
                ...sitePublications(config, await tx.get('state'), state),
              ],
            });
          if (input.expectedRevision !== state.revision)
            return json({ error: 'revision_conflict' }, 409);
          if (input.action === 'revenue_index')
            state.index = validateOfferIndex(input.index);
          if (input.action === 'revenue_start') state.enabled = true;
          if (input.action === 'revenue_stop') state.enabled = false;
          state.revision++;
          await saveRevenue(tx, state);
          if (state.enabled) await tx.setAlarm(Date.now());
          return json({ revision: state.revision, enabled: state.enabled });
        });
      }
      return await this.ctx.storage.transaction(async (tx) => {
        let state = (await tx.get('state')) || emptyCombinationState(),
          result;
        switch (input.action) {
          case 'status':
            return json({
              enabled: state.enabled,
              revision: state.revision,
              runCount: state.runCount,
              lastRunAt: state.lastRunAt,
              lastError: state.lastError ?? null,
              nextRunAt: state.nextRunAt,
              report: combinationReport(state, config),
              receipts: state.receipts,
              acquisition: acquisitionReport(await tx.get('acquisition')),
              config: config.schemes.map((s) => ({
                id: s.id,
                verdict: combinationVerdict(s),
              })),
            });
          case 'guides':
            return json(
              config.schemes
                .filter(
                  (s) =>
                    s.guideApproved &&
                    state.articles[s.id] &&
                    !SITE_ADAPTERS[s.id],
                )
                .map((s) =>
                  publicCombination({
                    ...s,
                    enabled: state.enabled && s.enabled,
                  }),
                ),
            );
          case 'start':
            state.enabled = true;
            state.nextRunAt = Date.now();
            result = { enabled: true };
            break;
          case 'stop':
            state.enabled = false;
            state.nextRunAt = null;
            await tx.deleteAlarm();
            result = { enabled: false };
            break;
          case 'watchdog':
            if (
              (state.enabled || (await tx.get('revenue'))?.enabled) &&
              !(await tx.getAlarm())
            )
              await tx.setAlarm(Date.now());
            return json({ enabled: state.enabled });
          case 'prepare': {
            const r = prepareCombination(state, config, input.input);
            state = r.state;
            result = r.result;
            break;
          }
          case 'observe': {
            const r = applyCombinationObservation(
              state,
              config,
              input.observation,
            );
            state = r.state;
            result = {
              duplicate: r.duplicate,
              accepted: r.accepted,
              unmatched: r.unmatched,
            };
            break;
          }
          case 'cost': {
            if (
              input.expectedRevision !== state.revision ||
              !config.schemes.some((s) => s.id === input.schemeId) ||
              !Number.isSafeInteger(input.totalYen) ||
              input.totalYen < 0 ||
              input.totalYen > 100000000
            )
              throw new Error('費用の版または金額を確認してください。');
            state.costs[input.schemeId] = input.totalYen;
            state.revision++;
            result = { revision: state.revision };
            break;
          }
          default:
            throw new Error('未対応の操作です。');
        }
        await tx.put('state', state);
        if (state.enabled) await tx.setAlarm(state.nextRunAt || Date.now());
        return json(result);
      });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : '操作できません。' },
        400,
      );
    }
  }
}
function page(title, content, script = '', path = '/') {
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Noah</title><meta name="description" content="使いたいサービスと必要な準備を確認。対応するAgentとサービスの組み合わせを、出典とともに整理します。"><link rel="canonical" href="${ORIGIN}${escape(path)}"><style>body{margin:0;background:#fff;color:#182432;font:16px/1.8 system-ui,sans-serif}header,main,footer{max-width:960px;margin:auto;padding:24px}header{border-bottom:1px solid #ddd}a{color:#174c9c}h1{font-size:clamp(28px,5vw,42px);line-height:1.4}h2{font-size:24px}article,section{border:1px solid #d9e0e7;border-radius:14px;padding:24px;margin:24px 0}label{display:block;margin:18px 0}select,button,input{font:inherit;padding:10px;border:1px solid #a9b6c4;border-radius:7px}button{background:#183f70;color:white;cursor:pointer}button:disabled{opacity:.5}small{color:#4d5c6b}.tag{color:#40516b}.result{white-space:pre-wrap}footer{font-size:14px}nav{display:flex;gap:20px}[hidden]{display:none!important}</style></head><body><header><nav><a href="https://avoado.si/noah">Noah</a><a href="/">サービスの接続準備</a></nav></header><main>${content}</main><footer>申込・契約・支払いは、公式サービスの条件を確認してご自身で判断してください。</footer>${script ? `<script>${script}</script>` : ''}</body></html>`,
    {
      headers: {
        ...common,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );
}
const listPage = (guides) =>
  page(
    'サービスとAgentの接続準備',
    `<h1>使いたいサービスを、<br>動かす準備から。</h1><p>対応する口座・サービス、費用、必要な手順を確認します。条件が揃った紹介だけをご案内します。</p>${guides.map((g) => `<article><small class="tag">${g.state === 'ready' ? '紹介受付中' : '準備ガイド'}</small><h2><a href="/agent/${escape(g.id)}">${escape(g.title)}</a></h2><p>${escape(g.summary)}</p><p>${escape(g.note)}</p></article>`).join('') || '<p>公開準備中です。</p>'}`,
  );
function guidePage(g) {
  return page(
    g.title,
    `<h1>${escape(g.title)}</h1><p>${escape(g.summary)}</p><p class="tag">${escape(g.note)}</p><section><h2>確認すること</h2><ol>${g.preparation.map((s) => `<li>${escape(s)}</li>`).join('')}</ol><ul>${g.exclusions.map((s) => `<li>${escape(s)}</li>`).join('')}</ul></section><section><h2>自分の準備を確認</h2><form id="prepare"><label>目的 <select name="purpose"><option value="compare">情報を比較したい</option><option value="open">必要な新規サービスを検討している</option></select></label><label>対象サービスの口座 <select name="existingAccount"><option value="true">すでに持っている</option><option value="false">まだ持っていない</option></select></label><label>居住地 <select name="region"><option value="jp">日本</option><option value="other">日本以外</option></select></label><label><input name="adult" type="checkbox"> 18歳以上です</label><label><input name="riskUnderstood" type="checkbox"> 費用と損失の可能性を理解し、自分で利用を判断します</label><button>準備票を作る</button></form><div id="result" role="status" class="result"></div><p><a id="referral" hidden rel="sponsored noopener noreferrer" target="_blank">公式サービスで条件を確認する（広告）</a></p></section><section><h2>確認元</h2><ul>${g.references.map((r) => `<li><a href="${escape(r.url)}" rel="noopener noreferrer" target="_blank">${escape(r.note)}</a></li>`).join('')}</ul><small>確認日 ${escape(g.checkedAt.slice(0, 10))}</small></section>`,
    `const form=document.querySelector('#prepare'),out=document.querySelector('#result'),link=document.querySelector('#referral');form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;link.hidden=true;out.textContent='確認しています…';try{const d=new FormData(form);const r=await fetch('/api/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemeId:${JSON.stringify(g.id)},purpose:d.get('purpose'),existingAccount:d.get('existingAccount')==='true',region:d.get('region'),adult:d.has('adult'),riskUnderstood:d.has('riskUnderstood'),campaign:'guide-'+${JSON.stringify(g.id)}})});const v=await r.json();if(!r.ok)throw new Error(v.error);out.textContent=v.steps.map((x,i)=>(i+1)+'. '+x).join('\\n')+'\\n\\n'+v.nextAction;if(v.referralUrl){link.href=v.referralUrl;link.hidden=false}}catch(e){out.textContent=e.message||'もう一度お試しください。'}finally{button.disabled=false}});`,
    '/agent/' + g.id,
  );
}
const toolsList = [
  {
    name: 'list_service_combinations',
    description: '公開中の組み合わせと準備状態・出典を取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'prepare_service_connection',
    description:
      '公開根拠のあるサービスとAgentの対応・費用・準備条件を整理します。投資判断、口座開設、売買は実行しません。',
    inputSchema: {
      type: 'object',
      properties: {
        schemeId: { type: 'string' },
        purpose: { type: 'string', enum: ['compare', 'open'] },
        region: { type: 'string', enum: ['jp', 'other'] },
        adult: { type: 'boolean' },
        existingAccount: { type: 'boolean' },
        riskUnderstood: { type: 'boolean' },
      },
      required: [
        'schemeId',
        'purpose',
        'region',
        'adult',
        'existingAccount',
        'riskUnderstood',
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url),
      stub = env.COMBINATIONS.get(env.COMBINATIONS.idFromName('owner'));
    const call = (action, input = {}) =>
      stub.fetch('https://internal/', {
        method: 'POST',
        body: JSON.stringify({ action, ...input }),
      });
    try {
      if (url.pathname === '/operations/api') {
        if (!(await authorized(request, env.OPERATIONS_TOKEN)))
          return json({ error: 'Unauthorized' }, 401);
        if (request.method !== 'POST')
          return json({ error: 'POST required' }, 405);
        const v = await body(request);
        if (
          ![
            'status',
            'start',
            'stop',
            'observe',
            'cost',
            'revenue_status',
            'revenue_index',
            'revenue_start',
            'revenue_stop',
            'revenue_sync',
          ].includes(v.action)
        )
          return json({ error: 'Unknown action' }, 400);
        return call(v.action, v);
      }
      const entryMatch =
        /^\/start\/(wordpress-maintenance|ec-production)$/.exec(url.pathname);
      if (entryMatch && ['GET', 'HEAD'].includes(request.method)) {
        const response = await call('acquisition', {
          schemeId: entryMatch[1],
          source: acquisitionSource(url.searchParams.get('source')),
          count: isAcquisitionNavigation(request),
        });
        if (!response.ok) return response;
        const destination = (await response.json()).url;
        return new Response(null, {
          status: 302,
          headers: {
            ...common,
            Location: destination,
            'X-Robots-Tag': 'noindex',
          },
        });
      }
      const siteMatch =
        /^\/(?:consult\/site\/([a-z-]+)\/mcp|api\/diagnose\/([a-z-]+)|agent\/([a-z-]+))$/.exec(
          url.pathname,
        );
      const siteId =
        siteMatch && (siteMatch[1] || siteMatch[2] || siteMatch[3]);
      if (siteId && SITE_ADAPTERS[siteId]) {
        if (
          request.headers.has('origin') &&
          ![url.origin, 'https://avoado.si'].includes(
            request.headers.get('origin'),
          )
        )
          return json({ error: 'Origin not allowed' }, 403);
        const publications = await (await call('revenue_public')).json();
        if (!publications.items?.some((x) => x.id === 'noah-' + siteId))
          return json({ error: '条件を確認中です。' }, 503);
        if (siteMatch[3] && request.method === 'GET')
          return diagnosticPage(siteId, page);
        if (request.method !== 'POST')
          return json({ error: 'POST required' }, 405);
        const v = await body(request);
        if (siteMatch[2])
          return call('diagnose', { schemeId: siteId, input: v });
        const ok = (result) =>
          json({ jsonrpc: '2.0', id: v.id ?? null, result });
        if (v.method === 'initialize')
          return ok({
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'noah-' + siteId, version: '1.0.0' },
          });
        if (v.method === 'notifications/initialized')
          return new Response(null, { status: 202 });
        if (v.method === 'tools/list') return ok({ tools: [siteTool(siteId)] });
        if (
          v.method === 'tools/call' &&
          v.params?.name === siteTool(siteId).name
        ) {
          const r = await call('diagnose', {
            schemeId: siteId,
            input: v.params.arguments,
          });
          const result = await r.json();
          return ok({
            content: [
              {
                type: 'text',
                text: r.ok ? siteReportText(result) : result.error,
              },
            ],
            ...(r.ok ? { structuredContent: result } : {}),
            isError: !r.ok,
          });
        }
        return json(
          {
            jsonrpc: '2.0',
            id: v.id ?? null,
            error: { code: -32601, message: 'Method not found' },
          },
          400,
        );
      }
      if (request.method === 'GET' && url.pathname === '/api/revenue')
        return call('revenue_public');
      if (request.method === 'GET' && url.pathname === '/robots.txt')
        return new Response(
          'User-agent: *\nAllow: /\nDisallow: /operations\nSitemap: ' +
            ORIGIN +
            '/sitemap.xml\n',
          { headers: { 'Content-Type': 'text/plain' } },
        );
      if (
        (request.method === 'GET' &&
          ['/', '/api/catalog', '/sitemap.xml'].includes(url.pathname)) ||
        (request.method === 'GET' && url.pathname.startsWith('/agent/'))
      ) {
        const guides = await (await call('guides')).json();
        if (Array.isArray(guides)) {
          const publication = await (await call('revenue_public')).json();
          for (const row of publication.items ?? []) {
            const id = row.id.replace(/^noah-/, '');
            if (SITE_ADAPTERS[id])
              guides.push({
                id,
                title: row.title,
                summary: row.summary,
                state: 'ready',
                note: '公開サイトを実診断し、希望者へ広告を含む相談先をご案内します。',
              });
          }
        }
        if (!Array.isArray(guides))
          return json({ error: 'Service unavailable' }, 503);
        if (url.pathname === '/') return listPage(guides);
        if (url.pathname === '/api/catalog') return json({ items: guides });
        if (url.pathname === '/sitemap.xml')
          return new Response(
            '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
              ['/', ...guides.map((g) => '/agent/' + g.id)]
                .map((p) => '<url><loc>' + ORIGIN + p + '</loc></url>')
                .join('') +
              '</urlset>',
            { headers: { 'Content-Type': 'application/xml' } },
          );
        const g = guides.find((g) => url.pathname === '/agent/' + g.id);
        return g ? guidePage(g) : json({ error: 'Not found' }, 404);
      }
      if (
        request.method === 'POST' &&
        ['/api/prepare', '/consult/mcp'].includes(url.pathname) &&
        request.headers.has('origin') &&
        ![url.origin, 'https://avoado.si'].includes(
          request.headers.get('origin'),
        )
      )
        return json({ error: 'Origin not allowed' }, 403);
      if (url.pathname === '/api/prepare' && request.method === 'POST')
        return call('prepare', { input: await body(request) });
      if (url.pathname === '/consult/mcp' && request.method === 'POST') {
        const v = await body(request),
          id = v.id ?? null,
          ok = (result) => json({ jsonrpc: '2.0', id, result });
        if (v.method === 'initialize')
          return ok({
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'noah-service-combinations', version: '1.0.0' },
          });
        if (v.method === 'notifications/initialized')
          return new Response(null, { status: 202 });
        if (v.method === 'tools/list') return ok({ tools: toolsList });
        if (
          v.method === 'tools/call' &&
          v.params?.name === 'list_service_combinations'
        ) {
          const r = await call('guides');
          return ok({
            content: [{ type: 'text', text: JSON.stringify(await r.json()) }],
            isError: !r.ok,
          });
        }
        if (
          v.method === 'tools/call' &&
          v.params?.name === 'prepare_service_connection'
        ) {
          const r = await call('prepare', { input: v.params.arguments }),
            data = await r.json();
          return ok({
            content: [{ type: 'text', text: JSON.stringify(data) }],
            isError: !r.ok,
          });
        }
        return json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: 'Method not found' },
          },
          400,
        );
      }
      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: '設定または入力を確認してください。' }, 400);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      env.COMBINATIONS.get(env.COMBINATIONS.idFromName('owner')).fetch(
        'https://internal/',
        { method: 'POST', body: JSON.stringify({ action: 'watchdog' }) },
      ),
    );
  },
};

export default worker;
