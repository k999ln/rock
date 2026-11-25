/**
 * Eve が作った部品の一覧（task 130、2026-11-25）。部品の名前 → こなす能力・版を作るファイル・LLM を使うか。
 *
 * 部品の版 = sha256（ファイルの中身を改行でつないだ物 + LLM を使う部品は「\nmodel:<モデルの名前#hash>」）。
 * 確かめる（scripts/eve-verify-parts.mjs）・実行する（scripts/eve-run.mjs）・試験（tests/eve-combination-parts.test.mjs）が同じ一覧を使う。
 * ファイルを直すと版が変わる。確かめ直して、組み合わせの新しい版に書くまで、実行役はその部品を呼ばない。
 */

export type EvePartSpec = { capability: string; files: readonly string[]; llm: boolean };

export const EVE_PART_FILES: Readonly<Record<string, EvePartSpec>> = {
  'eve-part:results-csv': { capability: 'tracking.results', files: ['lib/eve-part-results.ts'], llm: false },
  'eve-part:script-writer': { capability: 'content.script', files: ['lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: true },
  'eve-part:keyword-research': { capability: 'research.market', files: ['lib/eve-part-research.ts', 'lib/eve-part-llm.ts'], llm: true },
  'eve-part:terms-reader': { capability: 'research.terms', files: ['lib/eve-part-terms.ts', 'lib/eve-part-adcheck.ts', 'lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: true },
  'eve-part:ad-check': { capability: 'compliance.check', files: ['lib/eve-part-adcheck.ts', 'lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: false },
  'eve-part:offer-compare': { capability: 'research.offer', files: ['lib/eve-part-offers.ts'], llm: false },
  'eve-part:article-writer': { capability: 'content.article', files: ['lib/eve-part-article.ts', 'lib/eve-part-shared.ts', 'lib/eve-part-writer.ts', 'lib/eve-part-llm.ts'], llm: true },
  'eve-part:eyecatch-image': { capability: 'content.image', files: ['lib/eve-part-image.ts', 'lib/eve-part-image-node.ts'], llm: false },
  'eve-part:lp-builder': { capability: 'site.build', files: ['lib/eve-part-lp.ts', 'lib/eve-part-shared.ts'], llm: false },
  'eve-part:static-bundle': { capability: 'site.host', files: ['lib/eve-part-host.ts', 'lib/eve-part-shared.ts'], llm: false },
  'eve-part:blog-package': { capability: 'publish.blog', files: ['lib/eve-part-blog.ts', 'lib/eve-part-host.ts', 'lib/eve-part-shared.ts'], llm: false },
};

/** 部品の版を作る（ファイルの読み方は呼ぶ側が渡す。Node・試験・画面で同じ式）。 */
export async function evePartVersion(ref: string, read: (file: string) => string | Promise<string>, model: string | null): Promise<string> {
  const spec = EVE_PART_FILES[ref];
  if (!spec) throw new Error(`知らない部品です（${ref}）。`);
  if (spec.llm && !model) throw new Error(`「${ref}」は LLM を使う部品なので、モデルの名前が要ります。`);
  const text = (await Promise.all(spec.files.map(async (f) => read(f)))).join('\n') + (spec.llm ? `\nmodel:${model}` : '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
