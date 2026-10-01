export type DisclosureStatus =
  | 'not_disclosed'
  | 'private_only'
  | 'already_disclosed'
  | 'unknown';

export type PatentIntakeInput = {
  inventionTitle: string;
  problem: string;
  mechanism: string;
  architecture: string;
  technicalEffect: string;
  differences: string;
  knownPriorArt: string;
  inventor: string;
  applicant: string;
  disclosureStatus: DisclosureStatus;
  disclosureDate?: string;
};

export type PatentReadiness = 'early' | 'research_ready' | 'draft_ready';

export type PatentAssessment = {
  readiness: PatentReadiness;
  score: number;
  headline: string;
  strengths: string[];
  gaps: string[];
  warnings: string[];
  nextActions: string[];
};

export type PatentResearchCitation = { title: string; url: string };

export type PatentResearchSummary = {
  answer: string;
  citations: PatentResearchCitation[];
  searchedAt: string;
};

export const disclosureLabels: Record<DisclosureStatus, string> = {
  not_disclosed: 'まだ公開していない',
  private_only: '秘密保持の範囲だけで共有した',
  already_disclosed: '販売・投稿・発表などで公開した',
  unknown: '分からない',
};

const clean = (value: string) => value.trim().replace(/\r\n/g, '\n');

export function buildPatentSearchQueries(input: PatentIntakeInput) {
  const japanese = [
    input.inventionTitle,
    clean(input.problem).slice(0, 80),
    clean(input.mechanism).slice(0, 120),
    clean(input.technicalEffect).slice(0, 80),
  ]
    .filter(Boolean)
    .join(' ');
  const concept = [
    clean(input.mechanism).slice(0, 160),
    clean(input.architecture).slice(0, 120),
    clean(input.technicalEffect).slice(0, 80),
  ]
    .filter(Boolean)
    .join(' / ');
  return {
    japanese,
    concept,
    databaseLinks: [
      {
        label: 'J-PlatPatで確認',
        url: 'https://www.j-platpat.inpit.go.jp/',
      },
      {
        label: 'Google Patentsで補助検索',
        url: `https://patents.google.com/?q=${encodeURIComponent(japanese)}`,
      },
      {
        label: 'Espacenetで補助検索',
        url: `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(japanese)}`,
      },
      {
        label: 'WIPO PATENTSCOPEで確認',
        url: 'https://patentscope.wipo.int/search/en/search.jsf',
      },
    ],
  };
}

export function assessPatentReadiness(
  input: PatentIntakeInput,
): PatentAssessment {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const checks: Array<[string, string, number]> = [
    [input.problem, '解決する技術的な課題', 15],
    [input.mechanism, '課題を解く具体的な仕組み', 25],
    [input.architecture, '構成要素とデータの流れ', 15],
    [input.technicalEffect, '仕組みから生じる技術的効果', 20],
    [input.differences, '既存技術との違い', 25],
  ];
  for (const [value, label, points] of checks) {
    if (clean(value).length >= 30) {
      score += points;
      strengths.push(`${label}が具体的に記載されています。`);
    } else {
      gaps.push(`${label}を30文字以上で具体化してください。`);
    }
  }

  if (input.disclosureStatus === 'already_disclosed') {
    warnings.push(
      '出願前公開の可能性があります。公開日・公開内容・公開先を保存し、例外の適用可否を弁理士へ至急確認してください。',
    );
  } else if (input.disclosureStatus === 'unknown') {
    warnings.push(
      '公開状況が不明です。販売、Git、SNS、デモ、展示、提案資料まで確認してください。',
    );
  }
  if (!clean(input.inventor)) gaps.push('発明者候補を確認してください。');
  if (!clean(input.applicant)) gaps.push('出願人候補を確認してください。');

  const readiness: PatentReadiness =
    score >= 85 && warnings.length === 0
      ? 'draft_ready'
      : score >= 55
        ? 'research_ready'
        : 'early';
  const headline =
    readiness === 'draft_ready'
      ? '先行技術調査と書類レビューへ進める状態です'
      : readiness === 'research_ready'
        ? '検索を始められますが、請求項作成前に補足が必要です'
        : '発明の技術的な内容をもう少し具体化してください';
  return {
    readiness,
    score,
    headline,
    strengths,
    gaps,
    warnings,
    nextActions: [
      '検索候補を読み、同じ構成・作用・効果が開示されていないか確認する',
      '候補文献と自分の発明の相違点を一文ずつ記録する',
      'ドラフトを弁理士または知財担当者に確認してもらう',
      '本人確認後に電子証明書、手数料、提出方法を準備する',
    ],
  };
}

function section(title: string, value: string, fallback: string) {
  return `【${title}】\n${clean(value) || fallback}`;
}

