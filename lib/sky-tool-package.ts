import {
  SKY_CONNECTION_TYPES,
  SKY_EXECUTION_TARGETS,
  SKY_PERMISSIONS,
  SKY_PRICING,
  SkySubmissionError,
  type SkyConnectionType,
  type SkyExecutionTarget,
  type SkyPermission,
  type SkyPricing,
} from './sky-submission.ts';

export const SKY_TOOL_PACKAGE_SCHEMA = 'sky-tool-package/1' as const;
export const SKY_TOOL_SOURCE_KINDS = [
  'inline_code',
  'github',
  'openapi',
  'mcp',
  'rock_package',
] as const;
export const SKY_TOOL_CONNECTIVITY = ['offline', 'online', 'hybrid'] as const;
export const SKY_TOOL_SIDE_EFFECTS = [
  'none',
  'local_write',
  'external_write',
  'financial',
] as const;
export const SKY_TOOL_CONFIRMATION = [
  'never',
  'first_use',
  'per_run',
] as const;

export type JsonObject = Record<string, unknown>;
export type SkyToolSourceKind = (typeof SKY_TOOL_SOURCE_KINDS)[number];
export type SkyToolConnectivity = (typeof SKY_TOOL_CONNECTIVITY)[number];
export type SkyToolSideEffect = (typeof SKY_TOOL_SIDE_EFFECTS)[number];
export type SkyToolConfirmation = (typeof SKY_TOOL_CONFIRMATION)[number];

export type SkyToolPackage = {
  schema: typeof SKY_TOOL_PACKAGE_SCHEMA;
  id: string;
  version: string;
  name: string;
  summary: string;
  developer: {
    id: string;
    displayName: string;
    supportUrl: string | null;
  };
  source: {
    kind: SkyToolSourceKind;
    url: string | null;
    license: string;
  };
  llm: {
    purpose: string;
    useWhen: string[];
    doNotUseWhen: string[];
  };
  io: {
    inputSchema: JsonObject;
    outputSchema: JsonObject;
  };
  adapter: {
    connectionType: SkyConnectionType;
    endpointUrl: string | null;
  };
  capabilities: {
    connectivity: SkyToolConnectivity;
    executionTargets: SkyExecutionTarget[];
    permissions: SkyPermission[];
    sideEffects: SkyToolSideEffect[];
  };
  pricing: {
    model: SkyPricing;
    note: string;
    developerRecipientId: string;
  };
  execution: {
    timeoutSeconds: number;
    maxAttempts: number;
    idempotency: 'required' | 'not_supported' | 'not_needed';
    confirmation: SkyToolConfirmation;
  };
  verification: {
    method: 'read_after_write' | 'response_schema' | 'manual';
    successCondition: string;
  };
  tests: Array<{
    name: string;
    kind: 'valid_input' | 'invalid_input' | 'timeout' | 'duplicate';
  }>;
  fund: {
    categories: string[];
    tags: string[];
  };
  generation: {
    generatedBy: 'rock-studio/1';
    reviewRequired: string[];
  };
  rightsConfirmed: true;
};

export type SkyToolDraftInput = {
  sourceKind: SkyToolSourceKind;
  sourceUrl?: string;
  fileName?: string;
  name?: string;
  summary?: string;
  developerName?: string;
  developerId?: string;
  version?: string;
  license?: string;
  supportUrl?: string;
  openApi?: unknown;
};

const packageKeys = [
  'schema',
  'id',
  'version',
  'name',
  'summary',
  'developer',
  'source',
  'llm',
  'io',
  'adapter',
  'capabilities',
  'pricing',
  'execution',
  'verification',
  'tests',
  'fund',
  'generation',
  'rightsConfirmed',
] as const;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SkySubmissionError(`${label}の形式を確認してください。`);
  return value as JsonObject;
}

function exactObject(value: unknown, keys: readonly string[], label: string) {
  const result = object(value, label);
  if (
    Object.keys(result).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in result))
  )
    throw new SkySubmissionError(`${label}に不足または未対応の項目があります。`);
  return result;
}

