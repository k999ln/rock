/**
 * Eve が作った部品: 記事を書く（能力 content.article）。task 130、2026-11-25。
 *
 * 記事の指示（lib/eve-glue.ts のつなぎ目が作る「指示」「入れる語」「紹介する物」）から、ブログに置く Markdown の記事を作る。
 * 決まった式で守る事（モデルの出来に任せない）:
 * - 1 行目は広告の表示（景品表示法のステルスマーケティング規制）。部品が書く。モデルには書かせない。
 * - 見出し・紹介の節・リンクの置き場（{{AFFILIATE_URL}}）は部品が書く。紹介する物の中身（料金・機能・評判）は書かない。確かめていないため。
 * - モデルには、選び方の一般的な文だけを、節ごとに 1 回ずつ頼む（呼び直さない）。返った文のうち、次の文は捨てる:
 *   言い切り・順位・約束（台本の部品と同じ一覧）、効き目の言い切り、数字・金額・割合（確かめていない数を出さない）、
 *   紹介する物の名前（中身を推量で書かせない）、「PR」「広告」（表示は部品だけが書く）。
 * - 2 文が残らなかった節は出さない。そういう節が 3 つ以上なら、記事を出さずに失敗を返す。全体で 1,500 文字に足りなくても失敗を返す。
 */

import { eveCleanLlmText, eveGraphemes, type EveLlm } from './eve-part-llm.ts';
import { EVE_PART_SCRIPT_BANNED } from './eve-part-writer.ts';
import { EVE_AFFILIATE_PLACEHOLDER, EVE_ARTICLE_LABEL } from './eve-part-shared.ts';

export const EVE_PART_ARTICLE_REF = 'eve-part:article-writer';

export const EVE_PART_ARTICLE_SYSTEM = [
  'あなたは、ブログ記事の一部を日本語で書く係です。読む人が自分で比べて選べるように、選び方だけを書きます。',
  '返事は、文を並べた JSON の配列（["…。","…。"]）だけにします。説明・見出し・番号・「PR」「広告」は書きません。',
  '文ごとに違う事を書き、書き出しの言葉も文ごとに変えます。',
  '商品やサービスの名前・料金・機能・評判・順位は書きません。数字や金額や割合も書きません。',
  '「必ず」「絶対」「最安」「業界一」「日本一」「100%」「確実に」「おすすめ No.1」のような言い切りは書きません。',
  '決まりの中身（いつ解約できるか・いくらかかるか・何ができるか）は書かず、確かめる事を勧めるだけにします。',
  '「です・ます」で、短い文を書きます。',
].join('\n');

const EFFECT = /(治る|治ります|完治|痩せ(る|ます)|効果があります|効果抜群|効き目)/u;
const NUMBER = /([0-9０-９]|円|％|%|万|千|億|ドル)/u;
const OWN_LABEL = /(PR|広告|アフィリエイト|プロモーション)/iu;

export type EveArticle = { text: string; title: string; model: string; dropped: number; skipped: string[] };

/** 6 文の節の書き出し（小さなモデルが同じ書き出しを繰り返さないように、順を決めて渡す）。 */
const OPENERS = ['まず、', '次に、', 'また、', 'たとえば、', 'そのうえで、', '最後に、'] as const;
/** 書き出しと締めの節の書き出し（4 文。2026-11-25 の本番の回で、書き出しの節が 1 文しか返らなかったため、全部の節で順を渡す）。 */
const INTRO_OPENERS = ['最近、', 'ただ、', 'そこで、', 'この記事では、'] as const;
const CLOSING_OPENERS = ['ここまで、', 'どれを選ぶ時も、', 'まずは、', '最後は、'] as const;
/** 節が欠けてよい数（文が 2 つ残らなかった節は出さない。欠けが多い時は記事を出さない）。 */
const MAX_SKIPPED = 2;
const LEAD = /^(まず|次に|また|たとえば|例えば|そのうえで|その上で|最後に|さらに|そして|最近|ただ|そこで|この記事では|ここまで|どれを選ぶ時も|まずは|最後は)、?/u;

