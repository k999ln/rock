// avoado.si に、まとめの PR（#43）の中身が出たかを見る（読むだけ）。Noah 自身の案内の印の文字が、/noah/ready の JS に入っているか。
const BASE = process.argv[2] ?? 'https://avoado.si';
const html = await (await fetch(`${BASE}/noah/ready`, { headers: { 'User-Agent': 'Mozilla/5.0 Noah-acceptance' } })).text();
const srcs = [...new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]))];
let found = false;
for (const src of srcs) {
  const js = await (await fetch(new URL(src, BASE))).text();
  if (js.includes('Noahの案内（広告を含む）') || js.includes('Noah\\u306e\\u6848\\u5185')) { found = true; break; }
}
console.log(JSON.stringify({ scripts: srcs.length, adNoticeInJs: found }));
