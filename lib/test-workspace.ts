import { catalog } from './catalog.ts';

export type TestField = {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
};
export type TestScenario = {
  id: string;
  name: string;
  mode: 'local' | 'simulation' | 'unconnected';
  scope: string;
  fields: TestField[];
};
const field = (
  key: string,
  label: string,
  value: string,
  multiline = false,
): TestField => ({ key, label, value, multiline });
const article =
  '# 小さく始める自動化\n\n毎日の作業を一つ選びます。入力を整理し、結果を自分で確認します。\n\n## 次の一歩\n繰り返して改善します。\n\n## 記録する\n入力と出力の違いを記録し、確認できた範囲を残します。\n\n## 続ける\n少量の試験で再現性を確認してから、対象を広げていきます。';
const definitions: TestScenario[] = [
  {
    id: 'rockstar-csv-cleanup',
    name: 'CSV整形',
    mode: 'local',
    scope:
      '空白除去・重複排除・並び替えと独立検査。決済や納品受付は作りません。',
    fields: [
      field('text', 'CSV', 'id,name\n2,  beta  \n1, alpha\n2, beta', true),
      field('key', '重複判定・並び替えの列', 'id'),
    ],
  },
  {
    id: 'mr-citations',
    name: '引用・出典整理',
    mode: 'local',
    scope: '既存の文章変換を実行。出典の内容や正しさの調査は含みません。',
    fields: [
      field(
        'text',
        '原稿',
        '自動化は小さく試します。（出典: [Python公式](https://docs.python.org/3/)）\n\n結果を確認します。（出典: [Python公式](https://docs.python.org/3/)）',
        true,
      ),
    ],
  },
  {
    id: 'mr-free-article',
    name: '無料記事の作成',
    mode: 'local',
    scope:
      '入力原稿を無料部分・要約・案内に整形。AIによる執筆や投稿は行いません。',
    fields: [
      field('text', '原稿', article, true),
      field(
        'summary',
        'まとめ（箇条書き3〜5個）',
        '- 作業を一つ選ぶ\n- 入力を整理する\n- 結果を確認する',
        true,
      ),
    ],
  },
  {
    id: 'coconala',
    name: '案件チェック',
    mode: 'local',
    scope: '既存ルールで依頼と提案を検査。応募や契約は行いません。',
    fields: [
      field(
        'text',
        '依頼内容',
        '単発の原稿作成。チャットで完結し、Zoom面談は不要です。',
        true,
      ),
      field(
        'proposal',
        '提案',
        'テーマに沿った原稿を確認用文書として納品します。',
        true,
      ),
    ],
  },
  {
    id: 'fashion-brand-ops',
    name: 'ブランド企画',
    mode: 'local',
    scope:
      '既存のルールから企画・投稿文・制作指示を作成。画像・動画の生成や公開は含みません。',
    fields: [
      field(
        'text',
        'ブランド方針',
        '静かで無機質な高級感。完全受注生産。',
        true,
      ),
      field('product', '商品', '黒いウールのワイドスラックス'),
    ],
  },
  {
    id: 'mercari-revenue',
    name: '出品原稿',
    mode: 'local',
    scope:
      'テスト在庫の原稿と見込み利益を計算。架空の在庫・手数料で、実出品・売上ではありません。',
    fields: [
      field('text', 'テスト商品名', '試験用の黒いジャケット'),
      field('facts', '商品の事実', 'テスト在庫。サイズM、着用回数2回。', true),
      field('price', '仮の販売価格（円、300以上）', '5000'),
    ],
  },
  {
    id: 'rockstar-legal-intake',
    name: '法律相談の整理',
    mode: 'local',
    scope:
      '相談の受付文を整形。法的判断・最新法令の調査・弁護士への送信は行いません。',
    fields: [
      field('text', 'テスト相談', '業務委託契約について相談したい。', true),
      field('outcome', '希望', '専門家へ相談する前に事実を整理したい。'),
    ],
  },
  {
    id: 'rockstar-patent-assistant',
    name: '発明の整理',
    mode: 'local',
    scope: '発明メモと検索式を作成。AI調査・特許性判断・出願は未実施です。',
    fields: [
      field('text', '発明名', '省電力の試験用センサー'),
      field(
        'mechanism',
        '仕組み',
        '変化を検知したときだけ測定周期を短くする。',
        true,
      ),
    ],
  },
  {
    id: 'mr-delivery',
    name: '納品前の照合',
    mode: 'local',
    scope:
      '入力テキストのUTF-8バイト数とSHA-256を実計算。PCのファイル照合・ZIP作成・送信は含みません。',
    fields: [field('text', '照合するテキスト', '納品テストの原稿です。', true)],
  },
  {
    id: 'rockstar-ledger',
    name: 'サブスク台帳',
    mode: 'simulation',
    scope:
      '架空の契約から月額を集計する模擬台帳。銀行・契約先とは接続しません。',
    fields: [
      field('text', '試験契約名', '制作ツール（架空）'),
      field('amount', '仮の月額（円）', '1200'),
    ],
  },
  {
    id: 'rockstar-markets-analysis',
    name: 'Market',
    mode: 'simulation',
    scope:
      '既存のPAPER注文入力を検査し、架空残高への影響を表示。約定・実注文・Wallet反映はしません。',
    fields: [
      field('price', '試験価格（PAPER単位）', '1200'),
      field('quantity', '数量', '2'),
    ],
  },
  {
    id: 'test-wallet',
    name: 'Wallet',
    mode: 'simulation',
    scope:
      '予約→使用→残りを戻す表示例。模擬台帳は実残高や正式な取引記録ではありません。',
    fields: [
      field('amount', '予約額（架空の残高10,000から）', '1000'),
      field('spent', '使用額', '700'),
    ],
  },
  {
    id: 'test-zema',
    name: 'Zemaの仕事',
    mode: 'local',
    scope:
      '既存の業務状態遷移を実行。サンプル実行は完了判定に使わず、本番の仕事は作りません。',
    fields: [field('text', '仕事名', '記事の出力をテストする')],
  },
  {
    id: 'test-cloud-ai',
    name: 'クラウドAI',
    mode: 'unconnected',
    scope:
      '接続鍵・利用枠の設定が必要です。応答形式を確認できますが、AIによる生成結果はありません。',
    fields: [field('text', '試したい依頼', '新商品の紹介文を書いて', true)],
  },
];

/** Catalog coverage is explicit: unknown integrations never inherit execution rights. */
export const testScenarios: TestScenario[] = [
  ...definitions,
  ...catalog
    .filter((item) => !definitions.some((scenario) => scenario.id === item.id))
    .map(
      (item): TestScenario => ({
        id: item.id,
        name: item.name,
        mode: 'unconnected',
        scope: `${item.environment}。このテスト入口には実行アダプターが未接続です。結果は未実行として表示します。`,
        fields: [
          field('text', '試したい入力', `${item.name}の出力を確認したい`, true),
        ],
      }),
    ),
];
export type TestResult = {
  id: string;
  name: string;
  mode: TestScenario['mode'];
  status: 'output' | 'not_run';
  scope: string;
  output: string;
  format: 'txt' | 'csv';
  details?: unknown;
  executedAt: string;
};
export const testModeLabels = {
  local: '実処理',
  simulation: '模擬データ',
  unconnected: '接続待ち',
};
export function sampleValues(scenario: TestScenario): Record<string, string> {
  return Object.fromEntries(
    scenario.fields.map((item) => [item.key, item.value]),
  );
}
