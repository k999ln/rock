import {
  BUSINESS_FIELDS,
  BUSINESS_REQUIRED,
  prepareBusinessBrief,
  validateBusinessConfig,
  businessBlockers,
  withTracking,
} from './business-core.mjs';
import {
  businessPage,
  operationsPage,
  businessGuidePage,
} from './business-view.mjs';
export { BusinessLedger } from './business-store.mjs';
const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};
const json = (body, status = 200) => Response.json(body, { status, headers });
async function read(request) {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new Error('JSONで指定してください。');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('入力がありません。');
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 196608) {
        await reader.cancel();
        throw new Error('入力の上限です。');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let off = 0;
  for (const p of parts) {
    data.set(p, off);
    off += p.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}
async function auth(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const raw = request.headers.get('authorization') || '';
  if (raw.length > 512) return false;
  const dig = async (x) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)),
    );
  const [a, b] = await Promise.all([dig(raw), dig('Bearer ' + secret)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
const briefTool = {
  name: 'prepare_business_training',
  description:
    '法人の業務を棚卸しし、現状時間の計算と研修相談票を返します。会員登録不要。社名・メール・秘密情報は入力しないでください。本文は保存せず、匿名の利用・紹介識別子のみ記録します。',
  inputSchema: {
    type: 'object',
    properties: BUSINESS_FIELDS,
    required: BUSINESS_REQUIRED,
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
const operationTools = [
  {
    name: 'report',
    description: '承認・保留・否認・支払・銀行照合と費用を分けて確認します。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'export_ledger',
    description:
      '本人用台帳をJSONとして書き出します。相談本文・銀行口座番号は含みません。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'apply_import',
    description:
      '本人が確認した必要列だけの実績を版付き・重複排除で保存します。送金やASP側の変更は行いません。',
    inputSchema: {
      type: 'object',
      properties: {
        commandJson: { type: 'string', title: '確認済み取込JSON' },
      },
      required: ['commandJson'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'campaign_draft',
    description: '許可状況と集客用の原稿・流入URLを返します。投稿はしません。',
    inputSchema: {
      type: 'object',
      properties: { campaign: { type: 'string', title: 'キャンペーンID' } },
      required: ['campaign'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agent_control',
    description:
      '継続実行の開始・停止・工程状況を管理します。未接続のASP/銀行を自動化済みとは表示しません。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'start', 'stop'] },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
const internal = (env, v) =>
  env.BUSINESS_LEDGER.get(env.BUSINESS_LEDGER.idFromName('owner')).fetch(
    'https://internal/',
    { method: 'POST', body: JSON.stringify(v) },
  );
async function brief(input, config, env, channel) {
  const result = prepareBusinessBrief(input),
    leadId = crypto.randomUUID().replaceAll('-', ''),
    uix = 'nb.' + leadId;
  const permitted =
    result.eligible && !businessBlockers(config, channel).length;
  const recorded = await internal(env, {
    kind: 'lead',
    leadId,
    uix,
    campaign: result.campaign,
    eligible: result.eligible,
    referralIssued: permitted,
  });
  const tracked = recorded.ok;
  const ready = tracked && permitted;
  const referralUrl = ready ? withTracking(config.affiliateUrl, uix) : null;
  const next = ready
    ? `広告：${config.publicName}\n${config.publicDescription}\n相談はご自身の意思で公式フォームからお申し込みください。研修の契約・費用は別です。\n${referralUrl}`
    : result.eligible
      ? '相談票は完成しました。紹介先への案内は準備中です。申込せずこの整理票を利用できます。'
      : '対象と希望に合わせて、この整理票から次の進め方を検討してください。';
  return {
    schema: result.schema,
    text: result.text + '\n\n' + next,
    eligible: result.eligible,
    referralAvailable: ready,
    referralUrl,
    trackingRecorded: tracked,
    consultationId: tracked ? uix : null,
    hoursPerMonth: result.hoursPerMonth,
    estimatedCurrentCostYen: result.estimatedCurrentCostYen,
  };
}
function html(text) {
  return new Response(text, {
    headers: {
      ...headers,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}
export async function handleBusiness(request, env) {
  const u = new URL(request.url),
    path = u.pathname,
    owner = path.startsWith('/operations/'),
    origin = request.headers.get('origin');
  if (origin && origin !== u.origin && origin !== env.NOAH_ORIGIN)
    return json({ error: '同じ画面から操作してください。' }, 403);
  if (path === '/health')
    return json({
      service: 'noah-business-si',
      version: '1.0.0',
      publicConsultation: true,
    });
  if (path === '/manifest.json')
    return json({
      schema: 'noah-agent/1',
      id: 'business-si-readiness',
      version: '1.0.0',
      name: '法人のsi導入準備',
      summary:
        '会員登録なしで業務を整理し、現状時間の計算・研修の相談票を受け取れます。',
      author: 'Noah',
      license: 'Private',
      sourceUrl: null,
      adapter: 'web',
      endpointUrl: u.origin + '/',
      permissions: ['read_input', 'network'],
      priceNote:
        '相談票の作成は無料。紹介先の研修契約・料金は別です。広告を含む場合があります。',
    });
  if (path === '/' && request.method === 'GET')
    return html(businessPage(u.origin));
  if (
    (path === '/guides' || /^\/guides\/[a-z]+$/.test(path)) &&
    request.method === 'GET'
  ) {
    const r = await internal(env, { kind: 'articles' }),
      v = await r.json();
    const selected =
      path === '/guides'
        ? null
        : v.articles.find((x) => x.id === path.split('/')[2]);
    if (path !== '/guides' && !selected)
      return json({ error: 'not_found' }, 404);
    return html(businessGuidePage(v.articles, selected, u.origin));
  }
  if (request.method === 'GET' && path === '/robots.txt')
    return new Response(
      'User-agent: *\nAllow: /\nDisallow: /operations\nDisallow: /consult/\nDisallow: /brief\nSitemap: ' +
        u.origin +
        '/sitemap.xml\n',
      { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } },
    );
  if (request.method === 'GET' && path === '/sitemap.xml') {
    const r = await internal(env, { kind: 'articles' });
    const v = await r.json();
    const escape = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;',
          })[c],
      );
    const pages = [
      { path: '/' },
      { path: '/guides' },
      ...v.articles.map((a) => ({
        path: '/guides/' + a.id,
        date: a.updatedOn,
      })),
    ];
    const body =
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      pages
        .map(
          (p) =>
            '<url><loc>' +
            escape(u.origin + p.path) +
            '</loc>' +
            (p.date ? '<lastmod>' + escape(p.date) + '</lastmod>' : '') +
            '</url>',
        )
        .join('') +
      '</urlset>';
    return new Response(body, {
      headers: { ...headers, 'content-type': 'application/xml; charset=utf-8' },
    });
  }
  if (path === '/operations' && request.method === 'GET')
    return html(operationsPage());
  if (owner && !(await auth(request, env.OPERATIONS_TOKEN)))
    return json({ error: '運営用の鍵を確認してください。' }, 401);
  let config;
  try {
    config = validateBusinessConfig(JSON.parse(env.BUSINESS_CONFIG_JSON));
  } catch {
    return json({ error: 'サービスの設定を確認中です。' }, 503);
  }
  if (request.method !== 'POST')
    return json({ error: 'POSTで操作してください。' }, 405);
  try {
    const body = await read(request);
    if (path === '/brief') return json(await brief(body, config, env, 'web'));
    if (path === '/operations/api') {
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('操作を確認してください。');
      let message;
      if (body.action === 'report' && Object.keys(body).length === 1)
        message = { kind: 'report', config };
      else if (
        body.action === 'source_status' &&
        Object.keys(body).length === 1
      )
        message = { kind: 'source_status' };
      else if (
        body.action === 'source_observation' &&
        Object.keys(body).length === 2
      )
        message = {
          kind: 'source_observation',
          observation: body.observation,
          config,
        };
      else if (
        ['agent_status', 'agent_start', 'agent_stop'].includes(body.action) &&
        Object.keys(body).length === 1
      )
        message = { kind: body.action };
      else if (body.action === 'export' && Object.keys(body).length === 1)
        message = { kind: 'snapshot' };
      else if (body.action === 'command' && Object.keys(body).length === 2)
        message = { kind: 'command', command: body.command, config };
      else if (body.action === 'draft' && Object.keys(body).length === 2)
        message = { kind: 'draft', id: body.campaign, config };
      else throw new Error('操作の形式を確認してください。');
      const r = await internal(env, message);
      return json(await r.json(), r.status);
    }
    if (!['/consult/mcp', '/operations/mcp'].includes(path))
      return json({ error: 'not_found' }, 404);
    if (
      !body ||
      body.jsonrpc !== '2.0' ||
      typeof body.method !== 'string' ||
      (body.id !== undefined &&
        typeof body.id !== 'string' &&
        !Number.isFinite(body.id))
    )
      return json(
        {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid request' },
        },
        400,
      );
    if (body.id === undefined)
      return new Response(null, { status: 202, headers });
    const result = (x) => json({ jsonrpc: '2.0', id: body.id, result: x });
    if (body.method === 'initialize')
      return result({
        protocolVersion: [
          '2025-11-25',
          '2025-06-18',
          '2025-03-26',
          '2024-11-05',
        ].includes(body.params?.protocolVersion)
          ? body.params.protocolVersion
          : '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: {
          name: owner ? 'noah-business-operations' : 'noah-business-si',
          version: '1.0.0',
        },
      });
    if (body.method === 'ping') return result({});
    if (body.method === 'tools/list')
      return result({ tools: owner ? operationTools : [briefTool] });
    if (body.method !== 'tools/call')
      return json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: 'Method not found' },
      });
    const { name, arguments: args } = body.params || {};
    let output;
    try {
      if (!owner && name === 'prepare_business_training')
        output = await brief(args, config, env, 'chat');
      else if (
        owner &&
        ['report', 'export_ledger'].includes(name) &&
        args &&
        Object.keys(args).length === 0
      ) {
        const r = await internal(env, {
          kind: name === 'report' ? 'report' : 'snapshot',
          config,
        });
        output = await r.json();
      } else if (
        owner &&
        name === 'apply_import' &&
        args &&
        Object.keys(args).length === 1 &&
        typeof args.commandJson === 'string'
      ) {
        const r = await internal(env, {
          kind: 'command',
          command: JSON.parse(args.commandJson),
          config,
        });
        output = await r.json();
        if (!r.ok) throw new Error(output.error);
      } else if (
        owner &&
        name === 'campaign_draft' &&
        args &&
        Object.keys(args).length === 1 &&
        typeof args.campaign === 'string'
      ) {
        const r = await internal(env, {
          kind: 'draft',
          id: args.campaign,
          config,
        });
        output = await r.json();
        if (!r.ok) throw new Error(output.error);
      } else if (
        owner &&
        name === 'agent_control' &&
        args &&
        Object.keys(args).length === 1 &&
        ['status', 'start', 'stop'].includes(args.action)
      ) {
        const r = await internal(env, { kind: 'agent_' + args.action });
        output = await r.json();
        if (!r.ok) throw new Error(output.error);
      } else throw new Error('この接続では使えない操作です。');
      return result({
        content: [
          {
            type: 'text',
            text: !owner ? output.text : JSON.stringify(output, null, 2),
          },
        ],
        isError: false,
      });
    } catch (e) {
      return result({
        content: [
          {
            type: 'text',
            text:
              owner && e instanceof Error
                ? e.message
                : '入力内容を確認してください。処理は完了していません。',
          },
        ],
        isError: true,
      });
    }
  } catch (e) {
    return json(
      {
        error:
          owner && e instanceof Error
            ? e.message
            : '入力内容を確認してください。処理は完了していません。',
      },
      400,
    );
  }
}
const worker = {
  fetch: handleBusiness,
  scheduled: async (_event, env) => {
    await internal(env, { kind: 'agent_watchdog' });
  },
};
export default worker;
