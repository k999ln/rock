import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screen } from './fixtures/noah/screen.mjs';

// 本人の決定（2026-11-25「乗せた時だけ出す」）: ホームのカードの保存と「その他」は、PC はマウスを乗せた時だけ絵の上に、
// スマホは絵に何も重ねず、カードの右下の「…」から。2026-11-28 まで、説明付きのカードだけ、丸い「…」と保存が絵の上に出たままで、
// 絵の中の題（例: Enzo's の「Enz」）を隠していた。題名だけのカードと同じ決まりを、全部のカードに使う。

const card = (id, more = {}) => ({
  id, name: `Agent ${id}`, summary: 'Finds restaurants near you.', summaryJa: '近くのレストランを探します。',
  href: `/noah/ready/agent?id=${id}`, host: 'example.com', provider: 'Example', savedIn: [], sources: [], external: false, ...more,
});

// 評価の部品は、絵の外（説明付きのカードの下の行）に出す物。JSX は描く前の形で受け取るので、部品そのもので見分ける。
const Ratings = () => null;
const mountGrid = (items, signedIn) => {
  const pins = [];
  const ui = screen({ modules: {
    './noah-agent-pin': {
      NoahAgentPin: (props) => { pins.push(props); return null; },
      NoahAgentPinGrid: ({ children }) => ({ type: 'ul', props: { children } }),
    },
    './noah-agent-source-ratings': { default: Ratings },
  } });
  ui.mount('components/noah-pin-grid.tsx', { items, signedIn, ownerScope: signedIn ? 'scope' : null, onHide: () => {} });
  return pins;
};

const kinds = (node, found = []) => {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { for (const child of node) kinds(child, found); return found; }
  if (node.type) found.push({ type: node.type, props: node.props ?? {} });
  kinds(node.props?.children, found);
  return found;
};

void test('説明付きのカードも題名だけのカードも、保存と「…」を同じ決まりで出す（外のカードは出さない）', () => {
  const items = [
    card('described'),
    card('plain', { pin: { title: 'Plain pin', scene: 'desk' } }),
    card('outside', { external: true }),
  ];
  for (const signedIn of [false, true]) {
    const pins = mountGrid(items, signedIn);
    assert.deepEqual(pins.map((pin) => [pin.id, pin.menu]), [['described', true], ['plain', true], ['outside', false]]);
    for (const pin of pins.slice(0, 2)) {
      const nodes = kinds(pin.actions);
      const save = nodes.filter((node) => node.type === 'button' && !('data-touch' in node.props) && !('data-hide' in node.props));
      assert.equal(save.length, 1, `${pin.id}: 絵の上の保存は 1 つ`);
      const menu = nodes.filter((node) => node.type === 'details');
      assert.equal(menu.length, 1, `${pin.id}: 「…」は 1 つ（ログインしていなくても、スマホの保存の為に出す）`);
      const inside = kinds(menu[0].props.children);
      assert.equal(inside.filter((node) => 'data-touch' in node.props).length, 1, `${pin.id}: スマホの保存は「…」の中`);
      assert.equal(inside.filter((node) => 'data-hide' in node.props).length, signedIn ? 1 : 0, `${pin.id}: 「表示しない」はログインした人だけ`);
    }
    assert.equal(kinds(pins[0].actions).filter((node) => node.type === Ratings).length, 1, '説明付きのカードは評価を残す');
    assert.equal(kinds(pins[1].actions).filter((node) => node.type === Ratings).length, 0, '題名だけのカードは評価を出さない');
    assert.equal(kinds(pins[2].actions).filter((node) => node.type === 'button' || node.type === 'details').length, 0, '外のカードには保存も「…」も無い');
  }
});

void test('カードは menu か題名だけの時に data-menu を持ち、CSS はその印で PC とスマホを分ける', () => {
  const ui = screen({ modules: { './noah-art-motion': { NoahPinMotion: () => null } } });
  const article = (props) => ui.mount('components/noah-agent-pin.tsx#NoahAgentPin', {
    id: 'enzo', name: "Enzo's", summary: 'Restaurant concierge', href: '/noah', actions: 'actions', ...props,
  }).find('article')[0].props;
  assert.equal(article({ menu: true })['data-menu'], '');
  assert.equal(article({ plain: true })['data-menu'], '');
  assert.equal(article({})['data-menu'], undefined);

  const css = readFileSync(new URL('../components/noah-agent-pin.module.css', import.meta.url), 'utf8');
  const block = (query) => {
    const start = css.indexOf(`@media (${query}) {`);
    assert.ok(start >= 0, query);
    return css.slice(start, css.indexOf('\n}', start));
  };
  // PC: 乗せた時（キーで選んだ時）だけ出す。「…」はログインした人の「表示しない」がある時だけ（保存は絵の上に別にある）。
  const pc = block('hover:hover');
  assert.match(pc, /\.card\[data-menu\] \.actions > :is\(button, details\) \{ opacity: 0; pointer-events: none; \}/);
  assert.match(pc, /\.card\[data-menu\]:is\(:hover, :focus-within\) \.actions > :is\(button, details\) \{ opacity: 1; pointer-events: auto; \}/);
  assert.match(pc, /\.card\[data-menu\] \.actions > details \[data-touch\] \{ display: none; \}/);
  // スマホ: 絵に何も重ねない。保存のボタンを隠し、「…」はカードの右下。字は「…」の下に入らない。
  const phone = block('hover:none');
  assert.match(phone, /\.card\[data-menu\] \.actions > button \{ display: none; \}/);
  assert.match(phone, /\.card\[data-menu\] \.actions > details \{ top: auto; bottom: 4px;/);
  assert.match(phone, /\.card\[data-menu\] \.meta \{ padding-inline-end: 32px; \}/);
  assert.match(phone, /\.card\[data-menu\]:not\(\[data-plain\]\) \.meta \{ padding-inline-end: 24px; word-break: keep-all; \}/, '説明付きのカードの下の行は、「…」の点の分だけ空け、語の途中で折り返さない');
  assert.doesNotMatch(css, /\.card\[data-plain\] \.actions/, '保存と「…」の決まりを、題名だけのカードに限らない');
});