function string(value: unknown, label: string, min = 1, max = 500) {
  if (typeof value !== 'string')
    throw new SkySubmissionError(`${label}を入力してください。`);
  const normalized = value.trim();
  let hasControlCharacter = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 32 || code === 127) hasControlCharacter = true;
  }
  if (normalized.length < min || normalized.length > max || hasControlCharacter)
    throw new SkySubmissionError(`${label}を${min}〜${max}文字で入力してください。`);
  return normalized;
}

function httpsUrl(value: unknown, label: string, required = true) {
  if ((value === null || value === '') && !required) return null;
  const raw = string(value, label, 8, 500);
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    )
      throw new Error('unsafe');
    return parsed.toString();
  } catch {
    throw new SkySubmissionError(
      `${label}は認証情報を含まないHTTPS URLにしてください。`,
    );
  }
}

function choice<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number]))
    throw new SkySubmissionError(`${label}を選んでください。`);
  return value as T[number];
}

function stringList(
  value: unknown,
  label: string,
  min = 1,
  max = 12,
) {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max ||
    value.some((item) => typeof item !== 'string')
  )
    throw new SkySubmissionError(`${label}を確認してください。`);
  const result = value.map((item) => string(item, label, 1, 240));
  if (new Set(result).size !== result.length)
    throw new SkySubmissionError(`${label}を重複なく入力してください。`);
  return result;
}

function enumList<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
) {
  const result = stringList(value, label, 1, allowed.length);
  if (result.some((item) => !allowed.includes(item as T[number])))
    throw new SkySubmissionError(`${label}に未対応の値があります。`);
  return result as T[number][];
}

function integer(value: unknown, label: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new SkySubmissionError(`${label}を${min}〜${max}の整数にしてください。`);
  return value as number;
}

function jsonSchema(value: unknown, label: string) {
  const schema = object(value, label);
  if (schema.type !== 'object')
    throw new SkySubmissionError(`${label}.typeはobjectにしてください。`);
  return schema;
}

function developerId(value: unknown) {
  const id = string(value, '開発者ID', 3, 100);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id))
    throw new SkySubmissionError(
      '開発者IDは英小文字・数字と区切り記号で入力してください。',
    );
  return id;
}

