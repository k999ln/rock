export const CAMPUS_IDS = ['nyu', 'fit', 'columbia', 'fordham', 'johnjay'] as const;
export type CampusId = (typeof CAMPUS_IDS)[number];
export const CAMPUS_ITEM_KINDS = [
  'project',
  'opportunity',
  'event',
  'community',
  'portfolio',
  'resource',
] as const;
export type CampusItemKind = (typeof CAMPUS_ITEM_KINDS)[number];

export type CampusConfig = {
  id: CampusId;
  name: string;
  shortName: string;
  headline: string;
  description: string;
  accent: string;
  domains: string[];
  focus: string[];
  prompts: string[];
  resourceLabel: string;
  opportunityLabel: string;
  defaultMode: string;
};

export const CAMPUSES: Record<CampusId, CampusConfig> = {
  nyu: {
    id: 'nyu',
    name: 'New York University',
    shortName: 'NYU',
    headline: 'Create in the city.',
    description: 'Film, AI, startups, art, and collaborators across New York.',
    accent: '#7c3aed',
    domains: ['nyu.edu'],
    focus: ['Film', 'AI', 'Startups', 'Art', 'Media'],
    prompts: ['Find a collaborator', 'Start a project', 'Discover an event'],
    resourceLabel: 'Resources',
    opportunityLabel: 'Opportunities',
    defaultMode: 'creative',
  },
  fit: {
    id: 'fit',
    name: 'Fashion Institute of Technology',
    shortName: 'FIT',
    headline: 'Design what stands out.',
    description: 'Portfolio, collaborators, gigs, fashion, content, and branding.',
    accent: '#111827',
    domains: ['fitnyc.edu'],
    focus: ['Fashion', 'Design', 'Photography', 'Branding', 'Content'],
    prompts: ['Build a portfolio', 'Find a creative', 'Post a gig'],
    resourceLabel: 'Creative resources',
    opportunityLabel: 'Gigs & opportunities',
    defaultMode: 'creative',
  },
  columbia: {
    id: 'columbia',
    name: 'Columbia University',
    shortName: 'Columbia',
    headline: 'Research. Build. Lead.',
    description: 'Research teams, papers, policy, AI, and global ideas.',
    accent: '#75aadb',
    domains: ['columbia.edu'],
    focus: ['Research', 'Policy', 'AI', 'Science', 'Global'],
    prompts: ['Form a research team', 'Share a paper', 'Find expertise'],
    resourceLabel: 'Research library',
    opportunityLabel: 'Research & opportunities',
    defaultMode: 'research',
  },
  fordham: {
    id: 'fordham',
    name: 'Fordham University',
    shortName: 'Fordham',
    headline: 'Build with purpose.',
    description: 'Career, business, leadership, startups, and community.',
    accent: '#7f1d1d',
    domains: ['fordham.edu'],
    focus: ['Business', 'Career', 'Leadership', 'Startups', 'Community'],
    prompts: ['Meet builders', 'Find an internship', 'Launch a project'],
    resourceLabel: 'Career resources',
    opportunityLabel: 'Career opportunities',
    defaultMode: 'career',
  },
  johnjay: {
    id: 'johnjay',
    name: 'John Jay College of Criminal Justice',
    shortName: 'John Jay',
    headline: 'Systems. Justice. Innovation.',
    description: 'Justice, policy, cybersecurity, forensics, and civic projects.',
    accent: '#1d4ed8',
    domains: ['jjay.cuny.edu'],
    focus: ['Justice', 'Policy', 'Cybersecurity', 'Forensics', 'Civic Tech'],
    prompts: ['Build a civic project', 'Share a case or policy source', 'Find expertise'],
    resourceLabel: 'Cases & policy',
    opportunityLabel: 'Public-service opportunities',
    defaultMode: 'justice',
  },
};

export type CampusLink = { label: string; url: string };
export type CampusProfileInput = {
  campusId: CampusId;
  handle: string;
  displayName: string;
  affiliation: 'student' | 'alumni' | 'faculty' | 'staff' | 'other';
  headline: string;
  bio: string;
  skills: string[];
  interests: string[];
  lookingFor: string[];
  links: CampusLink[];
  isPublic: boolean;
};

export type CampusPublicProfile = {
  id: string;
  campusId: CampusId;
  handle: string;
  displayName: string;
  affiliation: CampusProfileInput['affiliation'];
  affiliationStatus: 'self_declared' | 'domain_verified';
  headline: string;
  bio: string;
  skills: string[];
  interests: string[];
  lookingFor: string[];
  links: CampusLink[];
  updatedAt: string;
};

