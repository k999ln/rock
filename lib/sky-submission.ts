export const SKY_CONNECTION_TYPES = [
  'mcp_streamable_http',
  'mcp_stdio',
  'rock_recipe',
  'https_api',
] as const;
export const SKY_EXECUTION_TARGETS = ['device_local', 'pc', 'cloud'] as const;
export const SKY_PERMISSIONS = [
  'read_user_input',
  'write_results',
  'network',
  'external_account',
  'selected_files',
  'long_running',
  'financial_action',
] as const;
export const SKY_PRICING = [
  'free',
  'subscription',
  'usage',
  'external_contract',
] as const;

export type SkyConnectionType = (typeof SKY_CONNECTION_TYPES)[number];
export type SkyExecutionTarget = (typeof SKY_EXECUTION_TARGETS)[number];
export type SkyPermission = (typeof SKY_PERMISSIONS)[number];
export type SkyPricing = (typeof SKY_PRICING)[number];

export type SkySubmission = {
  id: string;
  name: string;
  summary: string;
  providerName: string;
  version: string;
  connectionType: SkyConnectionType;
  endpointUrl: string | null;
  sourceUrl: string | null;
  supportUrl: string;
  license: string;
  pricing: SkyPricing;
  priceNote: string;
  dataUse: string;
  executionTargets: SkyExecutionTarget[];
  permissions: SkyPermission[];
  rightsConfirmed: true;
};

export class SkySubmissionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const keys = [
  'id',
  'name',
  'summary',
  'providerName',
  'version',
  'connectionType',
  'endpointUrl',
  'sourceUrl',
  'supportUrl',
  'license',
  'pricing',
  'priceNote',
  'dataUse',
  'executionTargets',
  'permissions',
  'rightsConfirmed',
];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SkySubmissionError('掲載情報の形式を確認してください。');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in input))
  )
    throw new SkySubmissionError(
      '掲載情報に不足または未対応の項目があります。',
    );
  return input;
}

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string')
    throw new SkySubmissionError(
      `${label}を${min}〜${max}文字で入力してください。`,
    );
  const normalized = value.trim();
  let hasControlCharacter = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 32 || code === 127) hasControlCharacter = true;
  }
  if (normalized.length < min || normalized.length > max || hasControlCharacter)
    throw new SkySubmissionError(
      `${label}を${min}〜${max}文字で入力してください。`,
    );
  return normalized;
}

function url(value: unknown, label: string, required: boolean) {
  if (value === null && !required) return null;
  if (typeof value !== 'string' || value.length > 500)
    throw new SkySubmissionError(`${label}を確認してください。`);
  try {
    const parsed = new URL(value);
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

function choices<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number][] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > allowed.length ||
    value.some(
      (item) =>
        typeof item !== 'string' || !allowed.includes(item as T[number]),
    ) ||
    new Set(value).size !== value.length
  )
    throw new SkySubmissionError(`${label}を重複なく選んでください。`);
  return value as T[number][];
}

export function parseSkySubmission(value: unknown): SkySubmission {
  const input = record(value);
  if (
    typeof input.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.id,
    )
  )
    throw new SkySubmissionError('掲載IDが不正です。');
  if (
    typeof input.version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version)
  )
    throw new SkySubmissionError('版は1.0.0の形式で入力してください。');
  const connectionType = choice(
    input.connectionType,
    SKY_CONNECTION_TYPES,
    '接続方式',
  );
  const executionTargets = choices(
    input.executionTargets,
    SKY_EXECUTION_TARGETS,
    '実行場所',
  );
  const permissions = choices(input.permissions, SKY_PERMISSIONS, '権限');
  const endpointRequired =
    connectionType === 'mcp_streamable_http' || connectionType === 'https_api';
  const sourceRequired =
    connectionType === 'mcp_stdio' || connectionType === 'rock_recipe';
  const endpointUrl = url(input.endpointUrl, '接続先', endpointRequired);
  const sourceUrl = url(input.sourceUrl, 'ソースまたは配布元', sourceRequired);
  if (
    connectionType === 'rock_recipe' &&
    (executionTargets.length !== 1 || executionTargets[0] !== 'device_local')
  )
    throw new SkySubmissionError('Rock recipeの実行場所は端末内だけです。');
  if (
    connectionType === 'mcp_streamable_http' &&
    !permissions.includes('network')
  )
    throw new SkySubmissionError('遠隔MCP接続にはnetwork権限が必要です。');
  if (input.rightsConfirmed !== true)
    throw new SkySubmissionError('掲載権限と情報の正確性を確認してください。');
  return {
    id: input.id,
    name: text(input.name, 'ツール名', 2, 80),
    summary: text(input.summary, '説明', 20, 600),
    providerName: text(input.providerName, '提供者名', 2, 80),
    version: input.version,
    connectionType,
    endpointUrl,
    sourceUrl,
    supportUrl: url(input.supportUrl, 'サポートURL', true)!,
    license: text(input.license, 'ライセンス・利用規約', 2, 100),
    pricing: choice(input.pricing, SKY_PRICING, '料金方式'),
    priceNote: text(input.priceNote, '料金の説明', 2, 300),
    dataUse: text(input.dataUse, '扱うデータ', 10, 500),
    executionTargets,
    permissions,
    rightsConfirmed: true,
  };
}
