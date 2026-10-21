export class SkySocialError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export type SkySocialProfile = { id: string; name: string };
export type SkyCommunity = {
  id: string;
  name: string;
  description: string;
  rules: string;
  visibility: 'public' | 'members';
  member: boolean;
  owned: boolean;
  members: number;
  unlocked: boolean;
  bootstrap: boolean;
  rulesVersion: number;
};
export type SkySocialAttachment = {
  kind:
    | 'model'
    | 'dataset'
    | 'space'
    | 'agent'
    | 'work'
    | 'edition'
    | 'news'
    | 'community-os';
  resource: string;
};
export type SkySocialPost = {
  id: string;
  author: SkySocialProfile;
  mine: boolean;
  following: boolean;
  community: { id: string; name: string } | null;
  content: string;
  attachment: SkySocialAttachment | null;
  createdAt: number;
  reason: string;
  replyTo: string | null;
  replies: number;
  likes: number;
  reposts: number;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
};
export type SkySocialState = {
  profile: SkySocialProfile | null;
  communities: SkyCommunity[];
  posts: SkySocialPost[];
  cursor: string | null;
  thread?: SkySocialPost | null;
};
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function socialId(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value))
    throw new SkySocialError('IDを確認してください。');
  return value;
}
export function socialText(value: unknown, max: number, optional = false) {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (!optional && !value.trim())
  )
    throw new SkySocialError(`入力は${max}文字以内にしてください。`);
  return value.trim();
}
export function socialObject(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new SkySocialError('送信する項目を確認してください。');
  return value as Record<string, unknown>;
}
export function socialAttachment(value: unknown): SkySocialAttachment | null {
  if (value === null || value === undefined) return null;
  const v = socialObject(value, ['kind', 'resource']);
  if (
    ![
      'model',
      'dataset',
      'space',
      'agent',
      'work',
      'edition',
      'news',
      'community-os',
    ].includes(String(v.kind))
  )
    throw new SkySocialError('共有する種類を確認してください。');
  const resource = socialText(v.resource, 300);
  if (['model', 'dataset', 'space'].includes(String(v.kind))) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/.test(
        resource,
      ) ||
      resource.includes('..')
    )
      throw new SkySocialError('Hugging FaceのIDを確認してください。');
  } else if (v.kind === 'community-os') {
    if (!/^[a-f0-9-]{36}:[1-9][0-9]{0,5}$/.test(resource))
      throw new SkySocialError('OS構成の版を確認してください。');
  } else if (v.kind === 'agent') {
    if (!/^[a-z0-9-]{1,100}$/.test(resource))
      throw new SkySocialError('公開ToolのIDを確認してください。');
  } else {
    let url: URL;
    try {
      url = new URL(resource);
    } catch {
      throw new SkySocialError('HTTPSの共有URLを入力してください。');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new SkySocialError('HTTPSの共有URLを入力してください。');
  }
  return { kind: v.kind as SkySocialAttachment['kind'], resource };
}
