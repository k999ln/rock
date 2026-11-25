/**
 * Eve が作った部品: ブログに出す用意をする（能力 publish.blog）。task 130、2026-11-25。
 *
 * 公開は外へ出す工程なので、この部品は公開しない。ブログに入れる一式（題・本文の HTML・抜粋・見出し画像・WordPress に読み込める WXR）を作るまで。
 * 1. 広告の表示・表現の点検（compliance.check の門）が ok の時だけ進む。
 * 2. 提携の承認で受け取ったリンク（https だけ）を、記事の {{AFFILIATE_URL}} に入れる。紹介のリンクには rel="sponsored nofollow noopener" を付ける。
 * 3. Markdown（見出し・段落・リンクの行だけ）を HTML にする。知らない書き方は、文字のまま段落にする（推量で HTML にしない）。
 * 4. WXR の記事は「下書き」で入る。本人が中身を読み、見出し画像を付けて、公開を押す。公開した URL を Eve に返す。
 * 外へ通信しない。
 */

import { EVE_AFFILIATE_PLACEHOLDER, EVE_ARTICLE_LABEL } from './eve-part-shared.ts';
import { eveAffiliateUrl, eveRequireAdCheck } from './eve-part-host.ts';

export const EVE_PART_BLOG_REF = 'eve-part:blog-package';

export type EveBlogPackage = {
  status: 'prepared';
  title: string;
  slug: string;
  excerpt: string;
  html: string;
  eyecatch: { file: 'eyecatch.png'; alt: string; sha256: string } | null;
  wxr: string;
  instructions: string[];
};

const esc = (s: string) => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
const cdata = (s: string) => `<![CDATA[${s.split(']]>').join(']]]]><![CDATA[>')}]]>`;

/** Markdown の小さな部分集合を HTML にする。題（# ）は返さず、別に返す。 */
export function eveMarkdownToHtml(markdown: string, link: string): { title: string; html: string; text: string } {
  let title = '';
  const html: string[] = [], text: string[] = [];
  for (const block of markdown.replace(/\r\n?/gu, '\n').split(/\n{2,}/u)) {
    const line = block.trim();
    if (!line) continue;
    const h1 = /^#\s+(.+)$/u.exec(line), h2 = /^##\s+(.+)$/u.exec(line), a = /^\[([^\]]{1,120})\]\(([^)\s]+)\)$/u.exec(line);
    if (h1 && !title) title = h1[1].trim();
    else if (h2) html.push(`<h2>${esc(h2[1].trim())}</h2>`);
    else if (a) {
      const href = a[2] === EVE_AFFILIATE_PLACEHOLDER ? link : a[2];
      if (!href.startsWith('https://')) throw new Error(`記事のリンクが https ではありません（${a[2].slice(0, 60)}）。`);
      html.push(`<p><a href="${esc(href)}" rel="sponsored nofollow noopener" target="_blank">${esc(a[1])}</a></p>`);
    } else if (line === EVE_ARTICLE_LABEL) html.push(`<p class="pr"><small>${esc(line)}</small></p>`);
    else html.push(`<p>${esc(line).replace(/\n/gu, '<br>')}</p>`);
    if (!h1) text.push(line);
  }
  if (!title) throw new Error('記事の題（「# 」の見出し）がありません。');
  return { title, html: html.join('\n'), text: text.join('\n') };
}

export async function evePrepareBlogPost(input: Record<string, unknown>): Promise<EveBlogPackage> {
  eveRequireAdCheck(input['広告表示・表現の確認結果']);
  const article = input['記事'];
  if (typeof article !== 'string' || !article.trim()) throw new Error('出す記事（記事の Markdown）がありません。');
  const url = eveAffiliateUrl(input['提携承認または申請結果']);
  const { title, html, text } = eveMarkdownToHtml(article, url.href);
  if (html.includes('{{') || !html.includes('class="pr"')) throw new Error('記事に、埋まっていない置き場か、広告の表示が無い所があります。');
  const body = text.split('\n').filter((l) => l !== EVE_ARTICLE_LABEL && !l.startsWith('#') && !l.startsWith('['));
  const excerpt = Array.from(body.join('')).slice(0, 110).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(title));
  const slug = typeof input.slug === 'string' && /^[a-z0-9-]{3,60}$/u.test(input.slug) ? input.slug : `eve-${[...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const image = input['図・画像素材'] as { sha256?: unknown; alt?: unknown } | undefined;
  const eyecatch = image && typeof image.sha256 === 'string' ? { file: 'eyecatch.png' as const, alt: typeof image.alt === 'string' ? image.alt : title, sha256: image.sha256 } : null;
  const wxr = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">',
    '<channel>',
    `<title>${esc(title)}</title>`,
    '<wp:wxr_version>1.2</wp:wxr_version>',
    '<item>',
    `<title>${esc(title)}</title>`,
    `<content:encoded>${cdata(html)}</content:encoded>`,
    `<excerpt:encoded>${cdata(excerpt)}</excerpt:encoded>`,
    `<wp:post_name>${slug}</wp:post_name>`,
    '<wp:status>draft</wp:status>',
    '<wp:post_type>post</wp:post_type>',
    '</item>',
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
  return {
    status: 'prepared',
    title,
    slug,
    excerpt,
    html,
    eyecatch,
    wxr,
    instructions: [
      'WordPress なら「ツール → インポート → WordPress」で post.xml を読み込みます（下書きで入ります）。ほかのブログなら、本文の HTML を貼ります。',
      '下書きを開いて全文を読み、事実と違う所・言い過ぎの所が無いかを確かめます。eyecatch.png をアイキャッチに付けます。',
      '公開を押し、公開した記事の URL を Eve に返します。',
    ],
  };
}
