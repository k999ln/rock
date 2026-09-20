import { localModelPresets, textModelProviders } from './llm-providers.ts';

export const SKY_PROVIDERS = [
  'routing',
  'instagram',
  'youtube',
  'higgsfield',
  'make',
  'stripe',
  'roblox',
  'gta',
] as const;

export type SkyProvider = (typeof SKY_PROVIDERS)[number];
export type SkyProviderStatus = 'setup_required' | 'ready' | 'reauth_required';

export type SkyProviderCapability =
  | 'image_generation'
  | 'video_generation'
  | 'text_generation'
  | 'workflow'
  | 'social_publish'
  | 'game_delivery';

export type SkyProviderAdapter = {
  id: string;
  name: string;
  detail: string;
  capabilities: SkyProviderCapability[];
};

export const skyProviderAdapters: SkyProviderAdapter[] = [
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    detail: '画像・動画生成',
    capabilities: ['image_generation', 'video_generation'],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI互換生成アダプタ',
    detail: '接続した画像・動画・文章モデル',
    capabilities: ['image_generation', 'video_generation', 'text_generation'],
  },
  {
    id: 'runway',
    name: 'Runwayアダプタ',
    detail: '動画生成（Connectorが必要）',
    capabilities: ['video_generation'],
  },
  {
    id: 'kling',
    name: 'Klingアダプタ',
    detail: '動画生成（Connectorが必要）',
    capabilities: ['video_generation'],
  },
  {
    id: 'replicate',
    name: 'Replicateアダプタ',
    detail: '選択したモデルを実行（Connectorが必要）',
    capabilities: ['image_generation', 'video_generation', 'text_generation'],
  },
  {
    id: 'local-model',
    name: 'ローカルモデル',
    detail: 'このPC・OS内のモデル',
    capabilities: ['image_generation', 'video_generation', 'text_generation'],
  },
  {
    id: 'make',
    name: 'Make',
    detail: 'ワークフロー・通知・投稿連携',
    capabilities: ['workflow', 'social_publish'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    detail: 'SNS公開先',
    capabilities: ['social_publish'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    detail: '動画公開先',
    capabilities: ['social_publish'],
  },
  {
    id: 'roblox',
    name: 'Roblox',
    detail: 'ゲーム導入先',
    capabilities: ['game_delivery'],
  },
  {
    id: 'gta',
    name: 'GTA / FiveM',
    detail: 'ゲーム導入先',
    capabilities: ['game_delivery'],
  },
];

export function adaptersForCapability(capability: SkyProviderCapability) {
  return skyProviderAdapters.filter((adapter) =>
    adapter.capabilities.includes(capability),
  );
}

export type SkyProviderField = {
  id: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  suggestions?: { value: string; label: string }[];
};

export type SkyProviderDefinition = {
  id: SkyProvider;
  name: string;
  detail: string;
  fields: SkyProviderField[];
};

export const skyProviderDefinitions: SkyProviderDefinition[] = [
  {
    id: 'routing',
    name: 'Providerルーティング',
    detail: '用途ごとに使う生成AI・LLM・ワークフロー・導入先を差し替えます。未接続の候補は実行前にConnectorを登録します。',
    fields: [
      {
        id: 'imageGeneration',
        label: '画像生成',
        placeholder: 'higgsfield',
        type: 'select',
        options: adaptersForCapability('image_generation').map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      },
      {
        id: 'videoGeneration',
        label: '動画生成',
        placeholder: 'higgsfield',
        type: 'select',
        options: adaptersForCapability('video_generation').map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      },
      {
        id: 'textGeneration',
        label: '文章・LLM',
        placeholder: 'local-model',
        type: 'select',
        options: textModelProviders.map((provider) => ({
          value: provider.id,
          label: `${provider.name} — ${provider.detail}`,
        })),
      },
      {
        id: 'textGenerationModel',
        label: '文章・LLMのモデルID',
        placeholder: '例: qwen3:8b（Ollamaが必要）',
        suggestions: localModelPresets.map((model) => ({ ...model })),
      },
      {
        id: 'workflow',
        label: 'ワークフロー',
        placeholder: 'make',
        type: 'select',
        options: adaptersForCapability('workflow').map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      },
      {
        id: 'socialPublish',
        label: 'SNS公開',
        placeholder: 'make',
        type: 'select',
        options: adaptersForCapability('social_publish').map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      },
      {
        id: 'gameDelivery',
        label: 'ゲーム導入',
        placeholder: 'roblox',
        type: 'select',
        options: adaptersForCapability('game_delivery').map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    detail: '投稿先、ブランドアカウント、公開前の確認を管理します。',
    fields: [
      { id: 'account', label: 'アカウント名', placeholder: '@your_account' },
      { id: 'profileUrl', label: 'プロフィールURL', placeholder: 'https://instagram.com/…' },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    detail: '動画の公開先とチャンネルを管理します。',
    fields: [
      { id: 'channel', label: 'チャンネル名', placeholder: 'RockstarOS' },
      { id: 'channelUrl', label: 'チャンネルURL', placeholder: 'https://youtube.com/@…' },
    ],
  },
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    detail: '画像・動画生成の接続先を管理します。',
    fields: [
      { id: 'workspace', label: 'ワークスペース名', placeholder: 'My workspace' },
      { id: 'accountEmail', label: '登録メール', placeholder: 'you@example.com' },
    ],
  },
  {
    id: 'make',
    name: 'Make',
    detail: 'SNS投稿、通知、データ連携のシナリオを管理します。',
    fields: [
      { id: 'organization', label: 'Organization名', placeholder: 'My organization' },
      { id: 'scenarioUrl', label: 'シナリオURL', placeholder: 'https://eu1.make.com/…' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    detail: '販売・決済に使うアカウントを管理します。',
    fields: [
      { id: 'accountName', label: 'アカウント名', placeholder: 'My business' },
      { id: 'dashboardUrl', label: 'ダッシュボードURL', placeholder: 'https://dashboard.stripe.com/…' },
    ],
  },
  {
    id: 'roblox',
    name: 'Roblox',
    detail: 'ゲーム、体験、アセットの導入先を管理します。',
    fields: [
      { id: 'experience', label: 'Experience名', placeholder: 'My experience' },
      { id: 'experienceUrl', label: 'Experience URL', placeholder: 'https://www.roblox.com/games/…' },
    ],
  },
  {
    id: 'gta',
    name: 'GTA / FiveM',
    detail: '導入対象のサーバーや配布先を管理します。',
    fields: [
      { id: 'server', label: 'サーバー名', placeholder: 'My server' },
      { id: 'serverUrl', label: 'サーバーURL', placeholder: 'https://…' },
    ],
  },
];

export const skyToolProviders: Record<string, SkyProvider[]> = {
  'rockstar-ip-studio': ['routing', 'higgsfield', 'make', 'instagram', 'youtube', 'roblox', 'gta'],
  'fashion-brand-ops': ['instagram', 'make', 'stripe'],
  'mercari-revenue': ['stripe'],
};

export function providerDefinition(provider: SkyProvider) {
  return skyProviderDefinitions.find((item) => item.id === provider)!;
}

export function requiredSkyProviders(toolId: string) {
  return skyToolProviders[toolId] ?? [];
}

export function isSkyProvider(value: unknown): value is SkyProvider {
  return typeof value === 'string' && SKY_PROVIDERS.includes(value as SkyProvider);
}

export function isSensitiveConnectionKey(key: string) {
  return /(token|secret|password|apikey|api_key|authorization|private)/i.test(key);
}
