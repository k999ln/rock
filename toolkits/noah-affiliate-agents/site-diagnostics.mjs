import {
  prepareProviderMcp,
  callProviderMcp,
} from '../../lib/noah-provider-mcp.ts';
import { noahPublicUrl } from '../../lib/noah-agent-upload.ts';
import {
  combinationVerdict,
  validRegisteredArticle,
} from './combination-core.mjs';

export const SITE_ADAPTERS = Object.freeze({
  'wordpress-maintenance': {
    name: 'WordPressの診断と保守相談',
    tool: 'diagnose_wordpress_site',
    provider: 'Bot Appétit',
    endpoint: 'https://botappetit.ai/mcp',
    operation: 'scan_page',
    limit: 20,
    summary:
      '公開ページを診断し、保守で確認したいことを整理。希望に合う場合に広告を含む相談先をご案内します。',
  },
  'ec-production': {
    name: 'ECサイトの診断と制作準備',
    tool: 'diagnose_ec_site',
    provider: 'AgenticCart',
    endpoint: 'https://agenticcart.ai/mcp',
    operation: 'check_store_readiness',
    limit: 8,
    summary:
      '公開サイトの読み取りやすさを診断し、EC制作・改修の依頼事項を整理。希望者へ広告を含む見積もり先をご案内します。',
  },
});
export const SITE_ORIGIN =
  'https://noah-revenue-agents.mr-kirin999.workers.dev';
