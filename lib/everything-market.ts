export const MARKET_CATEGORIES = [
  'automation',
  'digital',
  'service',
  'product',
  'capacity',
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
export type MarketSide = 'buy' | 'sell';
export type MarketMode = 'PAPER';

export type MarketAsset = {
  id: string;
  title: string;
  description: string;
  category: MarketCategory;
  unit: string;
  bidMinor: number;
  askMinor: number;
  volume: number;
  changeBps: number;
  source: 'rockstaros' | 'user';
  status: 'open';
};

export type MarketProposalInput = {
  assetId: string;
  side: MarketSide;
  priceMinor: number;
  quantity: number;
  mode: MarketMode;
  expiresAt: string;
};

export type NewMarketAsset = {
  title: string;
  description: string;
  category: MarketCategory;
  unit: string;
  referencePriceMinor: number;
};

export const PAPER_OPENING_BALANCE_MINOR = 100_000;
export const PAPER_MAX_ORDER_MINOR = 50_000;
export const PAPER_MAX_EXPOSURE_MINOR = 100_000;

export class EverythingMarketError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const baseMarketAssets: MarketAsset[] = [
  {
    id: 'rock:campaign-pack',
    title: 'SNSキャンペーン運用パック',
    description: '企画、投稿案、KPI計測を1キャンペーン単位で取引',
    category: 'automation',
    unit: 'campaign',
    bidMinor: 4200,
    askMinor: 4800,
    volume: 184,
    changeBps: 320,
    source: 'rockstaros',
    status: 'open',
  },
  {
    id: 'rock:research-brief',
    title: '検証済みリサーチブリーフ',
    description: '出典付き調査成果を1 brief単位で取引',
    category: 'digital',
    unit: 'brief',
    bidMinor: 1800,
    askMinor: 2200,
    volume: 329,
    changeBps: 180,
    source: 'rockstaros',
    status: 'open',
  },
  {
    id: 'rock:editing-slot',
    title: '編集・校正 60分枠',
    description: '記事、資料、販売文の編集キャパシティ',
    category: 'capacity',
    unit: 'hour',
    bidMinor: 3200,
    askMinor: 3800,
    volume: 97,
    changeBps: -140,
    source: 'rockstaros',
    status: 'open',
  },
  {
    id: 'rock:transcription',
    title: '音声文字起こし 30分',
    description: '音声ファイルから整形済みテキストを納品',
    category: 'service',
    unit: '30 min',
    bidMinor: 900,
    askMinor: 1200,
    volume: 512,
    changeBps: 60,
    source: 'rockstaros',
    status: 'open',
  },
  {
    id: 'rock:sample-production',
    title: 'アパレル試作 1型',
    description: '仕様確認から試作品完成までの制作枠',
    category: 'product',
    unit: 'sample',
    bidMinor: 14500,
    askMinor: 16800,
    volume: 43,
    changeBps: 410,
    source: 'rockstaros',
    status: 'open',
  },
  {
    id: 'rock:delivery-review',
    title: '納品前QAレビュー',
    description: '成果物の要件照合と納品パッケージ確認',
    category: 'automation',
    unit: 'review',
    bidMinor: 1500,
    askMinor: 1900,
    volume: 271,
    changeBps: -40,
    source: 'rockstaros',
    status: 'open',
  },
];

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EverythingMarketError('invalid_input', '入力を確認してください。');
  return value as Record<string, unknown>;
}

function cleanText(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string')
    throw new EverythingMarketError('invalid_text', `${label}を入力してください。`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (normalized.length < min || normalized.length > max)
    throw new EverythingMarketError('invalid_text', `${label}の長さを確認してください。`);
  return normalized;
}

function integer(value: unknown, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max)
    throw new EverythingMarketError('invalid_number', `${label}の範囲を確認してください。`);
  return Number(value);
}

export function validateNewMarketAsset(value: unknown): NewMarketAsset {
  const input = record(value);
  const allowed = new Set(['title', 'description', 'category', 'unit', 'referencePriceMinor']);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new EverythingMarketError('unsupported_input', '未対応の入力があります。');
  if (!MARKET_CATEGORIES.includes(input.category as MarketCategory))
    throw new EverythingMarketError('invalid_category', 'カテゴリを選び直してください。');
  return {
    title: cleanText(input.title, '取引対象名', 3, 100),
    description: cleanText(input.description, '説明', 10, 400),
    category: input.category as MarketCategory,
    unit: cleanText(input.unit, '取引単位', 1, 30),
    referencePriceMinor: integer(input.referencePriceMinor, 1, 10_000_000, '参考価格'),
  };
}

export function validateMarketProposal(value: unknown, now = Date.now()): MarketProposalInput {
  const input = record(value);
  const allowed = new Set(['assetId', 'side', 'priceMinor', 'quantity', 'mode', 'expiresAt']);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new EverythingMarketError('unsupported_input', '未対応の入力があります。');
  const assetId = cleanText(input.assetId, '取引対象', 3, 100);
  if (input.side !== 'buy' && input.side !== 'sell')
    throw new EverythingMarketError('invalid_side', '買いまたは売りを選んでください。');
  if (input.mode !== 'PAPER')
    throw new EverythingMarketError('live_disabled', '実資金取引は有効化されていません。', 409);
  const expiresAt = cleanText(input.expiresAt, '有効期限', 20, 40);
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 24 * 60 * 60 * 1000)
    throw new EverythingMarketError('invalid_expiry', '有効期限は24時間以内にしてください。');
  const priceMinor = integer(input.priceMinor, 1, 10_000_000, '価格');
  const quantity = integer(input.quantity, 1, 10_000, '数量');
  if (!Number.isSafeInteger(priceMinor * quantity))
    throw new EverythingMarketError('invalid_notional', '注文金額が大きすぎます。');
  return { assetId, side: input.side, priceMinor, quantity, mode: 'PAPER', expiresAt };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function proposalDigest(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