type Section = { heading: string | null; ask: string; sentences: number; openers: readonly string[] };

/** 節の並び。見出しは決まった言葉（調べた言葉を見出しに使うと、テーマから外れた言葉が見出しになった。2026-11-25）。調べた言葉は、本文に入れたい言葉としてモデルに渡す。 */
function plan(topic: string): Section[] {
  return [
    { heading: null, ask: `「${topic}」を探している人の迷いに寄りそう、記事の書き出しの文を 4 つ書いてください。`, sentences: 3, openers: INTRO_OPENERS },
    { heading: '選ぶ前に、使う目的を決める', ask: `「${topic}」を選ぶ前に、使う目的や使う場面を決めておく大切さを説明する文を、6 つ書いてください。1 つの文は 40〜70 文字です。`, sentences: 6, openers: OPENERS },
    { heading: '使い方と料金の決まりで比べる', ask: `「${topic}」を「使い方」と「料金の決まり」の 2 つの見方で比べる時に、何を見ればよいかを説明する文を、6 つ書いてください。1 つの文は 40〜70 文字です。`, sentences: 6, openers: OPENERS },
    { heading: '始めやすさ・困った時の助け・やめやすさも見る', ask: `「${topic}」を比べる時に、「始めやすさ」「困った時の助け」「やめやすさ」も見ておく理由を説明する文を、6 つ書いてください。1 つの文は 40〜70 文字です。`, sentences: 6, openers: OPENERS },
    { heading: '申し込む前に確かめること', ask: `「${topic}」に申し込む前に、公式の案内で確かめておく事（料金の決まり・解約の決まり・使える範囲など）を勧める文を、6 つ書いてください。1 つの文は 40〜70 文字です。`, sentences: 6, openers: OPENERS },
    { heading: 'よくある迷い', ask: `「${topic}」を選ぶ人がよく迷う事を 1 つ挙げ、どう考えればよいかを説明する文を、6 つ書いてください。1 つの文は 40〜70 文字です。`, sentences: 6, openers: OPENERS },
    { heading: 'まとめ', ask: `「${topic}」を自分で比べて選ぶよう促す、記事の締めの文を 4 つ書いてください。`, sentences: 3, openers: CLOSING_OPENERS },
  ];
}

/** 返事（文の JSON の配列。読めなければ文章）を文に分け、捨てる文を除く。 */
export function eveArticleSentences(text: string, names: readonly string[]): { kept: string[]; dropped: number } {
  let pieces: string[] = [];
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  try {
    const list: unknown = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
    if (Array.isArray(list)) pieces = list.filter((v): v is string => typeof v === 'string');
  } catch { /* 文章として読む */ }
  const flat = (pieces.length ? pieces.join('') : eveCleanLlmText(text)).replace(/^[-*・\d.]+\s*/gmu, '').replace(/\s*\n\s*/gu, '');
  const sentences = flat.match(/[^。！？!?]+[。！？!?]/gu) ?? [];
  const kept: string[] = [];
  let dropped = 0;
  for (const raw of sentences) {
    const s = raw.trim().replace(/^「(.*)」$/u, '$1');
    const bad = !s || EVE_PART_SCRIPT_BANNED.test(s) || EFFECT.test(s) || NUMBER.test(s) || OWN_LABEL.test(s) || names.some((n) => n && s.includes(n));
    // つなぎの言葉を除いた最初の 12 文字が同じ文は、2 つ目から捨てる（小さなモデルの繰り返しを出さない）。
    const head = (t: string) => Array.from(t.replace(LEAD, '')).slice(0, 12).join('');
    if (bad || kept.some((k) => head(k) === head(s))) dropped++;
    else kept.push(s);
  }
  return { kept, dropped };
}