export function parseSkyToolPackage(value: unknown): SkyToolPackage {
  const root = exactObject(value, packageKeys, 'Tool Package');
  if (root.schema !== SKY_TOOL_PACKAGE_SCHEMA)
    throw new SkySubmissionError('未対応のTool Package版です。');
  const id = string(root.id, 'Tool ID', 3, 140);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id))
    throw new SkySubmissionError('Tool IDは逆ドメイン形式にしてください。');
  const version = string(root.version, '版', 5, 64);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new SkySubmissionError('版は1.0.0の形式で入力してください。');

  const developer = exactObject(
    root.developer,
    ['id', 'displayName', 'supportUrl'],
    '開発者情報',
  );
  const source = exactObject(root.source, ['kind', 'url', 'license'], 'ソース');
  const llm = exactObject(
    root.llm,
    ['purpose', 'useWhen', 'doNotUseWhen'],
    'LLM向け説明',
  );
  const io = exactObject(root.io, ['inputSchema', 'outputSchema'], '入出力');
  const adapter = exactObject(
    root.adapter,
    ['connectionType', 'endpointUrl'],
    'Adapter',
  );
  const capabilities = exactObject(
    root.capabilities,
    ['connectivity', 'executionTargets', 'permissions', 'sideEffects'],
    '能力情報',
  );
  const pricing = exactObject(
    root.pricing,
    ['model', 'note', 'developerRecipientId'],
    '料金情報',
  );
  const execution = exactObject(
    root.execution,
    ['timeoutSeconds', 'maxAttempts', 'idempotency', 'confirmation'],
    '実行規則',
  );
  const verification = exactObject(
    root.verification,
    ['method', 'successCondition'],
    '成功確認',
  );
  const fund = exactObject(root.fund, ['categories', 'tags'], 'Fund互換性');
  const generation = exactObject(
    root.generation,
    ['generatedBy', 'reviewRequired'],
    '生成情報',
  );

  const connectionType = choice(
    adapter.connectionType,
    SKY_CONNECTION_TYPES,
    '接続方式',
  );
  const connectivity = choice(
    capabilities.connectivity,
    SKY_TOOL_CONNECTIVITY,
    '通信区分',
  );
  const permissions = enumList(
    capabilities.permissions,
    SKY_PERMISSIONS,
    '権限',
  ) as SkyPermission[];
  const sideEffects = enumList(
    capabilities.sideEffects,
    SKY_TOOL_SIDE_EFFECTS,
    '副作用',
  ) as SkyToolSideEffect[];
  const executionTargets = enumList(
    capabilities.executionTargets,
    SKY_EXECUTION_TARGETS,
    '実行場所',
  ) as SkyExecutionTarget[];
  const endpointRequired =
    connectionType === 'mcp_streamable_http' || connectionType === 'https_api';
  const endpointUrl = httpsUrl(
    adapter.endpointUrl,
    '接続先',
    endpointRequired,
  );

  if (connectivity === 'offline' && permissions.includes('network'))
    throw new SkySubmissionError('オフラインToolにnetwork権限は指定できません。');
  if (connectivity !== 'offline' && !permissions.includes('network'))
    throw new SkySubmissionError('通信するToolにはnetwork権限が必要です。');
  if (sideEffects.includes('financial') && !permissions.includes('financial_action'))
    throw new SkySubmissionError('金融操作にはfinancial_action権限が必要です。');
  if (
    sideEffects.some((effect) => effect === 'external_write' || effect === 'financial') &&
    execution.confirmation !== 'per_run'
  )
    throw new SkySubmissionError('外部変更・金融操作は実行ごとの確認が必要です。');
  if (connectionType === 'rock_recipe' && executionTargets.some((target) => target !== 'device_local'))
    throw new SkySubmissionError('Rock recipeの実行場所は端末内だけです。');
  if (root.rightsConfirmed !== true)
    throw new SkySubmissionError('掲載権限と記載内容を確認してください。');

  if (!Array.isArray(root.tests) || root.tests.length < 2 || root.tests.length > 16)
    throw new SkySubmissionError('テストケースを2〜16件指定してください。');
  const tests = root.tests.map((value, index) => {
    const item = exactObject(value, ['name', 'kind'], `テスト${index + 1}`);
    return {
      name: string(item.name, `テスト${index + 1}名`, 2, 120),
      kind: choice(
        item.kind,
        ['valid_input', 'invalid_input', 'timeout', 'duplicate'] as const,
        `テスト${index + 1}種別`,
      ),
    };
  });

  return {
    schema: SKY_TOOL_PACKAGE_SCHEMA,
    id,
    version,
    name: string(root.name, 'Tool名', 2, 80),
    summary: string(root.summary, '説明', 20, 600),
    developer: {
      id: developerId(developer.id),
      displayName: string(developer.displayName, '開発者名', 2, 80),
      supportUrl: httpsUrl(developer.supportUrl, 'サポートURL', false),
    },
    source: {
      kind: choice(source.kind, SKY_TOOL_SOURCE_KINDS, 'ソース種別'),
      url: httpsUrl(
        source.url,
        'ソースURL',
        source.kind !== 'inline_code',
      ),
      license: string(source.license, 'ライセンス', 2, 100),
    },
    llm: {
      purpose: string(llm.purpose, '目的', 10, 500),
      useWhen: stringList(llm.useWhen, '使う場面'),
      doNotUseWhen: stringList(llm.doNotUseWhen, '禁止場面'),
    },
    io: {
      inputSchema: jsonSchema(io.inputSchema, '入力Schema'),
      outputSchema: jsonSchema(io.outputSchema, '出力Schema'),
    },
    adapter: { connectionType, endpointUrl },
    capabilities: {
      connectivity,
      executionTargets,
      permissions,
      sideEffects,
    },
    pricing: {
      model: choice(pricing.model, SKY_PRICING, '料金方式'),
      note: string(pricing.note, '料金説明', 2, 300),
      developerRecipientId: developerId(pricing.developerRecipientId),
    },
    execution: {
      timeoutSeconds: integer(execution.timeoutSeconds, 'タイムアウト', 1, 86400),
      maxAttempts: integer(execution.maxAttempts, '最大試行回数', 1, 5),
      idempotency: choice(
        execution.idempotency,
        ['required', 'not_supported', 'not_needed'] as const,
        '重複実行対策',
      ),
      confirmation: choice(
        execution.confirmation,
        SKY_TOOL_CONFIRMATION,
        '確認方式',
      ),
    },
    verification: {
      method: choice(
        verification.method,
        ['read_after_write', 'response_schema', 'manual'] as const,
        '成功確認方式',
      ),
      successCondition: string(
        verification.successCondition,
        '成功条件',
        10,
        500,
      ),
    },
    tests,
    fund: {
      categories: stringList(fund.categories, 'Fund分類'),
      tags: stringList(fund.tags, 'タグ'),
    },
    generation: {
      generatedBy: choice(
        generation.generatedBy,
        ['rock-studio/1'] as const,
        '生成元',
      ),
      reviewRequired: stringList(generation.reviewRequired, '要確認項目'),
    },
    rightsConfirmed: true,
  };
}

