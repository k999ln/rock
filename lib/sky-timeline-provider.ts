import type { XAccountPost } from './sky-x-account';

export const TIMELINE_TOOL = 'sky_timeline_read';
export const TIMELINE_TTL = 15 * 60_000;
export type TimelineFeed = 'following' | 'recommended';
export type TimelineEnvelope = {
  schema: 'sky.timeline.v1';
  source: 'x';
  audience: 'owner';
  feed: TimelineFeed;
  fetchedAt: number;
  posts: XAccountPost[];
};

/** A provider result is data, never a permission grant or proof of accuracy. */
export function parseTimelineEnvelope(
  input: unknown,
  expected: TimelineFeed,
  now = Date.now(),
): TimelineEnvelope {
  let value: unknown = input;
  if (value && typeof value === 'object' && 'isError' in value && value.isError)
    throw Error('接続先が投稿の取得に失敗しました。');
  if (value && typeof value === 'object' && 'structuredContent' in value)
    value = value.structuredContent;
  else if (value && typeof value === 'object' && 'content' in value) {
    const content = value.content;
    if (
      !Array.isArray(content) ||
      content.length !== 1 ||
      content[0]?.type !== 'text'
    )
      throw Error('配信元の投稿形式に対応していません。');
    value = content[0].text;
  }
  if (typeof value === 'string') {
    if (value.length > 128_000) throw Error('投稿データが大きすぎます。');
    try {
      value = JSON.parse(value);
    } catch {
      throw Error('投稿データを確認できません。');
    }
  }
  if (!value || typeof value !== 'object')
    throw Error('投稿データがありません。');
  const raw = value as Partial<TimelineEnvelope>;
  if (
    raw.schema !== 'sky.timeline.v1' ||
    raw.source !== 'x' ||
    raw.audience !== 'owner' ||
    raw.feed !== expected ||
    !Number.isSafeInteger(raw.fetchedAt) ||
    raw.fetchedAt! > now + 60_000 ||
    raw.fetchedAt! < now - TIMELINE_TTL ||
    !Array.isArray(raw.posts) ||
    raw.posts.length > 20
  )
    throw Error('配信元の形式・範囲・取得時刻を確認してください。');
  const seen = new Set<string>();
  const posts = raw.posts.map((post) => {
    if (
      !post ||
      typeof post.id !== 'string' ||
      !/^\d{1,30}$/.test(post.id) ||
      seen.has(post.id) ||
      typeof post.author !== 'string' ||
      !/^[A-Za-z0-9_]{1,15}$/.test(post.author) ||
      typeof post.name !== 'string' ||
      !post.name.trim() ||
      post.name.length > 100 ||
      typeof post.text !== 'string' ||
      !post.text.trim() ||
      post.text.length > 10_000 ||
      typeof post.protected !== 'boolean' ||
      typeof post.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(post.createdAt)) ||
      post.url !== `https://x.com/${post.author}/status/${post.id}`
    )
      throw Error(
        '本文・作者・公開範囲・原文リンクを確認できない投稿があります。',
      );
    seen.add(post.id);
    return {
      id: post.id,
      author: post.author,
      name: post.name,
      text: post.text,
      protected: post.protected,
      createdAt: post.createdAt,
      url: post.url,
    };
  });
  return {
    schema: 'sky.timeline.v1',
    source: 'x',
    audience: 'owner',
    feed: expected,
    fetchedAt: raw.fetchedAt!,
    posts,
  };
}
