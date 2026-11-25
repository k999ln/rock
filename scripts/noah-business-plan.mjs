#!/usr/bin/env node
// 稼ぎ方の設計図の計画を作る（task 122）。Noah の公開の一覧（今動かせるエージェント）と、集めた紹介（まだ動かせない物）を読み、
// 設計図ごとに工程へエージェントを当て、並べ、アカウントを作る順と、Eve が作る物の一覧を書き出す。読むだけで、何も実行しない。
//
// 使い方: node --experimental-strip-types scripts/noah-business-plan.mjs [--origin https://avoado.si] [--owned asp-a8,x] [--out work/noah-business]
//   --offline: 一覧を読まずに作る（エージェントが無い前提の、工程と手順書だけ）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { NOAH_CAPABILITIES, NOAH_OSHI_AGENT, noahAccountKit, noahAgentsFor, noahEveBacklog, noahPlanBlueprints } from '../lib/noah-business.ts';

const UA = 'NoahBot/1 (+https://avoado.si/noah/help#bot)';
async function readJson(fetcher, url) {
  const response = await fetcher(url, { redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) { await response.body?.cancel(); throw Error(`business_http_${response.status}`); }
  return response.json();
}
/** 今動かせるエージェント（公開の一覧。頁を最後まで）。 */
export async function runnableAgents(fetcher, origin, maxPages = 200) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL('/api/noah/intake', origin);
    if (cursor) url.searchParams.set('cursor', cursor);
    const data = await readJson(fetcher, url);
    for (const item of data.items ?? []) if (typeof item?.id === 'string') out.push({ id: item.id, name: String(item.name ?? ''), summary: String(item.summary ?? '') });
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }
  return out;
}
/** 集めた紹介（まだ動かせない。Eve が包む候補）。 */
export async function discoveredAgents(fetcher, origin, maxPages = 50) {
  const out = [];
  let cursor = '0';
  for (let page = 0; page < maxPages && cursor !== null; page++) {
    const url = new URL('/api/noah/collection', origin);
    url.search = new URLSearchParams({ cursor, view: 'recent' }).toString();
    const data = await readJson(fetcher, url);
    for (const item of data.items ?? []) out.push({ id: String(item.id), name: String(item.name ?? ''), summary: String(item.summary ?? ''), url: String(item.url ?? '') });
    cursor = data.nextCursor ?? null;
  }
  return out;
}

