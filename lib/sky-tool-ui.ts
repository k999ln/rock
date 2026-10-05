import type { Automation } from '@/lib/catalog';
import type { SkyServiceStatus } from './sky-service-status';

export type SkyToolUiContext = {
  connectedTools?: readonly string[];
  fashionConnected?: boolean;
  pcConnected?: boolean;
  service?: SkyServiceStatus;
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
    service,
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
      label: '料金見積・上限制御の接続待ち',
      detail:
        'provider設定があっても、価格・予算予約・usage receiptを接続するまで外部送信しません',
      className: 'is-connect',
    };
  if (
    tool.id === 'rockstar-legal-intake' ||
    tool.id === 'rockstar-patent-assistant'
  ) {
    const configured =
      tool.id === 'rockstar-legal-intake'
        ? service?.legalAiConfigured
        : service?.patentAiConfigured;
    return {
      label: configured
        ? 'Provider設定あり・価格制御未接続'
        : '標準ガイドのみ・価格確認待ち',
      detail:
        '単価見積・利用者上限・最終usage照合を接続するまで外部AIへ送信しません',
      className: 'is-connect',
    };
  }
  if (
    [
      'coconala',
      'mr-free-article',
      'mr-citations',
      'rockstar-markets-analysis',
      'mercari-revenue',
    ].includes(tool.id) &&
    service?.database === 'unavailable'
  )
    return {
      label: '実行記録サービスを確認中',
      detail:
        '記録サービスの復旧後に利用できます。入力を手元に保存してください',
      className: 'is-connect',
    };
  if (tool.id === 'rockstar-markets-analysis')
    return {
      label: 'PAPER検証のみ',
      detail: 'Skyの仮想台帳で検証。実資金・外部注文には接続していません',
      className: 'is-connect',
    };
  if (tool.id === 'mercari-revenue')
    return {
      label: '出品準備・本人操作が必要',
      detail:
        '原稿・費用・取引状態を管理。公式サービスへの出品や送信は行いません',
      className: 'is-connect',
    };
  if (tool.id === 'rockstar-csv-cleanup')
    return {
      label:
        service?.database === 'available' && service.csvStorageConfigured
          ? 'サインインして利用'
          : service
            ? 'ファイルサービス接続待ち'
            : '利用条件を確認',
      detail:
        'サインイン、実行記録、ファイル保存が必要。成果物の取得期限は7日です',
      className:
        service?.database === 'available' && service.csvStorageConfigured
          ? 'is-ready'
          : 'is-connect',
    };
  if (['coconala', 'mr-free-article', 'mr-citations'].includes(tool.id))
    return {
      label: '今使える',
      detail: 'ブラウザ内で実行',
      className: 'is-ready',
    };
  return {
    label: '実行条件を確認',
    detail: '実行器の準備・接続を確認してください',
    className: 'is-connect',
  };
}

export function skyToolDetailActionLabel(tool: Automation) {
  if (tool.id === 'jev-router') return '導入条件を見る';
  if (tool.status === 'candidate') return '利用条件を見る';
  return '利用画面へ';
}
