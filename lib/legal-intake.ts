import { LAWYER_DIRECTORY, LAWYER_DIRECTORY_AS_OF } from './generated/private-content.ts';

// The directory lives in private/legal/lawyer-directory.json and is generated into
// lib/generated at build time (scripts/generate-private-modules.mjs).
export const LEGAL_DIRECTORY_AS_OF = LAWYER_DIRECTORY_AS_OF;

export const legalIssueCategories = [
  { id: 'criminal', label: '刑事・逮捕・交通違反' },
  { id: 'immigration', label: 'ビザ・移民' },
  { id: 'housing', label: '住居・賃貸・不動産' },
  { id: 'employment', label: '職場・雇用・賃金' },
  { id: 'injury', label: '事故・けが・医療事故' },
  { id: 'family', label: '離婚・親権・家族' },
  { id: 'estate', label: '相続・遺言・信託' },
  { id: 'business', label: '会社・契約・M&A' },
  { id: 'ip', label: '知財・商標・著作権・エンタメ' },
  { id: 'litigation', label: '訴訟・紛争・その他' },
  { id: 'tax_finance', label: '税務・倒産・金融' },
] as const;

export type LegalIssueId = (typeof legalIssueCategories)[number]['id'];
export type LegalLocation =
  | 'nyc'
  | 'ny_state'
  | 'new_jersey'
  | 'pennsylvania'
  | 'other';
export type LegalMatterStage =
  | 'general_information'
  | 'active_problem'
  | 'document_review'
  | 'court_or_agency';
export type LegalContactPreference = 'email' | 'phone' | 'website';
export type LegalUrgency =
  | 'emergency'
  | 'urgent'
  | 'lawyer_recommended'
  | 'guided_information';

export type LawyerDirectoryEntry = {
  id: string;
  name: string;
  categories: LegalIssueId[];
  regions: LegalLocation[];
  website?: string;
  phone?: string;
  email?: string;
  contactNote?: string;
  focus: string;
  /** Extra ranking weight for specific issue types. */
  recommendationBoost?: Partial<Record<LegalIssueId, number>>;
  /** Issue types for which this entry is the first contact when a lawyer is required. */
  primaryFor?: LegalIssueId[];
  /** Short name used in UI copy, e.g. a lawyer's name. */
  displayName?: string;
};

export type LegalIntakeInput = {
  issueType: LegalIssueId;
  location: LegalLocation;
  matterStage: LegalMatterStage;
  situationSummary: string;
  desiredOutcome: string;
  deadlineDate?: string;
  immediateDanger: boolean;
  detainedOrArrested: boolean;
  domesticViolence: boolean;
  receivedOfficialDocument: boolean;
  contactPreference: LegalContactPreference;
};

export type LegalAssessment = {
  urgency: LegalUrgency;
  headline: string;
  explanation: string;
  nextActions: string[];
  documentChecklist: string[];
  lawyerRequired: boolean;
  matchedLawyerIds: string[];
  primaryCounselId?: string;
};

export type OfficialLegalResource = {
  id: string;
  label: string;
  description: string;
  url: string;
  categories: LegalIssueId[] | 'all';
  locations: LegalLocation[] | 'all';
};

export const lawyerDirectory: LawyerDirectoryEntry[] = [...LAWYER_DIRECTORY];

const documentChecklists: Record<LegalIssueId, string[]> = {
  criminal: [
    '召喚状・告発状・裁判所書類',
    '逮捕・出頭・期日の日時と場所',
    '警察や検察との連絡記録',
  ],
  immigration: [
    'USCIS・国務省・移民裁判所からの通知',
    '申請控えと受領番号（Botには番号を入力しない）',
    '在留期限と渡航予定',
  ],
  housing: [
    '賃貸契約書・更新書類',
    '退去・家賃・修繕に関する通知',
    '支払記録・写真・やり取り',
  ],
  employment: [
    '雇用契約・オファー・就業規則',
    '給与明細・勤務記録',
    '警告、解雇、差別・ハラスメントの記録',
  ],
  injury: ['事故報告書・写真', '医療記録と費用', '保険会社・相手方との連絡'],
  family: [
    '申立書・命令・既存合意',
    '結婚・子ども・居住に関する基本情報',
    '収入・資産・支出の資料',
  ],
  estate: [
    '遺言・信託・委任状',
    '死亡証明書など関係書類',
    '資産・負債・受益者の一覧',
  ],
  business: [
    '契約書・提案書・請求書',
    '会社の設立・所有関係資料',
    '相手方との重要な連絡',
  ],
  ip: [
    '登録・出願・ライセンス資料',
    '作品・商標・使用開始を示す資料',
    '無断使用のURL・日時・記録',
  ],
  litigation: [
    '訴状・答弁・命令・通知',
    '時系列と当事者一覧',
    '契約・領収書・やり取りなどの証拠',
  ],
  tax_finance: [
    '税務・債権者・裁判所からの通知',
    '申告・口座・債務の資料',
    '期限と金額の一覧',
  ],
};

