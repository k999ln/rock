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
  'livekit',
] as const;

export type SkyProvider = (typeof SKY_PROVIDERS)[number];
export type SkyProviderStatus = 'setup_required' | 'ready' | 'reauth_required';

export type SkyProviderCapability =
  | 'image_generation'
  | 'video_generation'
  | 'text_generation'
  | 'workflow'
  | 'social_publish'
  | 'game_delivery'
  | 'realtime_voice'
  | 'telephony';

export type SkyProviderAdapter = {
  id: string;
  name: string;
  detail: string;
  capabilities: SkyProviderCapability[];
};

export const skyProviderAdapters: SkyProviderAdapter[] = [
  {
    id: 'livekit',
    name: 'LiveKit Agents',
    detail: 'IPキャラクターとの音声会話・電話連携（本体接続が必要）',
    capabilities: ['realtime_voice', 'telephony'],
  },
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
  optional?: boolean;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
  suggestions?: { value: string; label: string }[];
};

export type SkyProviderDefinition = {
  id: SkyProvider;
  name: string;
  detail: string;
  fields: SkyProviderField[];
  setupSteps?: string[];
  documentationUrl?: string;
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
        id: 'localLlmBaseUrl',
        label: 'Local LLMブリッジURL',
        placeholder: 'http://127.0.0.1:4317/v1（空欄ならサーバー設定）',
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
      ...([
        ['realtimeVoice', 'IPの音声会話', 'realtime_voice'],
        ['telephony', 'IPの電話連携', 'telephony'],
      ] as const).map(([id, label, capability]) => ({
        id,
        label,
        placeholder: '',
        optional: true,
        type: 'select' as const,
        options: adaptersForCapability(capability).map((adapter) => ({
          value: adapter.id,
          label: `${adapter.name} — ${adapter.detail}`,
        })),
      })),
    ],
  },
  {
    id: 'livekit',
    name: 'LiveKit — IP音声・電話',
    detail: 'IPキャラクターとの音声会話や電話対応に使う接続先を登録します。設定の保存だけでは会話・発着信は始まりません。',
    documentationUrl: 'https://docs.livekit.io/agents/',
    setupSteps: [
      'LiveKit Cloud または自分のサーバーと、IPキャラクターを担当するAgentを用意します。',
      '音声モデルの接続とAPIキーはAgent側で設定します。この画面に秘密情報は入力しません。',
      '電話を使う場合は回線を用意し、発信用Trunkと着信用Dispatch Ruleを別々に設定します。番号取得・通話・モデルの費用は別途かかります。',
      'IP Studio本体との接続・通話試験は未完了です。音声・電話の利用開始は、その接続後に行います。',
    ],
    fields: [
      {
        id: 'deployment', label: '利用する環境', placeholder: '', type: 'select',
        options: [
          { value: 'cloud', label: 'LiveKit Cloud' },
          { value: 'self_hosted', label: '自分のサーバー' },
        ],
      },
      { id: 'serverUrl', label: 'LiveKitサーバーURL', placeholder: 'wss://your-project.livekit.cloud' },
      { id: 'agentName', label: 'Agent名', placeholder: 'ip-character' },
      { id: 'sipTrunkId', label: '発信用SIP Trunk ID（電話を使う場合）', placeholder: 'ST_…', optional: true },
      { id: 'sipDispatchRuleId', label: '着信用Dispatch Rule ID（電話を使う場合）', placeholder: 'SDR_…', optional: true },
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
  'rockstar-ip-studio': ['routing', 'higgsfield', 'make', 'instagram', 'youtube', 'roblox', 'gta', 'livekit'],
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

// This validates saved setup metadata only. It does not contact LiveKit or grant
// permission to join a room, send media, dispatch an agent, or place a call.
export function liveKitConfigError(config: Record<string, string>): string | null {
  const definition = providerDefinition('livekit');
  if (Object.keys(config).some((key) => !definition.fields.some((field) => field.id === key)))
    return 'LiveKitの接続先・Agent・SIP参照IDだけを保存してください。';
  if (config.deployment && !['cloud', 'self_hosted'].includes(config.deployment))
    return 'LiveKitの利用環境を選択してください。';
  if (config.serverUrl) {
    try {
      const url = new URL(config.serverUrl);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const protocolAllowed = url.protocol === 'wss:' ||
        (url.protocol === 'ws:' && loopback && config.deployment === 'self_hosted');
      if (!protocolAllowed || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/')
        return '認証情報を含まないwss://のサーバーURLを入力してください。自分のPC上の検証だけws://を利用できます。';
    } catch {
      return 'LiveKitサーバーURLの形式を確認してください。';
    }
  }
  for (const key of ['agentName', 'sipTrunkId', 'sipDispatchRuleId']) {
    if (config[key] && !/^[a-zA-Z0-9_-]{1,128}$/.test(config[key]))
      return 'Agent名とSIP参照IDは128文字以内の英数字・ハイフン・アンダースコアで入力してください。';
  }
  return null;
}