export type CampusItemInput = {
  campusId: CampusId;
  kind: CampusItemKind;
  title: string;
  summary: string;
  tags: string[];
  details: Record<string, unknown>;
  startsAt: string | null;
  endsAt: string | null;
  visibility: 'campus' | 'public';
};

export class CampusError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_LIST = 12;
const allowedModes = new Set([
  'campus',
  'creative',
  'study',
  'social',
  'research',
  'career',
  'justice',
  'events',
]);

function object(value: unknown, allowed?: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CampusError('入力形式を確認してください。');
  const record = value as Record<string, unknown>;
  if (allowed && Object.keys(record).some((key) => !allowed.includes(key)))
    throw new CampusError('未対応の入力項目があります。');
  return record;
}
function text(value: unknown, label: string, max: number, min = 1) {
  if (typeof value !== 'string') throw new CampusError(`${label}を入力してください。`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min || clean.length > max)
    throw new CampusError(`${label}は${min}〜${max}文字にしてください。`);
  return clean;
}
function maybeText(value: unknown, label: string, max: number) {
  if (value == null || value === '') return '';
  return text(value, label, max, 0);
}
function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) throw new CampusError(`${label}を確認してください。`);
  return value as T;
}
function list(value: unknown, label: string, maxItems = MAX_LIST) {
  if (!Array.isArray(value) || value.length > maxItems)
    throw new CampusError(`${label}は${maxItems}件以下にしてください。`);
  const out: string[] = [];
  for (const item of value) {
    const clean = text(item, label, 48);
    if (!out.some((entry) => entry.toLowerCase() === clean.toLowerCase())) out.push(clean);
  }
  return out;
}
function url(value: unknown, label = 'URL') {
  const raw = text(value, label, 500);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CampusError(`${label}を確認してください。`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new CampusError(`${label}はhttp(s)を使用してください。`);
  parsed.username = '';
  parsed.password = '';
  return parsed.toString();
}
function optionalUrl(value: unknown, label = 'URL') {
  if (value == null || value === '') return '';
  return url(value, label);
}
function iso(value: unknown, label: string) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new CampusError(`${label}を確認してください。`);
  return new Date(value).toISOString();
}
export function campusId(value: unknown): CampusId {
  return enumValue(value, CAMPUS_IDS, '大学');
}
export function campusMode(value: unknown) {
  if (typeof value !== 'string' || !allowedModes.has(value))
    throw new CampusError('Campus Modeを確認してください。');
  return value;
}
export function campusTagId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(value))
    throw new CampusError('タグIDは英小文字・数字・ハイフンで3〜64文字にしてください。');
  return value;
}
export function safeRelativeCampusDestination(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/campus'))
    throw new CampusError('タグの移動先はCampus内の相対パスにしてください。');
  const parsed = new URL(value, 'https://avocado.invalid');
  if (parsed.origin !== 'https://avocado.invalid' || !parsed.pathname.startsWith('/campus'))
    throw new CampusError('タグの移動先を確認してください。');
  return `${parsed.pathname}${parsed.search}`;
}
export function profileInput(value: unknown): CampusProfileInput {
  const v = object(value, [
    'campusId',
    'handle',
    'displayName',
    'affiliation',
    'headline',
    'bio',
    'skills',
    'interests',
    'lookingFor',
    'links',
    'isPublic',
  ]);
  const handle = text(v.handle, 'ハンドル', 30, 2).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(handle))
    throw new CampusError('ハンドルは英小文字・数字・._-で作成してください。');
  const rawLinks = Array.isArray(v.links) ? v.links : [];
  if (rawLinks.length > 6) throw new CampusError('リンクは6件以下にしてください。');
  const links = rawLinks.map((entry) => {
    const row = object(entry, ['label', 'url']);
    return { label: text(row.label, 'リンク名', 32), url: url(row.url) };
  });
  if (typeof v.isPublic !== 'boolean') throw new CampusError('公開設定を確認してください。');
  return {
    campusId: campusId(v.campusId),
    handle,
    displayName: text(v.displayName, '表示名', 60, 2),
    affiliation: enumValue(v.affiliation, ['student', 'alumni', 'faculty', 'staff', 'other'] as const, '所属'),
    headline: maybeText(v.headline, '見出し', 120),
    bio: maybeText(v.bio, '自己紹介', 800),
    skills: list(v.skills ?? [], 'スキル'),
    interests: list(v.interests ?? [], '興味'),
    lookingFor: list(v.lookingFor ?? [], '探しているもの'),
    links,
    isPublic: v.isPublic,
  };
}

const opportunityTypes = ['internship', 'gig', 'job', 'fellowship', 'volunteer', 'competition', 'research'] as const;
const resourceTypes = ['case', 'paper', 'policy', 'dataset', 'reference', 'guide'] as const;
const itemStatuses = ['recruiting', 'active', 'upcoming', 'open', 'complete'] as const;

