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
const LIST_KEYS = ['entries', 'items', 'results', 'records', 'data'];
const skipSpace = (s: string, i: number) => {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
};
/** Index just after the complete JSON value that starts at `i`, or -1 when the text ends before the value does. */
function jsonValueEnd(s: string, i: number): number {
  const open = s[i];
  if (open === '"') {
    for (let j = i + 1; j < s.length; j += 1) {
      if (s[j] === '\\') j += 1;
      else if (s[j] === '"') return j + 1;
    }
    return -1;
  }
  if (open === '{' || open === '[') {
    let depth = 0;
    for (let j = i; j < s.length; j += 1) {
      const c = s[j];
      if (c === '"') {
        const end = jsonValueEnd(s, j);
        if (end < 0) return -1;
        j = end - 1;
      } else if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }
  // A number, true, false or null counts as whole only when a separator follows; a clipped "12" may have been "1234".
  let j = i;
  while (j < s.length && !/[\s,\]}]/.test(s[j])) j += 1;
  const next = skipSpace(s, j);
  return next < s.length && /[,\]}]/.test(s[next]) ? j : -1;
}
/** Where the list inside a top-level object starts: a known list key first, otherwise the first array value. */
function topLevelListStart(s: string): number {
  let i = skipSpace(s, 1), firstArray = -1;
  while (i < s.length && s[i] === '"') {
    const keyEnd = jsonValueEnd(s, i);
    if (keyEnd < 0) break;
    let key = '';
    try {
      key = JSON.parse(s.slice(i, keyEnd)) as string;
    } catch {
      break;
    }
    i = skipSpace(s, keyEnd);
    if (s[i] !== ':') break;
    const valueStart = skipSpace(s, i + 1);
    if (s[valueStart] === '[') {
      if (LIST_KEYS.includes(key)) return valueStart;
      if (firstArray < 0) firstArray = valueStart;
    }
    const valueEnd = jsonValueEnd(s, valueStart);
    // The text ran out inside this value. When it is an array, that is where the bulk of the result was.
    if (valueEnd < 0) return s[valueStart] === '[' ? valueStart : firstArray;
    i = skipSpace(s, valueEnd);
    if (s[i] !== ',') break;
    i = skipSpace(s, i + 1);
  }
  return firstArray;
}
/**
 * A result that was clipped for length is no longer valid JSON. Recover only the list items that arrived whole,
 * exactly as the provider sent them; an item cut in the middle is dropped, never completed or guessed.
 * Returns null when no list is found or no item arrived whole.
 */
export function noahPartialJsonList(text: string, maxItems = 1000): unknown[] | null {
  const s = text.trimStart();
  const start = s.startsWith('[') ? 0 : s.startsWith('{') ? topLevelListStart(s) : -1;
  if (start < 0) return null;
  const items: unknown[] = [];
  let i = skipSpace(s, start + 1);
  while (items.length < maxItems && i < s.length && s[i] !== ']') {
    const end = jsonValueEnd(s, i);
    if (end < 0) break;
    try {
      items.push(JSON.parse(s.slice(i, end)));
    } catch {
      break;
    }
    i = skipSpace(s, end);
    if (s[i] !== ',') break;
    i = skipSpace(s, i + 1);
  }
  return items.length ? items : null;
}
function listPresentation(
  base: NoahResultPresentation,
  list: unknown[],
): NoahResultPresentation {
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
    const partial = result.truncated && /^[{[]/.test(text) ? noahPartialJsonList(text) : null;
    if (partial) return listPresentation(base, partial);
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
      ? (LIST_KEYS
          .map((k) => value[k])
          .find(Array.isArray) ?? Object.values(value).find(Array.isArray))
      : undefined;
  if (Array.isArray(list)) return listPresentation(base, list);
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
    if (!url) return;
    const parsed = new URL(url), host = parsed.hostname.replace(/\.$/, '').toLowerCase();
    // Image previews fetch automatically: do not accept IP literals or local-only host names.
    if (!host.includes('.') || host.includes(':') || /^[0-9.]+$/.test(host) || /(^|\.)(localhost|local|internal)$/.test(host)) return;
    if (explicit || /\.(png|jpe?g|webp|gif)$/i.test(parsed.pathname)) links.add(url);
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