export const officialLegalResources = {
  nyCourtHelp: 'https://www.nycourts.gov/help/courthelp',
  nyCourtsFindLawyer:
    'https://www.nycourts.gov/help/representing-yourself-court/find-lawyer',
  lawHelpNy: 'https://www.lawhelpny.org/',
  nyCourtsDiyForms: 'https://www.nycourts.gov/help/diy-forms',
  nyOfficialLaws: 'https://www.nysenate.gov/legislation/laws/CONSOLIDATED',
  njCourtHelp: 'https://www.njcourts.gov/self-help',
  paCourtHelp: 'https://www.pacourts.us/learn/representing-yourself',
  federalCourtHelp: 'https://www.uscourts.gov/court-programs/legal-assistance',
  nycDomesticViolence:
    'https://www.nyc.gov/site/nypd/services/law-enforcement/domestic-violence.page',
  consulateInterpreterDirectory: 'https://www.atanet.org/directory/',
};

export const selfHelpResources: OfficialLegalResource[] = [
  {
    id: 'ny-courthelp',
    label: 'NY CourtHelp',
    description: 'ニューヨーク州裁判所の手続、書式、無料窓口を探す',
    url: officialLegalResources.nyCourtHelp,
    categories: 'all',
    locations: ['nyc', 'ny_state'],
  },
  {
    id: 'lawhelpny',
    label: 'LawHelpNY',
    description: '無料・低額の法律支援と一般情報を探す',
    url: officialLegalResources.lawHelpNy,
    categories: 'all',
    locations: ['nyc', 'ny_state'],
  },
  {
    id: 'ny-diy',
    label: 'NY Courts DIY Forms',
    description: '裁判所公式の無料書式作成プログラムを確認する',
    url: officialLegalResources.nyCourtsDiyForms,
    categories: ['housing', 'family', 'estate', 'litigation'],
    locations: ['nyc', 'ny_state'],
  },
  {
    id: 'nj-self-help',
    label: 'NJ Courts Self-Help',
    description: 'ニュージャージー州裁判所の公式セルフヘルプ',
    url: officialLegalResources.njCourtHelp,
    categories: 'all',
    locations: ['new_jersey'],
  },
  {
    id: 'pa-self-help',
    label: 'PA Courts Self-Representation',
    description: 'ペンシルベニア州裁判所の本人対応案内',
    url: officialLegalResources.paCourtHelp,
    categories: 'all',
    locations: ['pennsylvania'],
  },
  {
    id: 'federal-help',
    label: 'U.S. Courts Legal Assistance',
    description: '連邦裁判所の無料・低額法律支援を確認する',
    url: officialLegalResources.federalCourtHelp,
    categories: [
      'criminal',
      'immigration',
      'business',
      'litigation',
      'tax_finance',
    ],
    locations: 'all',
  },
];

const categoryIds = new Set(
  legalIssueCategories.map((category) => category.id),
);
const locationIds = new Set<LegalLocation>([
  'nyc',
  'ny_state',
  'new_jersey',
  'pennsylvania',
  'other',
]);
const stageIds = new Set<LegalMatterStage>([
  'general_information',
  'active_problem',
  'document_review',
  'court_or_agency',
]);
const contactIds = new Set<LegalContactPreference>([
  'email',
  'phone',
  'website',
]);
const DAY_MS = 86_400_000;

export function isLegalIssueId(value: unknown): value is LegalIssueId {
  return typeof value === 'string' && categoryIds.has(value as LegalIssueId);
}

export function isLegalLocation(value: unknown): value is LegalLocation {
  return typeof value === 'string' && locationIds.has(value as LegalLocation);
}

export function isLegalMatterStage(value: unknown): value is LegalMatterStage {
  return typeof value === 'string' && stageIds.has(value as LegalMatterStage);
}

export function isLegalContactPreference(
  value: unknown,
): value is LegalContactPreference {
  return (
    typeof value === 'string' && contactIds.has(value as LegalContactPreference)
  );
}

function parseDay(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const date = new Date(timestamp);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
    ? timestamp
    : null;
}

export function primaryCounselFor(
  issueType: LegalIssueId,
): LawyerDirectoryEntry | undefined {
  return lawyerDirectory.find((lawyer) => lawyer.primaryFor?.includes(issueType));
}

export function recommendLawyers(
  issueType: LegalIssueId,
  location: LegalLocation,
  limit = 5,
): LawyerDirectoryEntry[] {
  const candidates = lawyerDirectory
    .filter((lawyer) => lawyer.categories.includes(issueType))
    .map((lawyer, index) => ({
      lawyer,
      index,
      score:
        (lawyer.regions.includes(location) ? 30 : 0) +
        (location === 'nyc' && lawyer.regions.includes('ny_state') ? 10 : 0) +
        (lawyer.recommendationBoost?.[issueType] ?? 0) +
        Math.max(0, 8 - lawyer.categories.length),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ lawyer }) => lawyer);
  return candidates.slice(0, Math.max(1, Math.min(limit, 8)));
}

export function getSelfHelpResources(
  issueType: LegalIssueId,
  location: LegalLocation,
  limit = 3,
): OfficialLegalResource[] {
  return selfHelpResources
    .filter(
      (resource) =>
        (resource.locations === 'all' ||
          resource.locations.includes(location)) &&
        (resource.categories === 'all' ||
          resource.categories.includes(issueType)),
    )
    .slice(0, Math.max(1, Math.min(limit, 5)));
}

