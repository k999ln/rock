import type { NoahReceivedResult } from './noah-result-media.ts';
export type NoahResultCard = { title: string; text: string; href?: string };
export type NoahResultPresentation = {
  kind: 'account' | 'list' | 'image' | 'text' | 'data';
  title: string;
  summary: string;
  cards: NoahResultCard[];
  fields: { label: string; value: string }[];
  count?: number;
  raw: boolean;
};
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : '';
const first = (v: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => str(v[k])).find(Boolean) ?? '';
export function noahResultUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && !u.username && !u.password) return u.href;
  } catch {
    /* Untrusted provider text stays text. */
  }
}
const labels: Record<string, string> = {
  name: '名前',
  handle: 'ユーザー名',
  status: '状態',
  description: '説明',
  title: 'タイトル',
  summary: '要点',
  count: '件数',
  total: '件数',
  message: 'メッセージ',
  url: 'リンク',
  homepage: 'ホームページ',
  email: 'メール',
  createdAt: '作成日',
  updatedAt: '更新日',
};
const fields = (value: Record<string, unknown>) =>
  Object.entries(value)
    .filter(
      ([, v]) =>
        v !== null &&
        v !== '' &&
        ['string', 'number', 'boolean'].includes(typeof v),
    )
    .slice(0, 12)
    .map(([key, value]) => ({
      label: labels[key] ?? key.replaceAll('_', ' '),
      value: str(value),
    }));
/** Deterministic presentation, not an invented summary or a claim that provider content is verified. */
export function noahResultPresentation(
  result: NoahReceivedResult,
): NoahResultPresentation {
  const text = result.text.trim(),
    base: NoahResultPresentation = {
      kind: 'text',
      title: '届いた文章',
      summary: text,
      cards: [],
      fields: [],
      raw: false,
    };
  if (result.images?.length)
    return {
      ...base,
      kind: 'image',
      title: '届いた画像',
      summary: /^[{[]/.test(text)
        ? ''
        : text.replace(/（画像 \d+ 件）/g, '').trim(),
      count: result.images.length + (result.imageUrls?.length ?? 0),
      raw: true,
    };
  const imageLinks = result.imageUrls?.length
    ? result.imageUrls
    : noahResultImageLinks(text);
  if (imageLinks.length)
    return {
      ...base,
      kind: 'image',
      title: '届いた画像',
      summary: '',
      count: imageLinks.length,
      raw: true,
    };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    if (/^[{[]/.test(text))
      return {
        ...base,
        kind: 'data',
        title: '受け取ったデータ',
        summary: result.truncated
          ? '成果の一部を表示しています'
          : '詳細を開いて内容を確認できます',
        raw: true,
      };
    return base;
  }
  if (
    object(value) &&
    object(value.agent) &&
    typeof value.agent.name === 'string'
  ) {
    const a = value.agent;
    return {
      ...base,
      kind: 'account',
      title: 'アカウント情報',
      summary: a.name as string,
      fields: fields(
        Object.fromEntries(
          ['handle', 'status', 'description', 'url']
            .filter((k) => a[k] != null)
            .map((k) => [k, a[k]]),
        ),
      ),
      raw: true,
    };
  }
  const list = Array.isArray(value)
    ? value
    : object(value)
      ? (['entries', 'items', 'results', 'records', 'data']
          .map((k) => value[k])
          .find(Array.isArray) ?? Object.values(value).find(Array.isArray))
      : undefined;
  if (Array.isArray(list)) {
    const cards = list.map((item, index): NoahResultCard =>
      object(item)
        ? {
            title:
              first(item, ['title', 'name', 'label', 'handle']) ||
              `${index + 1}`,
            text: first(item, [
              'summary',
              'description',
              'text',
              'content',
              'message',
            ]),
            href: noahResultUrl(item.url ?? item.href ?? item.link),
          }
        : { title: str(item) || `${index + 1}`, text: '' },
    );
    return {
      ...base,
      kind: 'list',
      title: '届いた一覧',
      summary: '',
      cards,
      count: list.length,
      raw: true,
    };
  }
  if (object(value))
    return {
      ...base,
      kind: 'data',
      title: '受け取ったデータ',
      summary: first(value, ['summary', 'message', 'description']),
      fields: fields(value),
      raw: true,
    };
  return { ...base, summary: str(value), raw: true };
}

/** Explicit image fields/Markdown only; ordinary links are not fetched as images. */
export function noahResultImageLinks(text: string): string[] {
  const links = new Set<string>();
  const add = (v: unknown, explicit = false) => {
    const url = noahResultUrl(v);
    if (
      url &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)/i.test(
        new URL(url).hostname,
      ) &&
      !new URL(url).hostname.endsWith('.local') &&
      (explicit || /\.(png|jpe?g|webp|gif)$/i.test(new URL(url).pathname))
    )
      links.add(url);
  };
  function walk(v: unknown, depth = 0, explicit = false) {
    if (depth > 4 || links.size >= 8) return;
    if (typeof v === 'string') {
      add(v, explicit);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 8)) walk(item, depth + 1, explicit);
      return;
    }
    if (object(v))
      for (const [key, value] of Object.entries(v).slice(0, 50)) {
        if (
          ['image_url', 'imageUrl', 'images', 'image', 'image_urls'].includes(
            key,
          )
        )
          walk(value, depth + 1, true);
        else if (key === 'url' || key === 'href') add(value, explicit);
        else if (['data', 'output', 'result', 'results'].includes(key))
          walk(value, depth + 1, explicit);
      }
  }
  try {
    walk(JSON.parse(text));
  } catch {
    for (const match of text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g))
      add(match[1], true);
    add(text.trim());
  }
  return [...links].slice(0, 8);
}