export function businessReport({ runnable, discovered, verified = {}, owned = new Set(), now = Date.now() }) {
  // 確かめた当てはめだけを工程に当てる。今動かせる物が、もう一覧から外れていたら数えない。
  const live = new Set(runnable.map(a => a.id));
  // Eve が作った部品（eve-part:）は Noah の一覧に載らないので、一覧の有無では外さない（task 130）。
  const usable = Object.fromEntries(Object.entries(verified).map(([capability, ids]) => [capability, ids.filter(id => live.has(id) || id.startsWith('eve-part:'))]));
  const plans = noahPlanBlueprints(usable, owned);
  const backlog = noahEveBacklog(plans).map(row => ({ ...row,
    runnable: noahAgentsFor(row.capability, runnable).slice(0, 10).map(a => ({ id: a.id, name: a.name })),
    discovered: noahAgentsFor(row.capability, discovered).slice(0, 10).map(a => ({ name: a.name, url: a.url })) }));
  const coverage = Object.keys(NOAH_CAPABILITIES).map(capability => ({ capability, label: NOAH_CAPABILITIES[capability].label, verified: usable[capability]?.length ?? 0, runnable: noahAgentsFor(capability, runnable).length, discovered: noahAgentsFor(capability, discovered).length }));
  const byModel = {};
  for (const plan of plans) byModel[plan.model] = (byModel[plan.model] ?? 0) + 1;
  // Noah の推し活エージェントの工程ごとに、確かめたエージェントがあるか（無い能力は Eve が確かめるか作る）。
  const oshiAgent = NOAH_OSHI_AGENT.steps.map(step => ({ id: step.id, label: step.label, kind: step.kind, capability: step.capability ?? null, ready: !step.capability || (usable[step.capability]?.length ?? 0) > 0 }));
  return { schema: 'noah-business-plan/1', generatedAt: now, oshiAgent, blueprints: plans.length, byModel, agents: { runnable: runnable.length, discovered: discovered.length }, coverage, accounts: noahAccountKit(plans), eve: backlog,
    top: plans.slice(0, 30).map(p => ({ id: p.id, label: p.label, score: p.score, covered: p.covered, steps: p.steps.length, human: p.humanSteps, tap: p.tapSteps, review: p.reviewSteps, costYen: p.costYen, gaps: p.gaps, accounts: p.accounts })), plans };
}
const kindLabel = { auto: '自動', tap: '押すだけ', human: '本人', review: '本人が確かめる' };
export function businessMarkdown(report) {
  const lines = [`# 稼ぎ方の設計図の計画（${new Date(report.generatedAt).toISOString().slice(0, 16)}Z）`, '',
    `設計図 ${report.blueprints} 件（${Object.entries(report.byModel).map(([k, v]) => `${k} ${v}`).join('・')}）。今動かせるエージェント ${report.agents.runnable} 件、集めた紹介 ${report.agents.discovered} 件。`, '',
    '## 上位 30 件', '', '| 順 | 設計図 | 点 | 自動で回せる工程 | 本人 | 押すだけ | 確かめる | 月の費用 | 足りない能力 |', '|---|---|---|---|---|---|---|---|---|',
    ...report.top.map((p, i) => `| ${i + 1} | ${p.label} | ${p.score} | ${p.covered}/${p.steps} | ${p.human} | ${p.tap} | ${p.review} | ${p.costYen.toLocaleString('ja-JP')}円 | ${p.gaps.join('・') || 'なし'} |`), '',
    '## アカウントを作る順', '', '| 順 | アカウント | 上位 100 件のうち使う数 | 要る物 | 確かめた事実 |', '|---|---|---|---|---|',
    ...report.accounts.map((a, i) => `| ${i + 1} | ${a.label} | ${a.unlocks} | ${a.needs.join('・')} | ${(a.facts ?? []).map(f => `${f.text}（[出典](${f.source})）`).join(' ') || '登録の時に確かめる'} |`), '',
    '## Eve が作る物（確かめたエージェントが無い能力）', '', '候補は名前・説明の語で当たっただけ（外れが多い）。Eve が見本の仕事を頼んで確かめるか、包むか、新しく作る。', '',
    '| 能力 | 止まっている設計図 | 確かめる候補（今動かせる） | 包む候補（集めた紹介） |', '|---|---|---|---|',
    ...report.eve.map(e => `| ${e.label}（${e.capability}） | ${e.blocked} | ${e.runnable.map(d => d.name).slice(0, 4).join('・') || '—'} | ${e.discovered.map(d => d.name).slice(0, 4).join('・') || '—'} |`), '',
    '## 能力ごとのエージェントの数', '', '| 能力 | 確かめた | 語で当たった候補（今動かせる） | 語で当たった候補（集めた紹介） |', '|---|---|---|---|',
    ...report.coverage.map(c => `| ${c.label} | ${c.verified} | ${c.runnable} | ${c.discovered} |`), '',
    '## Noah の推し活エージェント（工程と、能力の用意）', '', ...report.oshiAgent.map((s, i) => `${i + 1}. [${kindLabel[s.kind]}] ${s.label}${s.capability ? `（${s.capability}: ${s.ready ? '確かめたエージェントあり' : 'Eve が用意する'}）` : ''}`), '',
    `## 1 位の工程（${report.plans[0]?.label ?? '—'}）`, '', ...(report.plans[0]?.steps ?? []).map((s, i) => `${i + 1}. [${kindLabel[s.kind]}] ${s.label}${s.reason ? ` — ${s.reason}` : ''}`), ''];
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: 'string' }, owned: { type: 'string' }, out: { type: 'string' }, offline: { type: 'boolean' } } });
  const origin = values.origin ?? 'https://avoado.si', out = resolve(values.out ?? 'work/noah-business');
  const owned = new Set((values.owned ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const [runnable, discovered] = values.offline ? [[], []] : await Promise.all([runnableAgents(fetch, origin), discoveredAgents(fetch, origin)]);
  const verified = JSON.parse(readFileSync(new URL('../data/noah-business-capabilities.json', import.meta.url), 'utf8')).verified ?? {};
  const report = businessReport({ runnable, discovered, verified, owned });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'plan.json'), JSON.stringify(report));
  writeFileSync(join(out, 'plan.md'), businessMarkdown(report));
  console.log(JSON.stringify({ out, blueprints: report.blueprints, runnable: runnable.length, discovered: discovered.length, top: report.top.slice(0, 5).map(p => p.label), eve: report.eve.slice(0, 5).map(e => e.capability) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(/^business_[a-z0-9_]+$/u.test(error.message) ? error.message : 'business_failed'); process.exitCode = 1; });