function detailsFor(kind: CampusItemKind, value: unknown) {
  const v = object(value);
  const common = {
    externalUrl: optionalUrl(v.externalUrl, '外部URL'),
    locationText: maybeText(v.locationText, '場所', 120),
  };
  if (kind === 'project') {
    return {
      ...common,
      track: maybeText(v.track, '分野', 60),
      needs: list(v.needs ?? [], '募集ロール', 10),
      status: enumValue(v.status ?? 'recruiting', itemStatuses, '状態'),
    };
  }
  if (kind === 'opportunity') {
    return {
      ...common,
      opportunityType: enumValue(v.opportunityType ?? 'internship', opportunityTypes, '募集種別'),
      organization: maybeText(v.organization, '組織名', 100),
      compensation: maybeText(v.compensation, '報酬', 100),
      deadline: iso(v.deadline, '締切'),
    };
  }
  if (kind === 'event') {
    return {
      ...common,
      organizer: maybeText(v.organizer, '主催', 100),
      registrationUrl: optionalUrl(v.registrationUrl, '登録URL'),
    };
  }
  if (kind === 'community') {
    return {
      ...common,
      category: maybeText(v.category, 'カテゴリ', 60),
      joinPolicy: enumValue(v.joinPolicy ?? 'open', ['open', 'approval'] as const, '参加方式'),
    };
  }
  if (kind === 'portfolio') {
    return {
      ...common,
      mediaType: enumValue(v.mediaType ?? 'project', ['project', 'film', 'photo', 'fashion', 'design', 'writing', 'code', 'research'] as const, '作品種別'),
      role: maybeText(v.role, '役割', 80),
      year: maybeText(v.year, '年', 20),
    };
  }
  return {
    ...common,
    resourceType: enumValue(v.resourceType ?? 'reference', resourceTypes, '資料種別'),
    citation: maybeText(v.citation, '引用・出典', 300),
  };
}
export function itemInput(value: unknown): CampusItemInput {
  const v = object(value, [
    'campusId',
    'kind',
    'title',
    'summary',
    'tags',
    'details',
    'startsAt',
    'endsAt',
    'visibility',
  ]);
  const kind = enumValue(v.kind, CAMPUS_ITEM_KINDS, '種類');
  const startsAt = iso(v.startsAt, '開始日時');
  const endsAt = iso(v.endsAt, '終了日時');
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt))
    throw new CampusError('終了日時は開始日時より後にしてください。');
  if (kind === 'event' && !startsAt)
    throw new CampusError('イベントには開始日時が必要です。');
  return {
    campusId: campusId(v.campusId),
    kind,
    title: text(v.title, 'タイトル', 100, 2),
    summary: text(v.summary, '説明', 600, 2),
    tags: list(v.tags ?? [], 'タグ', 12),
    details: detailsFor(kind, v.details ?? {}),
    startsAt,
    endsAt,
    visibility: enumValue(v.visibility ?? 'campus', ['campus', 'public'] as const, '公開範囲'),
  };
}

export function verifiedByCampusDomain(campus: CampusId, email: string | null | undefined) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 1) return false;
  const domain = normalized.slice(at + 1);
  return CAMPUSES[campus].domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function norm(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}
export function matchCampusProfiles(current: CampusPublicProfile, candidates: CampusPublicProfile[]) {
  const mineSkills = norm(current.skills);
  const mineInterests = norm(current.interests);
  const mineNeeds = norm(current.lookingFor);
  return candidates
    .filter((candidate) => candidate.id !== current.id && candidate.campusId === current.campusId)
    .map((candidate) => {
      const theirSkills = norm(candidate.skills);
      const theirInterests = norm(candidate.interests);
      const theirNeeds = norm(candidate.lookingFor);
      const shared = [...mineInterests].filter((value) => theirInterests.has(value));
      const theyCanHelp = [...mineNeeds].filter((value) => theirSkills.has(value));
      const iCanHelp = [...theirNeeds].filter((value) => mineSkills.has(value));
      const raw = Math.min(100, shared.length * 12 + theyCanHelp.length * 22 + iCanHelp.length * 16);
      const reasons = [
        ...theyCanHelp.slice(0, 2).map((value) => `Can help with ${value}`),
        ...iCanHelp.slice(0, 2).map((value) => `Looking for ${value}`),
        ...shared.slice(0, 2).map((value) => `Shared interest: ${value}`),
      ];
      return { profile: candidate, score: raw, reasons };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.displayName.localeCompare(b.profile.displayName));
}

export function campusFromTagPrefix(tagId: string): CampusId | null {
  const prefix = tagId.split('-')[0] as CampusId;
  return CAMPUS_IDS.includes(prefix) ? prefix : null;
}