function slug(value: string, fallback: string) {
  const result = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return result || fallback;
}

function sourceFacts(input: SkyToolDraftInput) {
  if (input.sourceKind === 'inline_code') {
    const repositoryName =
      input.fileName?.replace(/\.[^.]+$/, '') || input.name || 'pasted-tool';
    return {
      sourceUrl: null,
      repositoryName,
      owner: input.developerId || 'sky-developer',
    };
  }
  const sourceUrl = httpsUrl(input.sourceUrl, 'ソースURL')!;
  const parsed = new URL(sourceUrl);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const repositoryName = segments.at(-1)?.replace(/\.git$/, '') || 'tool';
  const owner = segments.at(-2) || parsed.hostname.split('.')[0] || 'developer';
  return { sourceUrl, parsed, repositoryName, owner };
}

function openApiFacts(value: unknown) {
  if (!value) return null;
  const root = object(value, 'OpenAPI');
  const info = object(root.info, 'OpenAPI info');
  const paths = object(root.paths, 'OpenAPI paths');
  const operations: string[] = [];
  for (const [path, entry] of Object.entries(paths)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const [method, operation] of Object.entries(entry)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const operationObject = object(operation, `OpenAPI ${method} ${path}`);
      const label =
        typeof operationObject.summary === 'string'
          ? operationObject.summary
          : typeof operationObject.operationId === 'string'
            ? operationObject.operationId
            : `${method.toUpperCase()} ${path}`;
      operations.push(label.trim().slice(0, 120));
      if (operations.length === 8) break;
    }
    if (operations.length === 8) break;
  }
  return {
    title: typeof info.title === 'string' ? info.title.trim() : '',
    description:
      typeof info.description === 'string' ? info.description.trim() : '',
    version: typeof info.version === 'string' ? info.version.trim() : '',
    serverUrl:
      Array.isArray(root.servers) &&
      root.servers[0] &&
      typeof root.servers[0] === 'object' &&
      typeof (root.servers[0] as JsonObject).url === 'string'
        ? ((root.servers[0] as JsonObject).url as string)
        : '',
    operations,
  };
}

