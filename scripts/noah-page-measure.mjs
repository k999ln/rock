// 1 つの画面を測る（ブラウザの中で動く関数）。scripts/noah-prod-check.mjs が Playwright の page.evaluate で使う。
// 本人の端末のブラウザで確かめる時も、同じ関数の本文をそのまま実行できるように、外の物を何も使わない。
// 数え方（task 129 の D7、spec-90 の 5 章の 1。scripts/noah-public-walk.mjs と同じ）:
// - はみ出し: 画面の横幅より広い文書（横に動く）。
// - 小さい押す所: 押せる物（ボタン・リンク・選ぶ欄・開く印・チェックボックスとラジオ）の、幅か高さが 44px より小さい物。
//   文の中のリンク（p・li の中の、class の無い a）は、文の行の高さのままでよい。チェックボックスとラジオは、包む label の大きさで測る。
//   見えない物（大きさ 0・隠した物・読み上げだけの 2px 以下の物）は数えない。
export function measureNoahPage() {
  const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const hidden = (element) => {
    const style = getComputedStyle(element);
    return style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || !!element.closest('[hidden], [aria-hidden="true"], [inert]');
  };
  const label = (element) => (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name') || element.getAttribute('href') || '')
    .trim().replace(/\s+/g, ' ').slice(0, 32);
  const small = [];
  const seen = new Set();
  for (const element of document.querySelectorAll('button, a[href], select, summary, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"]')) {
    if (hidden(element)) continue;
    // 閉じた details の中（その summary を除く）は、見えないので数えない。
    const closed = element.closest('details:not([open])');
    if (closed && !closed.querySelector(':scope > summary')?.contains(element)) continue;
    if (element.tagName === 'A' && element.closest('p, li') && !element.className) continue;
    const target = element.tagName === 'INPUT' ? (element.closest('label') || (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) || element) : element;
    if (seen.has(target)) continue;
    seen.add(target);
    const box = target.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) continue;
    if (box.width < 44 || box.height < 44) small.push(`${element.tagName.toLowerCase()}「${label(target)}」${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  return { overflow, small: [...new Set(small)], title: document.title, path: location.pathname + location.search };
}
