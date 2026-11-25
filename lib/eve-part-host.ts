/**
 * Eve が作った部品: LP を置き場に置く用意をする（能力 site.host）。task 130、2026-11-25。
 *
 * 公開は外へ出す工程なので、この部品は公開しない（設計書 9 章「公開・送信・送金・契約は本人」）。置く物の一式を作るまで:
 * 1. 広告の表示・表現の点検（compliance.check の門）が ok の時だけ進む。ok でなければ失敗を返す。
 * 2. 提携の承認で受け取ったリンク（https だけ）を、LP の {{AFFILIATE_URL}} に入れる。置き場が残っていれば失敗を返す。
 * 3. index.html と見出し画像を、中身の sha256 付きの一式にする。本人は、この一式を自分の置き場（ブログの固定ページ・静的な置き場）に置き、
 *    置いた URL を Eve に返す（実行役が「本人の番」として待つ）。
 * 外へ通信しない。
 */

import { EVE_AFFILIATE_PLACEHOLDER } from './eve-part-shared.ts';

export const EVE_PART_HOST_REF = 'eve-part:static-bundle';

export type EveBundleFile = { path: string; mime: string; bytes: number; sha256: string; text?: string; base64?: string };
export type EveBundle = { status: 'prepared'; entry: 'index.html'; files: EveBundleFile[]; bundleSha256: string; affiliateHost: string; instructions: string[] };

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 提携の承認で受け取ったリンクを確かめる（https・2,000 文字まで・空白や引用符なし）。 */
export function eveAffiliateUrl(approval: unknown): URL {
  const box = approval && typeof approval === 'object' ? (approval as Record<string, unknown>) : {};
  const raw = typeof box.affiliateUrl === 'string' ? box.affiliateUrl.trim() : typeof approval === 'string' ? approval.trim() : '';
  if (!raw) throw new Error('提携の承認で受け取ったリンク（affiliateUrl）がありません。承認の後に、ASP の画面のリンクを入れてください。');
  if (raw.length > 2_000 || /[\s"'<>`]/u.test(raw)) throw new Error('リンクの形が違います（空白・引用符を含まない、2,000 文字までの URL）。');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('リンクを URL として読めません。');
  }
  if (url.protocol !== 'https:') throw new Error('リンクは https だけを使います。');
  return url;
}

/** 点検の門の結果を確かめる。 */
export function eveRequireAdCheck(check: unknown) {
  const c = check && typeof check === 'object' ? (check as Record<string, unknown>) : null;
  if (!c || c.ok !== true) throw new Error('広告の表示・表現の点検に通っていません。点検に通るまで置きません。');
}

const attr = (s: string) => s.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

export async function evePrepareBundle(input: Record<string, unknown>): Promise<EveBundle> {
  eveRequireAdCheck(input['広告表示・表現の確認結果']);
  const lp = input['紹介 LP'];
  if (typeof lp !== 'string' || !lp.includes('<html')) throw new Error('置く LP（紹介 LP の HTML）がありません。');
  const url = eveAffiliateUrl(input['提携承認または申請結果']);
  const html = lp.split(EVE_AFFILIATE_PLACEHOLDER).join(attr(url.href));
  if (html.includes('{{')) throw new Error('LP に、埋まっていない置き場（{{…}}）が残っています。');
  const enc = new TextEncoder().encode(html);
  const files: EveBundleFile[] = [{ path: 'index.html', mime: 'text/html; charset=utf-8', bytes: enc.length, sha256: await sha256(enc), text: html }];
  const image = input['図・画像素材'] as { mime?: unknown; base64?: unknown } | undefined;
  if (image && image.mime === 'image/png' && typeof image.base64 === 'string') {
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
    files.push({ path: 'eyecatch.png', mime: 'image/png', bytes: bytes.length, sha256: await sha256(bytes), base64: image.base64 });
  }
  const bundleSha256 = await sha256(new TextEncoder().encode(files.map((f) => `${f.path}:${f.sha256}`).join('\n')));
  return {
    status: 'prepared',
    entry: 'index.html',
    files,
    bundleSha256,
    affiliateHost: url.host,
    instructions: [
      'index.html を、自分のブログの固定ページか静的な置き場に置きます（eyecatch.png は同じ場所に置きます）。',
      '置いたページを開き、一番上に「広告（PR）」が出ている事と、ボタンのリンク先が ASP の画面のリンクと同じ事を確かめます。',
      '置いたページの URL を Eve に返します。',
    ],
  };
}
