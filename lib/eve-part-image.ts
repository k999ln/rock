/**
 * Eve が作った部品: 記事の見出し画像を作る（能力 content.image）。task 130、2026-11-25。
 *
 * 記事の題から、1200×630 の見出し画像（ブログのアイキャッチ・SNS の共有画像の大きさ）を決まった式で描く。LLM は使わない。
 * 他人の写真・絵・ロゴは使わない（権利を確かめられないため）。描くのは、分野の色の面と、記事の題の文字だけ。
 * 文字の形は、リポジトリの public/fonts/noah-noto-sans-jp-regular.ttf（SIL Open Font License）で決める。どの端末でも同じ画像になる。
 * 描く形を決めるまでがこのファイル（外へ通信しない・ファイルを読まない）。PNG にするのは lib/eve-part-image-node.ts（satori で文字を線にし、resvg で描く）。
 */

export const EVE_PART_IMAGE_REF = 'eve-part:eyecatch-image';
export const EVE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type EveImage = { mime: 'image/png'; bytes: number; sha256: string; width: number; height: number; alt: string; base64: string };
export type EveRasterize = (element: EveImageElement) => Promise<Uint8Array>;

/** 背景の色（題の文字の並びで決める。同じ題はいつも同じ色）。文字は白で、どの色の上でも読める濃さにした。 */
const COLORS = ['#1f4e79', '#205e55', '#5b3a7a', '#7a3b2e', '#2f4858', '#3d5a1f'] as const;

/** 描く物（satori の要素の形。HTML と CSS の小さな部分集合）。 */
export type EveImageElement = { type: string; props: { style?: Record<string, string | number>; children?: string | EveImageElement | EveImageElement[] } };

function titleOf(input: Record<string, unknown>): string {
  if (typeof input.title === 'string' && input.title.trim()) return input.title.trim();
  const article = typeof input['記事'] === 'string' ? input['記事'] : typeof input.article === 'string' ? input.article : '';
  const h1 = /^#\s+(.+)$/mu.exec(article)?.[1]?.trim();
  if (!h1) throw new Error('記事の題（「# 」の見出しか title）がありません。');
  return h1;
}

/** 見出し画像の形（題を「｜」の前の大きい文字と、後ろの小さい文字に分ける。左に白い線）。 */
export function eveEyecatchElement(title: string): EveImageElement {
  if (Array.from(title).length > 120) throw new Error('題が長すぎます（120 文字まで）。');
  const [main, sub] = title.split(/[｜|]/u, 2).map((s) => s.trim());
  let hash = 0;
  for (const ch of title) hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  const lines: EveImageElement[] = [{ type: 'div', props: { style: { fontSize: 68, lineHeight: 1.3 }, children: main } }];
  if (sub) lines.push({ type: 'div', props: { style: { fontSize: 38, lineHeight: 1.4, marginTop: 28, opacity: 0.88 }, children: sub } });
  return {
    type: 'div',
    props: {
      style: { width: EVE_IMAGE_SIZE.width, height: EVE_IMAGE_SIZE.height, display: 'flex', alignItems: 'center', padding: '0 80px 0 56px', background: COLORS[hash % COLORS.length], color: '#ffffff', fontFamily: 'Noto Sans JP' },
      children: [
        { type: 'div', props: { style: { width: 8, alignSelf: 'stretch', margin: '150px 24px 150px 0', background: 'rgba(255,255,255,0.7)' } } },
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1 }, children: lines } },
      ],
    },
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function eveMakeEyecatch(input: Record<string, unknown>, rasterize: EveRasterize): Promise<EveImage> {
  const title = titleOf(input);
  const png = await rasterize(eveEyecatchElement(title));
  // PNG の印（89 50 4E 47）を確かめる。
  if (png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) throw new Error('PNG が作れませんでした。');
  return { mime: 'image/png', bytes: png.length, sha256: await sha256(png), width: EVE_IMAGE_SIZE.width, height: EVE_IMAGE_SIZE.height, alt: title, base64: base64(png) };
}