function briefOf(input: Record<string, unknown>) {
  const b = input['記事の指示'];
  const brief = b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  const order = typeof brief['指示'] === 'string' ? brief['指示'] : typeof input.brief === 'string' ? input.brief : '';
  const topic = typeof input.topic === 'string' && input.topic.trim() ? input.topic.trim() : /「([^」]{1,60})」/u.exec(order)?.[1] ?? '';
  const words = (Array.isArray(brief['入れる語']) ? brief['入れる語'] : Array.isArray(input.keywords) ? input.keywords : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()).slice(0, 5);
  const offers = (Array.isArray(brief['紹介する物']) ? brief['紹介する物'] : Array.isArray(input.offers) ? input.offers : []) as Record<string, unknown>[];
  const names = offers.map((o) => (typeof o?.['名前'] === 'string' ? o['名前'] : typeof o?.name === 'string' ? o.name : '')).filter(Boolean) as string[];
  return { topic, words, names };
}

export async function eveWriteArticle(input: Record<string, unknown>, llm: EveLlm): Promise<EveArticle> {
  const { topic, words, names } = briefOf(input);
  if (!topic) throw new Error('記事の題（指示の「」の中か topic）がありません。');
  if (topic.length > 60) throw new Error('記事の題が長すぎます（60 文字まで）。');
  if (!names.length) throw new Error('紹介する物（記事の指示の「紹介する物」か offers）がありません。');
  const title = `${topic}の選び方｜比べる時に見る所と、申し込む前に確かめる事`;
  const lines = [EVE_ARTICLE_LABEL, '', `# ${title}`, ''];
  let model = '';
  let dropped = 0;
  const skipped: string[] = [];
  const sections = plan(topic);
  for (const [i, section] of sections.entries()) {
    const openers = `\n書き出しは、順に${section.openers.map((o) => `「${o}」`).join('')}にしてください。`;
    const res = await llm({ messages: [{ role: 'system', content: EVE_PART_ARTICLE_SYSTEM }, { role: 'user', content: `記事の題: ${title}\n入れたい言葉: ${words.join('、') || 'なし'}\n\n${section.ask}${openers}` }], maxTokens: 560, temperature: 0 });
    model = res.model;
    const { kept, dropped: d } = eveArticleSentences(res.text, names);
    dropped += d;
    if (kept.length < 2) {
      // 文が 2 つ残らなかった節は出さない（呼び直さない）。欠けが多ければ、記事を出さない。
      skipped.push(section.heading ?? '書き出し');
      if (skipped.length > MAX_SKIPPED) throw new Error(`使える文が 2 文残らなかった節が ${skipped.length} つあります（${skipped.join('・')}。捨てた文 ${dropped}）。`);
    } else {
      if (section.heading) lines.push(`## ${section.heading}`, '');
      lines.push(kept.slice(0, section.sentences + 2).join(''), '');
    }
    // 紹介の節は、確かめる事の節の後に、部品が書く（モデルに中身を書かせない）。
    if (i === 4) {
      for (const name of names.slice(0, 3)) {
        lines.push(`## ${name}を見てみる`, '', `${name}の料金・できる事・解約の決まりは、公式サイトで確かめてください。この記事では、${name}の中身を評価していません。上で挙げた見る所を、公式サイトの案内と照らし合わせてみてください。`, '', `[${name}の公式サイトを見る](${EVE_AFFILIATE_PLACEHOLDER})`, '');
      }
    }
  }
  const text = lines.join('\n').trim() + '\n';
  const n = eveGraphemes(text);
  if (n < 1_500) throw new Error(`記事が 1,500 文字に足りません（${n} 文字。捨てた文 ${dropped}・欠けた節 ${skipped.length}）。`);
  if (n > 8_000) throw new Error(`記事が長すぎます（${n} 文字）。`);
  return { text, title, model, dropped, skipped };
}