export function buildPatentPacket(
  input: PatentIntakeInput,
  assessment: PatentAssessment,
  research?: PatentResearchSummary | null,
) {
  const queries = buildPatentSearchQueries(input);
  const abstract = [input.problem, input.mechanism, input.technicalEffect]
    .map(clean)
    .filter(Boolean)
    .join('。')
    .slice(0, 380);
  const claimSubject = clean(input.architecture) || '複数の構成要素';
  const researchText = research
    ? [
        research.answer,
        '',
        ...research.citations.map(
          (citation, index) =>
            `${index + 1}. ${citation.title} — ${citation.url}`,
        ),
        `調査日時: ${research.searchedAt}`,
      ].join('\n')
    : 'AIによる先行技術候補の調査は未実施です。下記の検索式を使い、各文献を本人または専門家が確認してください。';

  return [
    '# Sky 特許出願準備パケット',
    '',
    `作成日: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '> これは出願可否の保証や法的助言ではありません。AIの候補調査は完全ではなく、出願書類は弁理士等の確認前ドラフトです。Skyは電子署名、料金支払、特許庁への提出を行いません。',
    '',
    '## 1. 発明整理',
    '',
    section('発明の名称', input.inventionTitle, '未入力'),
    '',
    section('発明者候補', input.inventor, '要確認'),
    '',
    section('出願人候補', input.applicant, '要確認'),
    '',
    section('公開状況', disclosureLabels[input.disclosureStatus], '要確認'),
    input.disclosureDate ? `公開日候補: ${input.disclosureDate}` : '',
    '',
    '## 2. 予備評価',
    '',
    `準備度: ${assessment.score}/100 — ${assessment.headline}`,
    '',
    ...assessment.strengths.map((item) => `- 強み: ${item}`),
    ...assessment.gaps.map((item) => `- 補足: ${item}`),
    ...assessment.warnings.map((item) => `- 重要: ${item}`),
    '',
    '## 3. 先行技術調査記録',
    '',
    `日本語検索式: ${queries.japanese}`,
    '',
    `概念検索メモ: ${queries.concept}`,
    '',
    researchText,
    '',
    '## 4. 明細書ドラフト',
    '',
    section('発明の名称', input.inventionTitle, '未入力'),
    '',
    section(
      '技術分野',
      input.architecture,
      '対象となる技術分野を追記してください。',
    ),
    '',
    section(
      '背景技術',
      input.knownPriorArt,
      '既知の製品・論文・特許文献を追記してください。',
    ),
    '',
    section('発明が解決しようとする課題', input.problem, '要追記'),
    '',
    section('課題を解決するための手段', input.mechanism, '要追記'),
    '',
    section('発明の効果', input.technicalEffect, '要追記'),
    '',
    section(
      '発明を実施するための形態',
      `${input.architecture}\n\n処理・制御:\n${input.mechanism}`,
      '構成、処理順序、入力、出力、例外処理、代替例を追記してください。',
    ),
    '',
    '## 5. 特許請求の範囲ドラフト',
    '',
    `【請求項1】\n${claimSubject}を備え、${clean(input.problem)}に対して、${clean(input.mechanism)}を実行することにより、${clean(input.technicalEffect)}を実現するシステム。`,
    '',
    `【請求項2】\n請求項1に記載のシステムにより実行される方法であって、${clean(input.mechanism)}を含む方法。`,
    '',
    `【請求項3】\nコンピュータに請求項2に記載の方法を実行させるためのプログラム。`,
    '',
    '> 請求項は保護範囲を決める重要部分です。上記の自動生成文をそのまま提出せず、先行技術との対比とサポート要件を専門家が確認してください。',
    '',
    '## 6. 要約書ドラフト',
    '',
    `【要約】\n${abstract || '要追記'}`,
    '',
    '## 7. 図面作成指示',
    '',
    '- 図1: システム全体の構成図',
    '- 図2: 入力から出力までの処理フロー',
    '- 図3: 主要構成要素間のデータフロー',
    '- 図4: 例外処理または代替実施形態',
    '',
    '## 8. 提出前チェック（日本）',
    '',
    '- [ ] 発明者・出願人・権利帰属を確認した',
    '- [ ] 公開日、販売日、Git履歴、デモ日を確認した',
    '- [ ] 候補文献を原文で読み、請求項ごとの差分を記録した',
    '- [ ] 明細書が各請求項を裏付け、実施できる程度に具体的か確認した',
    '- [ ] 弁理士または知財担当者が最終レビューした',
    '- [ ] 特許庁のインターネット出願ソフト、電子証明書、手数料を確認した',
    '- [ ] 提出直前の書類と宛先を本人が承認した',
    '',
    '公式入口:',
    '- J-PlatPat: https://www.j-platpat.inpit.go.jp/',
    '- 特許庁 インターネット出願: https://www.pcinfo.jpo.go.jp/site/4_start/0_online.html',
    '- 特許庁 手続・様式: https://www.jpo.go.jp/system/process/shutugan/pcinfo/operation/appl.html',
    '- 特許庁 手数料: https://www.jpo.go.jp/system/process/tesuryo/hyou.html',
  ].join('\n');
}
