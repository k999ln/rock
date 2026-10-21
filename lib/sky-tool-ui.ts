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
  if (tool.id === 'rockstar-material-invention') return {
    label: '机上の候補比較',
    detail: '端末内で生成。本人用の保存・再開にはサインインが必要です',
    className: 'is-ready',
  };
  if (tool.id === 'rockstar-spider') return {
    label: 'ブラウザ内で検査',
    detail: '明示入力の静的検査。原文は送信・保存しません',
    className: 'is-ready',
  };
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
        '単価見積・利用者上限・最終usage照合を接続するまで外部siへ送信しません',
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
  if (tool.id === 'rockstar-amc') return { label: '計画・進捗管理が利用可能', detail: 'siの自律実行は未接続', className: 'is-ready' };
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

const simpleDescriptions: Record<string, string> = {
  'fashion-brand-ops': '目標からSNSの投稿準備、注文、制作、発送までを整理します。外部への投稿や決済には接続と確認が必要です。',
  'rockstar-ip-studio': 'キャラクターや作品の制作、SNS運用、音声でのやり取りに必要な接続を確認します。',
  'rockstar-markets-analysis': '保存された相場データで仮想の取引を試します。実際のお金や注文は扱いません。',
  'rockstar-ledger': 'PCに保存した契約と明細を読み、毎月の支払いを確認します。',
  'jev-evaluation': '文章や案の品質を外部AIに確認する機能です。料金の確認が使えるまで送信を止めています。',
  'faster-whisper': 'PCで音声を文字にするための準備と利用条件を確認します。',
  'transformers-js': 'ブラウザの中でAIを動かすための準備と利用条件を確認します。',
  playwright: '自分が許可したサイトを、ブラウザで読み取って確認するための準備をします。',
  'jev-ultrafast': '画面から次の操作の候補を選ぶための準備をします。ここでは実際の操作は行いません。',
  'jev-trader': '仮想取引の試験に必要な準備を確認します。実際の売買は行いません。',
  'typesafe-computer-use': '許可したPC画面を読むための準備を確認します。入力や設定変更は行いません。',
  'jev-review': 'コードの変更内容を確認するための準備と利用条件を整理します。',
  'jev-router': '仕事に合うAIを選ぶためのPC用ツールです。Skyからの実行は準備中です。',
  'jev-browser': '自分のサイトを読み取って確認するための準備と利用条件を整理します。',
  'mobile-jev': '試験用Android端末の画面を読むための準備と利用条件を整理します。',
  'coconala-proposal-draft': '案件の条件から、送る前に確認できる提案文の下書きを作ります。',
  'gig-workflow': '応募から納品と売上確認まで、次に必要な作業を整理します。',
  'coconala-inbox': '依頼文から、納期・報酬・確認することを整理します。',
  'youtube-script-writer': 'テーマと長さに合わせた動画台本の下書きを作ります。',
  'seo-blueprint': '読者と検索したい言葉に合わせて、記事の構成を整理します。',
  'landing-page-sprint': '商品の紹介ページに載せる内容と確認することを整理します。',
  'sales-objection-reply-builder': '相手の質問や懸念に合わせて、返信と見積りの下書きを作ります。',
  'user-interview-synthesizer': '顧客の発言を残して、気づきや仮説の記入欄を作ります。自動分析は準備中です。',
  'calendar-coordination': '依頼文を残して、日時や場所の記入欄を作ります。自動抽出とカレンダー接続は準備中です。',
  'telegram-notifications': 'Telegramへ送る通知文を作ります。接続先を確認するまで送信しません。',
  'producthunt-discovery': '欲しいツールの用途、料金、権限など、調べる条件を整理します。',
};
export function skyToolDescription(tool: Automation): string {
  return simpleDescriptions[tool.id] ?? tool.description;
}

export function skyToolEnvironment(tool: Automation): string {
  if (tool.status === 'candidate') return '下書きや接続条件を確認できます。ツール本体の実行は準備中です。';
  if (tool.runner === 'delivery-local' || tool.runner === 'subscription-ledger') return '自分のPCをSkyにつないで使います。';
  if (tool.id === 'rockstar-csv-cleanup') return 'サインインして使います。入力と成果は自分だけが見られる場所へ保存します。';
  if (tool.integration === 'fashion-brand-ops') return 'ブラウザの簡易版と、接続したPCで使う版があります。外部操作には別の接続が必要です。';
  if (tool.runner === 'jev-evaluation') return '外部AIの接続と料金確認を準備しています。';
  if (tool.runner === 'legal-intake' || tool.runner === 'patent-assistant') return 'ブラウザで案内や下書きを作れます。外部AIは料金確認の準備ができるまで停止しています。';
  return tool.environment.replace('ブラウザ内', 'このブラウザ').replace('Sky Cloud', 'Skyのサーバー');
}
