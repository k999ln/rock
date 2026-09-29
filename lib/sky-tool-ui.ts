import type { Automation } from '@/lib/catalog';

export type SkyToolUiContext = {
  connectedTools?: readonly string[];
  fashionConnected?: boolean;
  pcConnected?: boolean;
};

export type SkyToolUiState = {
  label: string;
  detail: string;
  className: 'is-ready' | 'is-connect' | 'is-candidate';
};

export function skyToolUiState(
  tool: Automation,
  {
    connectedTools = [],
    fashionConnected = false,
    pcConnected = false,
  }: SkyToolUiContext = {},
): SkyToolUiState {
  if (tool.id === 'jev-router')
    return {
      label: 'Sky未接続・PC CLIのみ',
      detail: 'Skyからの接続・実行は準備中',
      className: 'is-candidate',
    };
  if (
    tool.status === 'candidate' &&
    tool.runner === 'candidate-local' &&
    connectedTools.includes(tool.id)
  )
    return {
      label: '導入候補・下書きのみ',
      detail: '本体は未接続／下書きと接続条件だけ確認できます',
      className: 'is-candidate',
    };
  if (tool.status === 'candidate' && connectedTools.includes(tool.id))
    return {
      label: 'Sky登録済み・本体要確認',
      detail: '登録記録は本体接続の証明ではありません',
      className: 'is-connect',
    };
  if (tool.status === 'candidate')
    return {
      label: '導入候補・本体未接続',
      detail: 'Skyへの登録は本体接続ではありません',
      className: 'is-candidate',
    };
  if (tool.runner === 'delivery-local')
    return {
      label: pcConnected ? 'PC接続中' : 'PC接続後',
      detail: pcConnected ? 'このPCで納品記録を照合' : '利用者のPCで実行',
      className: pcConnected ? 'is-ready' : 'is-connect',
    };
  if (tool.integration === 'fashion-brand-ops')
    return {
      label: fashionConnected ? '接続済み' : 'PCなしのブラウザ簡易版',
      detail: fashionConnected ? '41操作を利用可能' : '必要ならPCのMCPへ接続',
      className: fashionConnected ? 'is-ready' : 'is-connect',
    };
  if (tool.runner === 'subscription-ledger')
    return {
      label: 'PC / MCP',
      detail: 'SkyからPC上の専用システムへ接続',
      className: 'is-connect',
    };
  if (tool.runner === 'jev-evaluation')
    return {
      label: '外部AI接続が必要',
      detail: '利用同意とProvider設定後に評価',
      className: 'is-connect',
    };
  if (tool.id === 'rockstar-csv-cleanup')
    return {
      label: '今使える',
      detail: 'Skyの自動化Toolとして実行',
      className: 'is-ready',
    };
  return {
    label: '今使える',
    detail: 'ブラウザ内で実行',
    className: 'is-ready',
  };
}

export function skyToolDetailActionLabel(tool: Automation) {
  if (tool.id === 'jev-router') return '導入条件を見る';
  if (tool.status === 'candidate') return '利用条件を見る';
  return '利用画面へ';
}
