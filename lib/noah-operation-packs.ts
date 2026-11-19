import { catalog } from './catalog.ts';
import { defaultSkyAgentSettings, parseSkyAgentSettings } from './sky-agent-library.ts';

export const NOAH_OPERATIONS_VERSION = '0.1.0';

function role(id: string, name: string, catalogId: string, tools: string[], instructions: string) {
  if (!catalog.some(item => item.id === catalogId && item.status === 'ready'))
    throw new Error(`運用パックの既存Toolが見つかりません: ${catalogId}`);
  return {
    id, catalogId, suggestedTools: tools,
    settings: parseSkyAgentSettings({ ...defaultSkyAgentSettings(name, instructions), enabled: false }),
  };
}

/** Distribution descriptions only. Neither a grant nor a new Agent/Job runtime. */
export function noahOperationPacks() {
  const mrTools = ['coconala_check', 'format_citations', 'make_free_article', 'verify_delivery'];
  const definitions = [
    {
      id: 'article-editing', name: '記事編集パック', mode: 'local-tools',
      roles: [
        role('source-editor', '出典整理担当', 'mr-citations', ['format_citations'],
          '渡された原稿の出典リンクを整理する担当です。出典整理Toolの実結果を確認してから報告してください。リンク先を読んだ、事実確認した、公開したと推測で述べないでください。'),
        role('free-article-editor', '無料記事編集担当', 'mr-free-article', ['make_free_article'],
          '本人の完成原稿、要点、無料範囲、価格、記事URLを確認し、無料版作成Toolで編集する担当です。未指定の価格や要点を補完せず、完成文を本人の確認に返してください。投稿や販売は行いません。'),
      ],
      serverId: 'rock-star-mr', exposedTools: mrTools,
      workflow: ['本人の原稿を選ぶ', '出典整理の結果を確認する', '無料範囲・要点・価格・記事URLを指定する', '無料版を作成し、本人が保存する'],
    },
    {
      id: 'delivery-support', name: '案件・納品パック', mode: 'local-tools',
      roles: [
        role('brief-checker', '案件条件チェック担当', 'coconala', ['coconala_check'],
          '依頼文と本人の提案文の条件を既存案件チェックToolで照合する担当です。受注・規約適合・収益を保証せず、不一致と未確認条件を説明してください。応募や返信を送信しません。'),
        role('delivery-checker', '納品照合担当', 'mr-delivery', ['verify_delivery'],
          '契約条件、成果物、制作記録、独立したレビュー記録を納品照合Toolで確認する担当です。PASSは記録の一致として報告し、品質や本人承認へ置き換えないでください。架空のレビューを作りません。'),
      ],
      serverId: 'rock-star-mr', exposedTools: mrTools,
      workflow: ['依頼文と提案文の条件を照合する', '本人が制作する', '成果物と制作・レビュー記録を選ぶ', '照合結果を確認し、本人が納品する'],
    },
    {
      id: 'brand-operations', name: 'ブランド運営パック', mode: 'mock-planning',
      roles: [
        role('brand-planner', 'ブランド企画担当', 'fashion-brand-ops', ['fashion.producer.start', 'fashion.autopilot.tick'],
          'ブランド方針と商品から既存ブランド運営Toolで計画と下書きを作る担当です。現在のパックは試用設定です。外部生成・投稿・広告の成功を主張せず、必要な本人判断を示してください。'),
        role('sales-drafter', '接客下書き担当', 'fashion-brand-ops', ['fashion.concierge.prepare'],
          '本人が渡した問い合わせと商品条件から接客下書きを準備する担当です。送信、価格変更、請求は行わず、条件が不明なら確認事項にしてください。'),
        role('production-coordinator', '制作管理担当', 'fashion-brand-ops', ['fashion.production.dashboard'],
          '既存ブランド運営Toolの制作計画、納期、未解決事項を説明する担当です。入金や発送を推測で完了にせず、試用データと実際の注文を区別してください。'),
      ],
      serverId: 'fashion-brand-ops', exposedTools: 'existing-fashion-mcp',
      workflow: ['方針と商品を入力する', '内部計画・投稿下書きを確認する', '接客・制作の不足条件を確認する', '外部サービス接続と実操作は別の受入へ進む'],
    },
  ];
  return definitions.map(({ serverId, exposedTools, ...definition }) => ({
    schema: 'noah.operation-pack/1', version: NOAH_OPERATIONS_VERSION, ...definition,
    connector: {
      serverId, registry: `toolkits/sky-mcp-connector/registry.${definition.id}.json`, exposedTools,
      roleToolListsAre: 'recommendations_not_permissions',
    },
    runtime: { executionTarget: 'pc', node: '>=22.13.0', pythonMac: '>=3.13', pythonLinux: '>=3.10',
      model: 'Existing local-model selection; weights and ready state are not included', llmRequiredForBundledTools: false },
    approval: { connector: 'existing_authenticated_one_shot', provider: 'existing_exact_approval', automaticDispatch: false },
    storage: definition.id === 'brand-operations' ? 'Owner state directory; existing Fashion SQLite' : 'Existing Work records and explicit owner export; MCP temporary inputs',
    limitations: ['Agent設定は初期無効。本人の既存libraryへの登録・モデル選択は別操作', '定期実行と無人運転は未接続',
      'Noah端末ストアのZIP一括追加・Pixel実機・本番Providerは未受入'],
  }));
}

export function noahOperationCandidates() {
  return catalog.filter(item => item.origin === 'mr' && item.status === 'candidate')
    .map(({ id, name, environment }) => ({ id, name, status: 'candidate', runnable: false, reason: environment }));
}
