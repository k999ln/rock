/**
 * Eve が作った部品: 紹介の LP を作る（能力 site.build）。task 130、2026-11-25。
 *
 * 案件の比べた結果（lib/eve-part-offers.ts）と調べた題（lib/eve-part-research.ts の topic）から、1 枚の HTML を決まった式で作る。LLM は使わない。
 * - 一番上に広告の表示（景品表示法のステルスマーケティング規制）。最後にも、報酬が入る仕組みを書く。
 * - 紹介する物の中身（料金・機能・評判・順位）は書かない。確かめていないため。読む人に、公式サイトで確かめる事を勧める。
 * - リンクは {{AFFILIATE_URL}} の置き場だけ（提携の承認の後に、置き場の部品が本物のリンクに替える）。rel="sponsored nofollow noopener"。
 * - 外のファイル・スクリプト・字形を読まない（1 枚で完結。閲覧者の通信が他社へ渡らない）。スマホの幅で読める。
 */

import { EVE_AFFILIATE_PLACEHOLDER } from './eve-part-shared.ts';

export const EVE_PART_LP_REF = 'eve-part:lp-builder';

const esc = (s: string) => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');

type Offer = { name: string; condition?: string };

function read(input: Record<string, unknown>) {
  const offersBox = (input['案件・条件'] ?? input) as Record<string, unknown>;
  const list = Array.isArray(offersBox.offers) ? (offersBox.offers as Record<string, unknown>[]) : [];
  const chosenId = typeof offersBox.chosen === 'string' ? offersBox.chosen : null;
  const chosen = (chosenId ? list.find((o) => o.id === chosenId) : null) ?? list[0];
  if (!chosen || typeof chosen.name !== 'string' || !chosen.name.trim()) throw new Error('紹介する案件（案件・条件の offers）がありません。');
  const research = (input['調査結果'] ?? {}) as Record<string, unknown>;
  const topic = typeof research.topic === 'string' && research.topic.trim() ? research.topic.trim() : typeof input.topic === 'string' ? input.topic.trim() : '';
  if (!topic) throw new Error('題（調査結果の topic）がありません。');
  return { offer: { name: chosen.name.trim() } as Offer, topic };
}

export function eveBuildLp(input: Record<string, unknown>): string {
  const { offer, topic } = read(input);
  if (Array.from(topic).length > 60) throw new Error('題が長すぎます（60 文字まで）。');
  const name = esc(offer.name), t = esc(topic);
  // 見る所は決まった 3 つ（調べた言葉を並べると、テーマから外れた言葉が入った。2026-11-25）。
  const points = ['使い方', '料金の決まり', '困った時の問い合わせ先'].map((w) => `<li><strong>${esc(w)}</strong>: 自分の使い方に合うかを、公式の案内で確かめます。</li>`).join('');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>【PR】${t}を選ぶ前に確かめる事</title>
<style>
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1d1d1f;--muted:#5f6368;--line:#d9dde3;--accent:#1f4e79;--accent-fg:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#eceff3;--muted:#a7adb6;--line:#2c3138;--accent:#7fb2e5;--accent-fg:#0b1220}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.8 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}.pr{font-size:13px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:0 0 16px}
h1{font-size:26px;line-height:1.4;margin:8px 0 16px}h2{font-size:20px;margin:32px 0 8px}ul,ol{padding-left:1.4em}
.cta{display:block;text-align:center;background:var(--accent);color:var(--accent-fg);text-decoration:none;font-weight:700;border-radius:8px;padding:14px 16px;margin:16px 0}
footer{font-size:13px;color:var(--muted);border-top:1px solid var(--line);margin-top:32px;padding-top:12px}
</style>
</head>
<body>
<main>
<p class="pr">広告（PR）: このページにはアフィリエイトリンクを含みます。</p>
<h1>${t}を選ぶ前に、確かめておく事</h1>
<p>${t}は、使う目的や使い方によって、合う物が変わります。申し込む前に、次の事を公式の案内で確かめておくと、あとで迷いにくくなります。</p>
<h2>比べる時に見る所</h2>
<ul>${points}</ul>
<h2>申し込む前の確かめ</h2>
<ol><li>料金の決まり（いつ、何に、いくらかかるか）を確かめます。</li><li>解約の決まり（いつまでに、どうやって止めるか）を確かめます。</li><li>使える範囲と、困った時の問い合わせ先を確かめます。</li></ol>
<h2>${name}を見てみる</h2>
<p>${name}の料金・できる事・解約の決まりは、公式サイトで確かめてください。このページでは、${name}の中身を評価していません。</p>
<a class="cta" href="${EVE_AFFILIATE_PLACEHOLDER}" rel="sponsored nofollow noopener" target="_blank">${name}の公式サイトで確かめる</a>
<footer>このページは広告を含みます。上のリンクから申し込みがあると、このページの運営者に報酬が支払われることがあります。紹介する物の内容と条件は、リンク先の公式サイトの案内が正しい物です。</footer>
</main>
</body>
</html>
`;
}
