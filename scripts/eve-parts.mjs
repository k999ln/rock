// Eve の部品を Node の端末で呼ぶ所（確かめる scripts/eve-verify-parts.mjs と、実行役 scripts/eve-run.mjs が同じ物を使う）。task 130、2026-11-25。
import { eveReadResults } from '../lib/eve-part-results.ts';
import { eveWriteScript } from '../lib/eve-part-writer.ts';
import { eveResearchKeywords } from '../lib/eve-part-research.ts';
import { eveCheckAd } from '../lib/eve-part-adcheck.ts';
import { eveReadTerms } from '../lib/eve-part-terms.ts';
import { eveCompareOffers } from '../lib/eve-part-offers.ts';
import { eveWriteArticle } from '../lib/eve-part-article.ts';
import { eveMakeEyecatch } from '../lib/eve-part-image.ts';
import { eveNodeRasterizer } from '../lib/eve-part-image-node.ts';
import { eveBuildLp } from '../lib/eve-part-lp.ts';
import { evePrepareBundle } from '../lib/eve-part-host.ts';
import { evePrepareBlogPost } from '../lib/eve-part-blog.ts';

/** 部品の名前 → 呼び方。llm は手元の Qwen の呼び出し役（lib/eve-part-llm.ts の eveLocalLlm）。 */
export function evePartRunners(llm) {
  return {
    'eve-part:results-csv': async (input) => eveReadResults(input),
    'eve-part:script-writer': async (input) => (await eveWriteScript(input, llm)).text,
    'eve-part:keyword-research': async (input) => eveResearchKeywords(input, { llm }),
    'eve-part:terms-reader': async (input) => eveReadTerms(input, { llm }),
    'eve-part:ad-check': async (input) => eveCheckAd(input),
    'eve-part:offer-compare': async (input) => eveCompareOffers(input),
    'eve-part:article-writer': async (input) => (await eveWriteArticle(input, llm)).text,
    'eve-part:eyecatch-image': async (input) => eveMakeEyecatch(input, eveNodeRasterizer()),
    'eve-part:lp-builder': async (input) => eveBuildLp(input),
    'eve-part:static-bundle': async (input) => evePrepareBundle(input),
    'eve-part:blog-package': async (input) => evePrepareBlogPost(input),
  };
}
