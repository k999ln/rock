/**
 * Eve が作った部品: 台本・文章を書く（能力 content.script）。task 130、2026-11-24。
 *
 * 2026-11-24 の確かめで、Noah の一覧にこの能力をこなせるエージェントが 0 件だった（data/eve-verifications/2026-11-24.json）。
 * 台本を 4 つの部分（迷いに寄りそう・比べる所・確かめる事・締め）に分け、部分ごとに LLM へ 1 回ずつ頼んでつなぐ（呼び直さない）。
 * 決まった式で次を守る。モデルの出来に任せない。
 * - 広告であることを、部品が最初の行に「PR」と書く（景品表示法のステルスマーケティング規制）。
 * - 言い切り・順位・約束の表現（必ず・絶対・No.1・最安・業界一・日本一・トップクラス・100%・満足度・解決します など）が入っていたら、出さずに失敗を返す（呼び直さない）。「必ずご確認ください」のような、確かめを勧める使い方だけは通す。
 * - 長さは 120〜600 文字。外れたら失敗を返す。
 */

import { eveCleanLlmText, eveGraphemes, type EveLlm } from './eve-part-llm.ts';

export const EVE_PART_SCRIPT_REF = 'eve-part:script-writer';

export const EVE_PART_SCRIPT_SYSTEM = [
  'あなたは、広告の短い台本の一部を日本語で書く係です。',
  '出力は頼まれた部分の文だけにします。説明・見出し・番号・箇条書き・記号の飾り・「PR」は書きません。',
  '商品やサービスの良さ・順位・評判・効果は書きません（確かめていないため）。「トップクラス」「充実」「人気」のような言葉も書きません。',
  '「必ず」「絶対」「最安」「業界一」「日本一」「100%」「確実に」のような言い切りは書きません。',
].join('\n');

/** 台本の 4 つの部分。部分ごとに 1 回ずつ頼み、この順につなぐ（小さなモデルでも長さと順が崩れないように）。 */
export const EVE_PART_SCRIPT_SECTIONS: readonly string[] = [
  '見る人の迷いを言い当てる問いかけを、2 文で書いてください。形の例:「〜で迷っていませんか。〜も気になりますよね。」',
  '比べる時に見る所を 2〜3 個挙げる文を、2 文で書いてください。形の例:「比べる時は、〜と〜と〜を見てください。〜も大切です。」',
  '申し込む前に、公式の案内で確かめる事を勧める文を、2 文で書いてください。形の例:「申し込む前に、〜を公式サイトで確かめましょう。〜も見ておくと安心です。」',
  '自分で比べて選ぶよう促す締めの文を、1〜2 文で書いてください。形の例:「〜を試して、自分に合う方を選んでください。」',
];

/** 言い切り・順位・約束の表現。入っていたら出さない。「必ずご確認ください」のような、確かめを勧める使い方だけは通す。 */
export const EVE_PART_SCRIPT_BANNED = /(必ず(?!ご?確認|お?確かめ)|絶対|No\.?\s?1|ナンバーワン|最安|業界一|日本一|業界最高|トップクラス|トップレベル|100\s?[%％]|確実に|誰でも儲か|稼げる保証|満足度|解決します|お任せください|保証します)/iu;

export async function eveWriteScript(input: { brief?: unknown }, llm: EveLlm): Promise<{ text: string; model: string }> {
  if (typeof input.brief !== 'string' || !input.brief.trim()) throw new Error('台本の指示（brief）がありません。');
  if (input.brief.length > 2_000) throw new Error('台本の指示が長すぎます（2,000 文字まで）。');
  const brief = input.brief.trim();
  const parts: string[] = [];
  let model = '';
  for (const section of EVE_PART_SCRIPT_SECTIONS) {
    const res = await llm({ messages: [{ role: 'system', content: EVE_PART_SCRIPT_SYSTEM }, { role: 'user', content: `台本の指示: ${brief}\n\n${section}` }], maxTokens: 200, temperature: 0 });
    model = res.model;
    // 文の終わり（。！？）で終わる行だけを残す（見出しのような行を落とす）。
    const piece = eveCleanLlmText(res.text).replace(/^PR[｜|:：\s]*/u, '').split('\n').map((l) => l.trim()).filter((l) => /[。！？!?」]$/u.test(l)).join('').replace(/^「(.*)」$/u, '$1');
    if (!piece) throw new Error('台本の一部が空で返りました。');
    parts.push(piece);
  }
  const text = `PR\n${parts.join('\n')}`;
  const banned = EVE_PART_SCRIPT_BANNED.exec(text);
  if (banned) throw new Error(`言い切りの表現（${banned[0]}）が入ったので出しません。`);
  const n = eveGraphemes(text);
  if (n < 120 || n > 600) throw new Error(`長さが 120〜600 文字の外です（${n} 文字）。`);
  return { text, model };
}
