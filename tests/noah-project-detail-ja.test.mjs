import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';

// ホームの「すべて」に 5 枚に 1 枚入る見つかった物（GitHub など）は、カードでは説明の日本語の 1 行（summaryJa）を出す。
// 押した先の詳細も同じ 1 行を頭に出し、提供者が書いた元の説明は「自動翻訳 · 原文」で読める（spec-74）。絵はカードと同じ物。

const original = '열린영수증: 영수증을 올리면 AI 에이전트가 증빙 묶음을 완성하는, 작은 단체를 위한 지출 관리';
const japanese = '開かれた領収書: 領収書を上げると AI の Agent が証拠書類の束を仕上げる、小さな団体のための支出の管理。';
const card = (more = {}) => ({
  id: 'project-0de568f451e2', feedbackId: 'project-0de568f451e2', name: 'open-receipt', summary: original, provider: 'happydeveloper',
  host: 'github.com', href: 'https://github.com/happydeveloper/open-receipt', external: true, savedIn: [], sources: [], ...more,
});

const render = (locale, detailCard) => {
  const drawn = [];
  const quiet = { default: () => null };
  const ui = screen({ locale, modules: {
    './noah-agent-feedback': quiet, './noah-ready-detail': quiet, './noah-training-plugin': quiet, './noah-cloud-agent': quiet,
    './noah-provider-runner': quiet, './noah-registration-status': quiet,
    './noah-art-motion': { NoahPinMotion: (props) => { drawn.push({ ...props }); return null; } },
  } });
  const page = ui.mount('components/noah-project-detail.tsx', {
    id: detailCard.id, initialDetail: { card: detailCard, connection: { kind: 'setup', importHref: null } },
  });
  const text = page.text();
  return { text, drawn, count: (needle) => text.split(needle).length - 1, toggles: page.find('summary').filter((node) => /自動翻訳/.test(JSON.stringify(node.props.children))) };
};

void test('日本語の画面では、見つかった物の詳細の頭に日本語の 1 行、元の説明は「自動翻訳 · 原文」の中に 1 回だけ', () => {
  const { text, drawn, count, toggles } = render('ja', card({ summaryJa: japanese }));
  assert.equal(count(japanese), 1, text);
  assert.equal(count(original), 1, '元の説明は「原文」の中だけ（本文に同じ文を 2 回出さない）');
  assert.equal(toggles.length, 1);
  assert.deepEqual(drawn.map((art) => [art.summary, art.caption]), [[original, japanese]], '絵の場面は元の説明で選び、絵の中の字は日本語（カードと同じ）');
});

void test('日本語の 1 行が無い物と、日本語以外の画面は、今までどおり元の説明', () => {
  for (const { locale, detailCard } of [{ locale: 'ja', detailCard: card() }, { locale: 'en', detailCard: card({ summaryJa: japanese }) }, { locale: 'ja', detailCard: card({ summaryJa: original }) }]) {
    const { text, drawn, count, toggles } = render(locale, detailCard);
    assert.equal(count(japanese), 0, `${locale}: ${text}`);
    assert.ok(count(original) >= 1);
    assert.equal(toggles.length, 0);
    assert.deepEqual(drawn.map((art) => [art.summary, art.caption]), [[original, original]]);
  }
});
