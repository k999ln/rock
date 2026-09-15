export const LEGAL_DIRECTORY_AS_OF = '2026-06-18';

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

const ALL_CORE_REGIONS: LegalLocation[] = ['nyc', 'ny_state', 'new_jersey'];

export const lawyerDirectory: LawyerDirectoryEntry[] = [
  {
    id: 'akane-fujiwara',
    name: 'Akane Fujiwara Law Office / 藤原 茜 法律事務所',
    categories: ['criminal'],
    regions: ['nyc', 'ny_state', 'new_jersey'],
    website: 'https://fujiwaralawoffice.com/',
    phone: '+1-347-677-4168',
    email: 'fujiwara@fujiwaralawoffice.com',
    contactNote: '弁護士 藤原 茜',
    focus: '刑法、連邦法、ホワイトカラー犯罪。NY/NJおよびNY連邦地区裁判所。',
  },
  {
    id: 'aleinik',
    name: 'Aleinik Law Firm, PLLC',
    categories: ['business', 'litigation', 'housing', 'ip', 'immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.aleiniklaw.com/',
    phone: '+1-718-909-1989',
    email: 'kei.errico@aleiniklaw.com',
    contactNote: '弁護士 Kei Errico',
    focus: '商事訴訟、家主・借家人、契約、許認可、商標、移民。',
  },
  {
    id: 'andrew-ceraulo',
    name: 'Andrew Ceraulo Attorney at Law',
    categories: ['immigration', 'injury', 'employment'],
    regions: ['nyc', 'ny_state'],
    website: 'https://andrewceraulo.com/',
    phone: '+1-212-608-0012',
    email: 'Mutsuko.suzuki16@gmail.com',
    focus: '移民、交通・医療事故、職場のハラスメント・差別・賃金問題。',
  },
  {
    id: 'antao-chung',
    name: 'Antao & Chung, Attorney at Law',
    categories: ['immigration'],
    regions: ALL_CORE_REGIONS,
    phone: '+1-212-488-6899',
    email: 'contact@legalaction.com',
    focus: '移民法。ニューヨークとニュージャージーに拠点。',
  },
  {
    id: 'burghergray',
    name: 'BurgherGray LLP',
    categories: [
      'business',
      'employment',
      'litigation',
      'ip',
      'housing',
      'immigration',
      'estate',
      'tax_finance',
    ],
    regions: ['nyc', 'ny_state'],
    website: 'https://burghergray.com/',
    phone: '+1-212-603-9281',
    email: 'nmotegi@burghergray.com',
    contactNote: '弁護士 茂木 紀子',
    focus:
      '企業法務、労務、M&A、訴訟、知財、AI、不動産、移民、相続、倒産、税務。',
  },
  {
    id: 'danziger',
    name: 'Danziger, Danziger & Muro, LLP',
    categories: ['ip', 'business', 'housing', 'employment'],
    regions: ['nyc', 'ny_state'],
    website: 'https://danziger.com/',
    phone: '+1-212-754-7000',
    email: 'info@danziger.com',
    focus: '芸術・ファッション・知財、契約、国際取引、不動産、雇用。',
  },
  {
    id: 'florence-rostami',
    name: 'Florence Rostami Law LLC',
    categories: ['business', 'litigation', 'housing'],
    regions: ['nyc', 'ny_state'],
    website: 'https://rostamilaw.com/',
    phone: '+1-212-209-3962',
    email: 'hsugano@rostamilaw.com',
    focus: '契約、会社法、民事訴訟、不動産。',
  },
  {
    id: 'garganigo',
    name: 'Garganigo Goldsmith & Weiss',
    categories: ['immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.ggw.com/',
    phone: '+1-212-643-6400',
    email: 'askggw@ggw.com',
    focus: '移民法。',
  },
  {
    id: 'goldstein-lee',
    name: 'Goldstein & Lee, P.C.',
    categories: ['immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.goldsteinvisa.com/',
    phone: '+1-212-957-0500',
    email: 'tammylee@lorsg.com',
    contactNote: '追加連絡先 yumiko@lorsg.com',
    focus: '移民法。',
  },
  {
    id: 'gray-injury',
    name: 'Gray Injury Law / グレイ法律事務所',
    categories: ['injury', 'employment'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.grayinjurylaw.com/',
    phone: '+1-212-537-7000',
    email: 'contact@grayinjurylaw.com',
    focus:
      'タクシー・Uber・交通・建設事故、セクシャルハラスメント、施設管理者責任。',
  },
  {
    id: 'isoai',
    name: '礒合法律事務所',
    categories: [
      'criminal',
      'housing',
      'estate',
      'business',
      'injury',
      'litigation',
    ],
    regions: ['ny_state'],
    website: 'https://www.isoailaw.com/',
    phone: '+1-845-999-1250',
    email: 'info@isoailaw.com',
    focus:
      '交通違反・刑事弁護、家主借家人、相続、商取引、不動産、交通事故、民事。',
  },
  {
    id: 'kawasaki',
    name: 'Kawasaki Law Office PLLC',
    categories: ['business', 'housing', 'employment'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.kawasakilaw.com/',
    phone: '+1-917-546-9255',
    email: 'info@kawasakilaw.com',
    contactNote: '弁護士 川崎 晋平',
    focus: 'リカーライセンス、不動産、労働・雇用、契約、会社、M&A。',
  },
  {
    id: 'keiko-kato',
    name: 'Law Office of Keiko Kato',
    categories: ['business', 'immigration', 'employment', 'litigation'],
    regions: ['nyc', 'ny_state'],
    phone: '+1-212-251-0011',
    email: 'kkatolaw@earthlink.net',
    contactNote: '弁護士 加藤 恵子',
    focus: '会社、移民、契約、雇用、法律一般。',
  },
  {
    id: 'li-wakida',
    name: 'Li & Wakida, LLP',
    categories: ['immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://liwakida.com/',
    phone: '+1-646-470-0880',
    email: 'wakida@tlilaw.com',
    contactNote: '弁護士 脇田 理彦',
    focus: '移民法。',
  },
  {
    id: 'mayer-brown',
    name: 'Mayer Brown LLP',
    categories: ['business', 'litigation', 'immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.mayerbrown.com/en',
    phone: '+1-212-506-2120',
    email: 'smurase@mayerbrown.com',
    contactNote: '弁護士 村瀬 悟',
    focus: '法律一般、会社、訴訟、企業移民。',
  },
  {
    id: 'michael-dunn',
    name: 'Michael Dunn 法律事務所',
    categories: ['immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://michaeldunnlaw.com/',
    phone: '+1-646-546-5342',
    email: 'nihongo@michaeldunnlaw.com',
    focus: '移民法。',
  },
  {
    id: 'miki-dixon',
    name: 'Miki Dixon & Presseau, PLLC',
    categories: [
      'business',
      'housing',
      'litigation',
      'immigration',
      'estate',
      'family',
      'ip',
    ],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.mdp-law.com/',
    phone: '+1-212-661-1010',
    email: 'contact@mdp-law.com',
    contactNote: '弁護士 三木 克己',
    focus:
      '会社、不動産、民事訴訟、移民、商号、相続・家族、著作権、電子商取引。',
  },
  {
    id: 'moses-singer',
    name: 'Moses & Singer',
    categories: [
      'business',
      'litigation',
      'ip',
      'employment',
      'housing',
      'tax_finance',
      'estate',
      'family',
    ],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.mosessinger.com/',
    phone: '+1-212-554-7670',
    email: 'hnaito@mosessinger.com',
    contactNote: '弁護士 内藤 博久',
    focus: '会社・M&A、訴訟、知財、労務、不動産、広告、税・資産、家族。',
  },
  {
    id: 'mari-maemoto',
    name: 'Law Office of Mari Maemoto, P.C.',
    categories: ['immigration', 'litigation'],
    regions: ['nyc', 'ny_state'],
    phone: '+1-917-921-9472',
    email: 'Info@americaiminvisa.com',
    focus: '移民法、法律一般。',
  },
  {
    id: 'mayumi-iijima',
    name: 'Law Offices of Mayumi Iijima, P.C. / 飯島 真由美 弁護士事務所',
    categories: ['family', 'business', 'estate', 'immigration', 'litigation'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.iinylaw.com/ja',
    phone: '+1-212-598-4125',
    email: 'mciijima@iinylaw.com',
    contactNote: '弁護士 飯島 真由美',
    focus: '法律一般、家庭、会社、遺言・相続、移民、訴訟。',
  },
  {
    id: 'noandt',
    name: 'Nagashima Ohno & Tsunematsu NY LLP / 長島・大野・常松 法律事務所 NYオフィス',
    categories: ['business', 'employment', 'litigation', 'housing', 'ip'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.noandt.com/locations/new_york/',
    phone: '+1-212-258-3333',
    email: 'info-ny@noandt.com',
    focus:
      '会社設立・進出、労務、M&A、投資・金融、紛争、不動産、知財、調査、テクノロジー。',
  },
  {
    id: 'rbl',
    name: 'RBL Partners PLLC / ボアズ 麗奈 法律事務所',
    categories: ['immigration', 'employment', 'business', 'litigation'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.rblpartners.com/',
    phone: '+1-212-960-3593',
    email: 'info@rblpartners.com',
    focus: '移民、雇用、会社、法律一般。',
  },
  {
    id: 'richard-newman',
    name: 'Law Office of A. Richard Newman',
    categories: ['immigration'],
    regions: ['ny_state'],
    website: 'https://richardnewmanlaw.com/',
    phone: '+1-212-986-0947',
    email: 'info@richardnewmanlaw.com',
    focus: '移民法。',
  },
  {
    id: 'saito-law-group',
    name: 'SAITO LAW GROUP PLLC',
    categories: ['litigation', 'criminal', 'business'],
    regions: ['nyc', 'ny_state'],
    website: 'https://saitolawgroup.com/',
    phone: '+1-347-931-0976',
    email: 'saito@saitolawgroup.com',
    contactNote: '弁護士 齋藤 康弘',
    focus:
      '大型企業訴訟・仲裁、危機管理、不祥事、ホワイトカラー犯罪、規制当局対応。',
  },
  {
    id: 'sirota',
    name: 'Sirota Law Firm, P.C.',
    categories: ['business', 'ip', 'litigation'],
    regions: ['nyc', 'ny_state'],
    website: 'https://sirotalawfirm.com/',
    phone: '+1-646-504-1020',
    email: 'info@sirotalawfirm.com',
    contactNote: '弁護士 Jonathan Sirota',
    focus:
      '会社、契約、著作権・商標、エンターテインメント・メディア、法律一般。',
  },
  {
    id: 'sgr',
    name: 'Smith, Gambrell & Russell / スミス ガンブレル ラッセル (SGR) 法律事務所',
    categories: [
      'business',
      'employment',
      'litigation',
      'ip',
      'tax_finance',
      'estate',
      'immigration',
    ],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.sgrlaw.com/practices/japan-practice-team/',
    phone: '+1-212-907-9781',
    email: 'sonuma@sgrlaw.com',
    contactNote: '弁護士 Susan J. Onuma',
    focus: '会社、M&A、雇用、訴訟、貿易、知財、税・相続、情報保護、移民。',
  },
  {
    id: 'sw-law-group',
    name: 'SW Law Group, P.C. (Sindell Law Offices)',
    categories: ['immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.swlgpc.com/',
    phone: '+1-212-459-3800',
    email: 'ny@swlgpc.com',
    contactNote: '弁護士 David Sindell',
    focus: '移民法。',
  },
  {
    id: 'terai',
    name: 'Terai 寺井法律事務所',
    categories: ['business', 'housing', 'employment', 'immigration'],
    regions: ['nyc', 'ny_state'],
    website: 'https://terailaw.com/',
    phone: '+1-212-279-2262',
    email: 'info@terailaw.com',
    contactNote: '弁護士 寺井 眞美',
    focus: 'ビジネス、不動産、労働・雇用、移民。',
  },
  {
    id: 'tigris',
    name: 'Tigris Legal PLLC',
    categories: ['immigration', 'business'],
    regions: ['nyc', 'ny_state'],
    website: 'https://attorneyforusimmigration.com/ja/',
    phone: '+1-212-287-5671',
    email: 'contact@tigrislegal.com',
    contactNote: '弁護士 山田 晃子',
    focus: '移民、会社。',
  },
  {
    id: 'torys',
    name: 'Torys LLP / トリーズ',
    categories: ['business', 'litigation', 'tax_finance'],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.torys.com/',
    phone: '+1-212-880-6000',
    email: 'DBell@torys.com',
    contactNote: '弁護士 Don Bell',
    focus:
      '米国・カナダ法、投資、会社、契約、M&A・独禁、税、商事訴訟、会社更生。',
  },
  {
    id: 'windels-marx',
    name: 'Windels Marx Lane & Mittendorf, LLP',
    categories: [
      'estate',
      'tax_finance',
      'business',
      'ip',
      'housing',
      'litigation',
      'employment',
    ],
    regions: ['nyc', 'ny_state'],
    website: 'https://www.windelsmarx.com/',
    phone: '+1-212-237-1000',
    email: 'gmoriwaki@windelsmarx.com',
    contactNote: 'Gary Moriwaki / Reiko Takikawa / Yumi Higashi',
    focus:
      '国際相続・遺言・信託、税、会社、金融、知財、不動産、訴訟、雇用、破産ほか。',
  },
  {
    id: 'raquel-romero',
    name: 'Law Offices of Raquel Romero',
    categories: [
      'employment',
      'injury',
      'housing',
      'estate',
      'family',
      'litigation',
    ],
    regions: ['new_jersey'],
    website: 'https://www.romerolegal-jp.com/',
    phone: '+1-201-463-6568',
    email: 'rromerolaw@gmail.com',
    focus: '労働・事故訴訟、不動産・賃貸、相続・遺言、離婚・家族。',
  },
  {
    id: 'akemi-stauffer',
    name: 'Akemi Y Stauffer Attorney at Law',
    categories: ['immigration', 'estate', 'housing'],
    regions: ['pennsylvania'],
    phone: '+1-724-422-5250',
    email: 'akemi@astaufferlaw.com',
    focus: '連邦移民法、ペンシルベニア州の相続・信託・不動産。',
  },
];

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
        (issueType === 'criminal' && lawyer.id === 'akane-fujiwara' ? 20 : 0) +
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
    primaryCounselId:
      copy.lawyerRequired && input.issueType === 'criminal'
        ? 'akane-fujiwara'
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