export function siteTool(id) {
  const a = SITE_ADAPTERS[id];
  if (!a) return null;
  const wp = id === 'wordpress-maintenance';
  return {
    name: a.tool,
    description: `${a.name}。公開ホームページのURLを${a.provider}へ送ります。${wp ? '診断とURLは提供元の公開履歴に残り、Google PageSpeed/Safe Browsingでも確認されます。' : '無料の診断範囲のみ使用します。'}Noahでは依頼・結果を自分の保存先に保存し、診断Workerは公開診断結果を最大24時間キャッシュします。広告主への申込は送信しません。`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: {
          type: 'string',
          title: '公開ホームページのURL（HTTPS・トップページ）',
        },
        authorizedSite: {
          type: 'boolean',
          title: '自分のサイト、または管理者から診断を許可されたサイトです',
        },
        publicScanConsent: {
          type: 'boolean',
          title: `${a.provider}へのURL送信${wp ? '・公開レポートとGoogleでの確認' : ''}を理解しています`,
        },
        ...(wp
          ? {
              usesWordPress: {
                type: 'boolean',
                title: '対象サイトはWordPressで運用しています',
              },
              needsMaintenance: {
                type: 'boolean',
                title: '更新・監視・バックアップなどの保守を相談したいです',
              },
            }
          : {
              project: {
                type: 'string',
                title: '今回の目的',
                enum: ['診断のみ', 'ECサイトの新設', 'ECサイトの改修'],
              },
            }),
        firstInquiry: {
          type: 'boolean',
          title: '紹介先への同じ相談・申込は初めてです',
        },
        wantsConsultation: {
          type: 'boolean',
          title: '広告を含む相談先の案内を希望します',
        },
      },
      required: [
        'url',
        'authorizedSite',
        'publicScanConsent',
        ...(wp ? ['usesWordPress', 'needsMaintenance'] : ['project']),
        'firstInquiry',
        'wantsConsultation',
      ],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  };
}
export function siteInput(id, v) {
  const schema = siteTool(id)?.inputSchema;
  if (
    !schema ||
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !Object.hasOwn(schema.properties, k)) ||
    schema.required.some((k) => !Object.hasOwn(v, k))
  )
    throw Error('入力項目を確認してください。');
  for (const [key, def] of Object.entries(schema.properties)) {
    if (typeof v[key] !== def.type || (def.enum && !def.enum.includes(v[key])))
      throw Error('入力の形式を確認してください。');
  }
  if (!v.authorizedSite || !v.publicScanConsent)
    throw Error('所有・診断許可と外部への公開URL送信を確認してください。');
  const u = new URL(noahPublicUrl(v.url));
  if (
    u.pathname !== '/' ||
    u.port ||
    /(?:^|\.)(?:home|corp|intranet|localdomain|nip\.io|sslip\.io)$/.test(
      u.hostname,
    )
  )
    throw Error(
      '公開ホームページのHTTPS URLを入力してください。認証付き・内部向けURLは使えません。',
    );
  return { ...v, url: u.href };
}
export function siteEvidenceReady(s, now = Date.now()) {
  const a = SITE_ADAPTERS[s?.id],
    p = s?.execution;
  return (
    !!a &&
    p?.provider === a.endpoint &&
    p?.operation === a.operation &&
    /^[a-f0-9]{64}$/.test(p?.toolDigest ?? '') &&
    p?.verified === true &&
    Number.isFinite(Date.parse(p.checkedAt)) &&
    Date.parse(p.checkedAt) <= now &&
    now - Date.parse(p.checkedAt) < 7 * 86400000
  );
}
export function siteReady(s, state, pipeline, now = Date.now()) {
  return (
    state?.enabled === true &&
    pipeline?.enabled === true &&
    SITE_ADAPTERS[s?.id] &&
    s?.guideApproved === true &&
    combinationVerdict(s, now).state === 'ready' &&
    validRegisteredArticle(s) &&
    siteEvidenceReady(s, now) &&
    pipeline.index?.offers.some(
      (o) => o.id === s.offer.id && o.partnered === true,
    ) &&
    Date.parse(pipeline.index.checkedAt) <= now &&
    now - Date.parse(pipeline.index.checkedAt) < 86400000
  );
}
export function sitePublications(config, state, pipeline, now = Date.now()) {
  if (
    !Number.isFinite(Date.parse(state?.lastRunAt)) ||
    Date.parse(state.lastRunAt) > now ||
    now - Date.parse(state.lastRunAt) > 30 * 60000
  )
    return [];
  return config.schemes
    .filter((s) => siteReady(s, state, pipeline, now))
    .map((s) => ({
      id: 'noah-' + s.id,
      origin: 'first_party',
      title: SITE_ADAPTERS[s.id].name,
      summary: SITE_ADAPTERS[s.id].summary,
      url: SITE_ORIGIN + '/agent/' + s.id,
      mcp: SITE_ORIGIN + '/consult/site/' + s.id + '/mcp',
      checkedAt: new Date(now).toISOString(),
      attribution: 'registered_media',
      approval: 'external_observation_only',
    }));
}
const jpChecks = {
  'single-h1': 'ページの主見出しを確認する',
  'jsonld-present': '構造化データの必要性を確認する',
  'organization-schema': '運営者情報の構造化を確認する',
  'content-in-html': 'JavaScriptなしでも主要内容を読めるか確認する',
  title: 'ページタイトルを確認する',
  'meta-description': 'ページ説明を確認する',
  https: 'HTTPS接続を確認する',
  'http-status': 'ページへのアクセス結果を確認する',
  'mixed-content': '画像などにHTTP読み込みが混ざっていないか確認する',
  'robots-txt': '検索エンジンのアクセス設定を確認する',
  canonical: '正規URLを確認する',
};
export function siteResult(id, input, raw, checkedAt) {
  if (!raw || typeof raw.text !== 'string' || raw.truncated || !raw.text.trim())
    throw Error('完全な診断結果を取得できませんでした。');
  const a = SITE_ADAPTERS[id];
  let findings, sourceUrl;
  if (id === 'wordpress-maintenance') {
    const start = raw.text.indexOf('{');
    let data;
    try {
      data = JSON.parse(raw.text.slice(start));
    } catch {
      throw Error('診断結果の形式が変わりました。');
    }
    if (
      data.blocked !== false ||
      !Array.isArray(data.checks) ||
      new URL(data.url).hostname !== new URL(input.url).hostname ||
      !/^[a-f0-9-]{36}$/.test(data.scan_id)
    )
      throw Error('対象ページを診断できませんでした。');
    findings = data.checks
      .filter(
        (c) =>
          Object.hasOwn(jpChecks, c.id) && ['warn', 'fail'].includes(c.status),
      )
      .slice(0, 10)
      .map((c) => ({
        item: jpChecks[c.id],
        status: c.status === 'fail' ? '要確認' : '確認推奨',
      }));
    sourceUrl = 'https://botappetit.ai/r/' + data.scan_id;
  } else {
    const matched = /^Analyzed: (https:\/\/\S+)/m.exec(raw.text);
    if (
      !matched ||
      new URL(matched[1]).hostname !== new URL(input.url).hostname ||
      !/^Score: \d+\/100/m.test(raw.text)
    )
      throw Error('対象ページの診断結果を確認できませんでした。');
    // Free result only. External prose is data, never an instruction or a paid upgrade.
    findings = raw.text
      .split('\n')
      .filter((l) => l.startsWith('- **'))
      .slice(0, 12)
      .map((l) => ({
        item: l.replace(/^- \*\*([^*]+)\*\*.*/, '$1').slice(0, 160),
        status: '提供元の無料レポートを参照',
      }));
    sourceUrl = 'https://agenticcart.ai/mcp-server';
  }
  return {
    title: a.name,
    checkedAt,
    provider: a.provider,
    sourceUrl,
    target: input.url,
    findings,
    preparation:
      id === 'wordpress-maintenance'
        ? [
            '使用中のWordPress・テーマ・プラグインと更新担当を整理する。',
            'バックアップの保存先と復旧手順、必要な監視時間を確認する。',
            '診断は公開ページの確認です。内部の脆弱性やバックアップ不備を断定しません。',
          ]
        : [
            '扱う商品、決済・配送、在庫連携、希望時期・予算をまとめる。',
            '現在のサイトから残したいページと、制作会社へ依頼する範囲を整理する。',
            '無料診断は公開情報の範囲です。有料の修正案を取得したものではありません。',
          ],
    referralUrl: null,
    nextAction: '診断結果と実際の運用状況を合わせて確認してください。',
  };
}
export async function executeSiteDiagnosis(
  s,
  input,
  { fetcher = fetch, now = Date.now() } = {},
) {
  input = siteInput(s.id, input);
  const a = SITE_ADAPTERS[s.id];
  if (!siteEvidenceReady(s, now)) throw Error('診断接続の再確認が必要です。');
  const plan = await prepareProviderMcp(a.endpoint, fetcher),
    endpoint = plan.endpoints.find((e) => e.name === a.operation);
  if (!endpoint || endpoint.toolDigest !== s.execution.toolDigest)
    throw Error('診断の定義が変わりました。接続の再確認が必要です。');
  const raw = await callProviderMcp(
    a.endpoint,
    endpoint,
    { url: input.url },
    fetcher,
    undefined,
    async () => true,
    () => {},
  );
  return siteResult(s.id, input, raw, new Date(now).toISOString());
}
export function completeSiteDiagnosis(
  s,
  input,
  report,
  { state, pipeline, now = Date.now(), uuid = crypto.randomUUID() },
) {
  const result = structuredClone(report),
    eligible =
      input.firstInquiry &&
      input.wantsConsultation &&
      (s.id === 'wordpress-maintenance'
        ? input.usesWordPress && input.needsMaintenance
        : ['ECサイトの新設', 'ECサイトの改修'].includes(input.project));
  result.eligible = !!eligible;
  if (eligible && siteReady(s, state, pipeline, now)) {
    result.referralUrl = s.registeredArticle.url;
    result.nextAction =
      '広告を含む登録ブログで相談内容・条件を確認し、希望する場合だけ公式サイトでご自身で申し込んでください。';
  }
  const record = {
    id: uuid,
    schemeId: s.id,
    at: new Date(now).toISOString(),
    referralIssued: !!result.referralUrl,
  };
  return { result, record };
}
