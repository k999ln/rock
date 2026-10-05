// A deliberately bounded local preparation template, not a semantic AI planner.
// This module only returns data; it cannot start work or touch canonical AMC.
export function requestPlanSupport(request) {
  if (typeof request !== 'string' || !request.trim())
    return '作りたいものを一言で教えてください。';
  if (request.length > 8000) return '依頼とGoalは8,000文字以内にしてください。';
  // Normalize only for routing; keep the user's original request in the brief.
  const routingText = request.normalize('NFKC');
  if (
    !/\bamc\b|アプリ|ツール|ソフトウェア|システム|\bweb\b|サイト|\bapp\b|software|ダッシュボード|チャット|タスク管理|\b(?:chatbot|bots?|api|rpa)\b|(?:^|[^ロ])ボット|プログラム|スクリプト|自動化|エージェント/i.test(
      routingText,
    )
  )
    return 'この入口はアプリ・ツール・Webなどのソフトウェア試作向けです。作りたいソフトウェアも一緒に書いてください。既存のOS・ハードウェア計画は「詳細・手動管理」から開けます。';
  return null;
}

export function buildRequestPlan({ request, goal, intent, planId, createdAt }) {
  const error = requestPlanSupport(request);
  if (error) throw new Error(error);
  if (typeof goal !== 'string' || !goal.trim())
    throw new Error('Goalを入力してください。何ができたら完成ですか？');
  if (goal.length > 8000)
    throw new Error('Goalは8,000文字以内にしてください。');
  if (typeof intent !== 'string' || !intent.trim())
    throw new Error('意図を一言で教えてください。誰の、何を良くしたいですか？');
  if (intent.length > 2000)
    throw new Error('意図は2,000文字以内にしてください。');
  if (typeof planId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(planId))
    throw new Error('Invalid request plan ID');
  const brief = {
    schema: 'amc-request-brief/1',
    request: request.trim(),
    goal: goal.trim(),
    intent: intent.trim(),
    templateId: 'software-local-prototype-v1',
  };
  const boundary =
    'ソフトウェアのローカル試作だけ。既存AMCの製品taskや受入条件は置き換えない。公開・外部送信・課金・契約・実機操作・資産移動（実売買・送金を含む）は行わない。依頼の曖昧さや範囲追加は人へ確認し、別のGoalや目的を勝手に作らない。';
  const rows = [
    [
      'REQ-01',
      'REQ-DESIGN',
      'Goalと意図を実装条件にする',
      'document',
      '依頼の中の必須要件・対象外・未決事項を整理する。依頼にない機能は追加しない。',
      '元の依頼・Goal・意図と各要件を対応付け、曖昧な点には質問を残す。未解決の重要な質問があれば後続を保留する。',
      'requirements.md',
    ],
    [
      'REQ-02',
      'REQ-DESIGN',
      '今あるものと、足りないものを調べる',
      'document',
      '既存のコード・設計・制約を確認し、再利用するものを決める。対象を特定できなければ確認を求める。',
      '実際に確認した資料・コードと不足点を区別し、推測を実装済みと扱わない。',
      'inventory.md',
    ],
    [
      'REQ-03',
      'REQ-DESIGN',
      '最小の使い方と作業順を決める',
      'document',
      'Goalに直結する利用の流れ、入出力、保存、失敗時の扱いを設計する。具体的な実装単位と工数を再見積りする。',
      '各実装単位が承認したGoal・意図へ結び付き、追加権限・範囲変更があれば実装前に確認する。',
      'design.md',
    ],
    [
      'REQ-04',
      'REQ-BUILD',
      '最小の動く試作を作る',
      'code_test',
      '確認済みの設計に沿って、ローカルで試せる最小構成を実装する。実際の変更ファイルを成果報告へ列挙する。',
      'Goalに対応する利用手順がローカルで動き、未接続の機能・外部処理を成功したように見せない。',
      'implementation.md',
    ],
    [
      'REQ-05',
      'REQ-TEST',
      '動作と失敗時の挙動を確かめる',
      'code_test',
      '正常系・異常系・保存復旧・権限境界を試験し、失敗は実装へ返す。',
      '再現手順・実際の試験結果・未検証事項を記録し、合格していないものを完成扱いしない。',
      'test-results.md',
    ],
    [
      'REQ-06',
      'REQ-TEST',
      '依頼からずれていないか確認する',
      'document',
      '実装担当と別の確認担当が、元の依頼と意図に照らして成果を検収する。',
      '依頼したこと・できたこと・できていないことを対照し、勝手に増えた目的や機能がないことを確認する。',
      'review.md',
    ],
    [
      'REQ-07',
      'REQ-LEAD',
      '成果と使い方をまとめる',
      'document',
      '成果物、使い始める手順、残課題を一つにまとめてGoal全体の確認へ渡す。',
      '別担当が使い方を再現でき、Goal全体の受入証拠がそろう。公開や本番受入とは区別する。',
      'handoff.md',
    ],
  ];
  const rules = [
    boundary,
    '追加の目的は提案に留め、承認なく実行計画へ混ぜない。',
    '未確定事項・失敗・追加権限の必要性を隠さず、人が判断できる詳細を残す。',
    'この計画は共通テンプレート。意味理解による分解ではなく、具体化と工数の再評価を最初に行う。',
  ];
  const squads = [
    ['REQ-DESIGN', '設計部隊', '依頼の意図を、迷わず作れる設計へ'],
    ['REQ-BUILD', '実装部隊', '承認範囲内の最小の試作を作る'],
    ['REQ-TEST', '検証部隊', '動作と意図の一致を証拠で確かめる'],
    ['REQ-LEAD', '統括部隊', '依存と未決事項を整理し、成果を引き渡す'],
  ].map(([id, name, squadGoal]) => ({
    id,
    name,
    goal: squadGoal,
    rules,
    acceptanceGate: '担当成果と全条件の証拠を、別担当が確認する。',
    nextTaskIds: rows.filter((row) => row[1] === id).map((row) => row[0]),
  }));
  const tasks = rows.map(([id, , title], i) => ({
    id,
    title,
    status: 'planned',
    evidence: [],
    dependsOn: i ? [rows[i - 1][0]] : [],
  }));
  const taskPlans = rows.map(
    ([id, , title, workloadClass, action, criterion, file]) => ({
      taskId: id,
      scope: `${title}。今回のGoal: ${brief.goal}。意図: ${brief.intent}。${boundary}`,
      workloadClass,
      executionBoundary: boundary,
      unresolvedDecision:
        'テンプレートに不足する詳細はREQ-01〜03で具体化。重要な不明点は人へ確認する。',
      inputs: [
        {
          path: `amc-work/${planId}/request.md`,
          locator: 'Goal JSONのrequestBriefが原本。実ファイルは未作成。',
        },
      ],
      steps: [
        { id: `${id}-S1`, action },
        {
          id: `${id}-S2`,
          action:
            '成果・根拠・未確認事項を残して、実装者とは別の担当へ確認を依頼する。',
        },
      ],
      deliverables: [
        {
          path: `amc-work/${planId}/${file}`,
          description: `${title}の成果と証拠への参照。予定パスであり、まだ作成されていない。`,
        },
      ],
      acceptanceCriteria: [
        {
          id: `${id}-AC1`,
          criterion,
          verification: '独立した確認担当が実物と証拠を検収する。',
          status: 'not_verified',
          evidence: [],
        },
      ],
    }),
  );
  const coverage = `Goal: ${brief.goal}\n意図: ${brief.intent}\n${boundary}\n汎用7工程の準備計画を承認する。依頼の網羅性・最終工数はREQ-01〜03で再確認し、重要な不足は本人へ確認する。`;
  const acceptanceCriteria = [
    {
      id: 'GOAL-AC1',
      criterion: `「${brief.goal}」をローカル試作で満たすことを、実際の利用手順と証拠で確認できる。`,
    },
    {
      id: 'GOAL-AC2',
      criterion: `意図「${brief.intent}」と成果の対応を説明でき、元の依頼からの追加・未達・重要な未決事項がないか確認されている。`,
    },
    {
      id: 'GOAL-AC3',
      criterion:
        '各作業の成果を別担当が検収し、使い方・試験結果・未接続機能を明示している。課金・公開・実機・外部作用はこの承認に含まない。',
    },
  ];
  return {
    brief,
    coverage,
    acceptanceCriteria,
    mission: {
      updatedAt: createdAt,
      globalRules: rules,
      executionHolds: [],
      squads,
      taskPlans,
      taskAssignments: rows.map(([taskId, primarySquad]) => ({
        taskId,
        primarySquad,
        classification: 'request_proposal',
      })),
    },
    project: { updatedAt: createdAt, tasks },
  };
}