export function createSkyToolPackageDraft(
  input: SkyToolDraftInput,
): SkyToolPackage {
  const facts = sourceFacts(input);
  const openApi = openApiFacts(input.openApi);
  const name =
    input.name?.trim() || openApi?.title || facts.repositoryName.replace(/[-_]/g, ' ');
  const developerName = input.developerName?.trim() || facts.owner;
  const developer = slug(input.developerId || developerName, 'developer');
  const tool = slug(name, 'tool');
  const connectionType: SkyConnectionType =
    input.sourceKind === 'mcp'
      ? 'mcp_streamable_http'
      : input.sourceKind === 'rock_package'
        ? 'rock_recipe'
        : input.sourceKind === 'github' || input.sourceKind === 'inline_code'
          ? 'mcp_stdio'
          : 'https_api';
  const online = connectionType !== 'rock_recipe';
  const summary =
    input.summary?.trim() ||
    openApi?.description ||
    `${name}の公開インターフェースを、Fundから検証付きで利用するためのToolです。`;
  const operationLabels = openApi?.operations.length
    ? openApi.operations
    : [`${name}の入力条件が揃い、目的に一致するとき`];
  const sourceKind = choice(input.sourceKind, SKY_TOOL_SOURCE_KINDS, 'ソース種別');
  const suggestedVersion = input.version?.trim() || openApi?.version || '';
  const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(
    suggestedVersion,
  )
    ? suggestedVersion
    : '0.1.0';
  const endpointUrl =
    connectionType === 'mcp_streamable_http'
      ? facts.sourceUrl
      : connectionType === 'https_api'
        ? httpsUrl(openApi?.serverUrl || facts.sourceUrl, 'OpenAPI接続先')
        : null;

  return parseSkyToolPackage({
    schema: SKY_TOOL_PACKAGE_SCHEMA,
    id: `dev.${developer}.${tool}`,
    version,
    name,
    summary,
    developer: {
      id: developer,
      displayName: developerName,
      supportUrl: input.supportUrl?.trim() || facts.sourceUrl,
    },
    source: {
      kind: sourceKind,
      url: facts.sourceUrl,
      license: input.license?.trim() || 'LicenseRef-Needs-Confirmation',
    },
    llm: {
      purpose: `${summary} LLMは実行条件と入力Schemaを確認してから、このToolを候補にします。`,
      useWhen: operationLabels,
      doNotUseWhen: [
        '必要な入力・権限・接続が不足しているとき',
        '料金、送信先、副作用を実行前に確認できないとき',
      ],
    },
    io: {
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      outputSchema: { type: 'object', additionalProperties: true, properties: {} },
    },
    adapter: {
      connectionType,
      endpointUrl,
    },
    capabilities: {
      connectivity: online ? 'online' : 'offline',
      executionTargets:
        connectionType === 'mcp_stdio'
          ? ['pc']
          : online
            ? ['pc', 'cloud']
            : ['device_local'],
      permissions: online
        ? ['read_user_input', 'write_results', 'network']
        : ['read_user_input', 'write_results'],
      sideEffects: ['none'],
    },
    pricing: {
      model: 'free',
      note: '料金と外部実費は開発者が公開前に確認してください。',
      developerRecipientId: developer,
    },
    execution: {
      timeoutSeconds: 30,
      maxAttempts: 1,
      idempotency: 'not_needed',
      confirmation: 'first_use',
    },
    verification: {
      method: 'response_schema',
      successCondition: '宣言された出力Schemaに一致する結果が返ること。',
    },
    tests: [
      { name: '正常な入力でSchemaに合う結果を返す', kind: 'valid_input' },
      { name: '不正な入力を外部実行前に拒否する', kind: 'invalid_input' },
      { name: 'タイムアウト時に成功と記録しない', kind: 'timeout' },
      { name: '同一要求の重複実行を確認する', kind: 'duplicate' },
    ],
    fund: {
      categories: ['未分類'],
      tags: [sourceKind, online ? 'online' : 'offline'],
    },
    generation: {
      generatedBy: 'rock-studio/1',
      reviewRequired: [
        'LLM向け用途と禁止場面',
        '入出力Schema',
        '副作用・必要権限・承認方式',
        '料金・外部実費・開発者受取人',
        '成功確認とテスト結果',
        'ソースの権利とライセンス',
      ],
    },
    rightsConfirmed: true,
  });
}

export function skyToolPackageKey(manifest: Pick<SkyToolPackage, 'id' | 'version'>) {
  return `${manifest.id}@${manifest.version}`;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  return value;
}

export function canonicalSkyToolPackage(manifest: SkyToolPackage) {
  return JSON.stringify(canonicalValue(manifest));
}

export async function skyToolPackageSha256(manifest: SkyToolPackage) {
  const bytes = new TextEncoder().encode(canonicalSkyToolPackage(manifest));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