export function assessLegalIntake(
  input: LegalIntakeInput,
  now = new Date(),
): LegalAssessment {
  const deadline = parseDay(input.deadlineDate);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const deadlineDays =
    deadline === null ? null : Math.ceil((deadline - today) / DAY_MS);
  let urgency: LegalUrgency;
  if (input.immediateDanger) {
    urgency = 'emergency';
  } else if (
    input.detainedOrArrested ||
    (deadlineDays !== null && deadlineDays <= 7) ||
    (input.receivedOfficialDocument && input.matterStage === 'court_or_agency')
  ) {
    urgency = 'urgent';
  } else if (
    input.matterStage !== 'general_information' ||
    input.receivedOfficialDocument ||
    deadlineDays !== null
  ) {
    urgency = 'lawyer_recommended';
  } else {
    urgency = 'guided_information';
  }

  const baseActions = [
    '関係する日付・人物・出来事を時系列で整理する',
    '原本を変更せず、関連書類とメッセージを安全な場所に保存する',
    '社会保障番号、口座番号、パスワードはこのBotに入力しない',
  ];
  const urgencyCopy: Record<
    LegalUrgency,
    Pick<
      LegalAssessment,
      'headline' | 'explanation' | 'nextActions' | 'lawyerRequired'
    >
  > = {
    emergency: {
      headline: 'まず安全を確保してください',
      explanation:
        '今この瞬間の危険はチャットでは対応できません。安全な場所へ移動し、米国内の緊急時は911へ連絡してください。',
      nextActions: [
        '米国内で差し迫った危険がある場合は911へ連絡する',
        ...(input.domesticViolence
          ? ['NYCでは24時間のHOPE Hotline 1-800-621-4673も利用できます']
          : []),
        '安全が確保できたら弁護士へ連絡する',
      ],
      lawyerRequired: true,
    },
    urgent: {
      headline: '今日中に弁護士へ連絡してください',
      explanation:
        '逮捕・拘束、裁判所や行政機関の手続、または近い期限が関係しています。Botだけで判断せず、書類を手元に置いて弁護士へ連絡してください。',
      nextActions: [
        '期限・出頭日時をカレンダーへ記録する',
        '書類の表裏を含む写しを用意する',
        '本日中に候補へ連絡し、利益相反確認と受任可否を尋ねる',
      ],
      lawyerRequired: true,
    },
    lawyer_recommended: {
      headline: '弁護士への相談をおすすめします',
      explanation:
        '現在進行中の問題、書類確認、期限のいずれかがあります。Botは状況整理までを行い、権利・戦略・期限の判断は弁護士へ引き継ぎます。',
      nextActions: [
        '相談時に知りたい質問を3つ以内にまとめる',
        ...baseActions,
        '候補へ連絡し、専門分野・費用・対応可能地域を確認する',
      ],
      lawyerRequired: true,
    },
    guided_information: {
      headline: 'まず情報整理から進められます',
      explanation:
        '現時点では一般情報の確認段階です。Botで論点と資料を整理できます。個別の権利、期限、勝敗の判断が必要になった時点で弁護士へ切り替えてください。',
      nextActions: [
        ...baseActions,
        'ニューヨーク州裁判所の公式案内で手続・無料支援・紹介制度を確認する',
      ],
      lawyerRequired: false,
    },
  };
  const copy = urgencyCopy[urgency];
  return {
    urgency,
    ...copy,
    documentChecklist: documentChecklists[input.issueType],
    matchedLawyerIds: recommendLawyers(input.issueType, input.location).map(
      (lawyer) => lawyer.id,
    ),
    primaryCounselId: copy.lawyerRequired
      ? primaryCounselFor(input.issueType)?.id
      : undefined,
  };
}

export function buildHandoffSummary(
  input: LegalIntakeInput,
  assessment: LegalAssessment,
): string {
  const issue =
    legalIssueCategories.find((category) => category.id === input.issueType)
      ?.label ?? input.issueType;
  const flags = [
    input.immediateDanger ? '差し迫った危険あり' : '',
    input.detainedOrArrested ? '逮捕・拘束あり' : '',
    input.domesticViolence ? 'DV・対人安全の懸念あり' : '',
    input.receivedOfficialDocument ? '公的書類あり' : '',
  ].filter(Boolean);
  return [
    '【法律相談受付サマリー】',
    `分野: ${issue}`,
    `緊急度: ${assessment.urgency}`,
    `地域: ${input.location}`,
    `段階: ${input.matterStage}`,
    `期限: ${input.deadlineDate || '未入力'}`,
    `注意事項: ${flags.length ? flags.join(' / ') : '特記事項なし'}`,
    `状況: ${input.situationSummary.trim()}`,
    `希望: ${input.desiredOutcome.trim() || '未入力'}`,
    '',
    'このサマリーは本人入力の整理であり、法的評価・事実認定ではありません。利益相反確認と受任可否の確認をお願いします。',
  ].join('\n');
}
