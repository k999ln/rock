#!/usr/bin/env node
// X・Reddit・Bluesky で紹介された Agent のリンクを、Noah の「新しく見つかったAgent」へ載せる（task 121）。
// 本人の指示（2026-11-22）「Twitter とか Reddit 読むとかそういう系は Codex にやらせて」。読むのは運営の Codex。この CLI は、Codex が書いたファイルを受け取って掲載する口。
// 決まり: 投稿の本文は受け取らない・載せない（決まった説明文・投稿の URL・配布元の URL・数だけ）。投稿者の名前は X・Bluesky の @handle、Reddit は板（r/...）だけ。
// task 125（本人 2026-11-22「ブラウザつかって読んで、ちゃんと読んだもの正しく理解して」）: Codex の Luna Max が、投稿・引用元・配布元（README・公式の頁）まで読んで
// 日本語で書いた理解（understanding）を、もう 1 つの出所「Noahが読んだ」（noah-read）として載せる。理解は運営の文で、投稿の本文の写しではない。
// 1 枚のカードの説明には、この理解が先に出る（lib/noah-collection.ts の noahCollectionCards）。
// 期限は X が 1 日、Reddit・Bluesky が 3 日（lib/noah-collection.ts）。掲載は出所ごとの置き換えなので、手元の状態ファイルに期限内の紹介を残し、毎回まとめて送る。
//
// 使い方（運営の Mac。鍵は権限 600 の設定ファイルから環境変数で渡す。チャットやGitには書かない）:
//   NOAH_COLLECTION_KEY=... node --experimental-strip-types scripts/noah-collector-social.mjs --file leads.json --dir work/noah-social --publish https://avoado.si
//   --dry-run: 形を確かめて、載せる件数だけを表示（送らない）。
// leads.json: { "leads": [ { "source": "reddit", "post": "https://www.reddit.com/r/mcp/comments/abc123/title/", "project": "https://github.com/owner/repo",
//   "author": "r/mcp", "postedAt": "2026-11-22T01:23:45Z", "metrics": { "upvotes": 120, "comments": 14 },
//   "understanding": { "name": "Switch", "summary": "（日本語で、何をする物か・誰向けか・どう動かすか・費用と使用条件の注意）", "maker": "SandboxAQ",
//     "page": "https://github.com/sandbox-quantum/switch", "run": "mac" } } ] }
//   understanding は無くてもよい。有る時は、summary に日本語が要る（500 字まで）。run は space・key・mac のどれか（スマホで今すぐは、Noah の一覧に入った物だけが持つ）。
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { NOAH_COLLECTION_LIMITS, NOAH_COLLECTION_METRICS, NOAH_COLLECTION_SOCIAL, NOAH_COLLECTION_SOCIAL_SUMMARY, collectionMaxAge, collectionUrl, parseCollectionSnapshot } from '../lib/noah-collection.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { projectUrl } from './noah-collector-feeds.mjs';
import { publishCollection } from './noah-collector-publish.mjs';
import { writeCollectorJson } from './noah-collector-store.mjs';

const POST = {
  x: /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:[/?#].*)?$/u,
  reddit: /^https:\/\/(?:www\.|old\.)?reddit\.com\/r\/([A-Za-z0-9_]{2,21})\/comments\/([a-z0-9]{1,12})(?:\/([A-Za-z0-9_-]{0,120}))?\/?(?:[?#].*)?$/u,
  bluesky: /^https:\/\/bsky\.app\/profile\/([A-Za-z0-9.:-]{3,253})\/post\/([a-z0-9]{10,16})(?:[?#].*)?$/u,
};
/** Codex が書いた 1 件を、紹介の形にする。形の違う物は、理由の符号を返す（本文や URL はログに出さない）。 */
export function socialLead(raw, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'shape' };
  const source = raw.source;
  if (!NOAH_COLLECTION_SOCIAL.includes(source)) return { error: 'source' };
  const match = typeof raw.post === 'string' ? POST[source].exec(raw.post) : null;
  if (!match) return { error: 'post' };
  const project = typeof raw.project === 'string' ? projectUrl(raw.project) : null;
  if (!project || /^https:\/\/(?:x|twitter|www\.reddit|reddit|bsky)\./u.test(project)) return { error: 'project' };
  const postedAt = Date.parse(raw.postedAt ?? '');
  if (!Number.isFinite(postedAt) || postedAt > now + 120_000) return { error: 'posted_at' };
  if (postedAt + collectionMaxAge(source) <= now) return { error: 'too_old' };
  const author = source === 'reddit' ? `r/${match[1]}` : source === 'x' ? `@${match[1]}` : `@${match[1]}`;
  const sourceUrl = source === 'x' ? `https://x.com/${match[1]}/status/${match[2]}` : source === 'reddit' ? `https://www.reddit.com/r/${match[1]}/comments/${match[2]}/${match[3] ? `${match[3]}/` : ''}` : `https://bsky.app/profile/${match[1]}/post/${match[2]}`;
  const metrics = {};
  if (raw.metrics !== undefined) {
    if (!raw.metrics || typeof raw.metrics !== 'object' || Array.isArray(raw.metrics)) return { error: 'metrics' };
    for (const [key, value] of Object.entries(raw.metrics)) {
      if (!NOAH_COLLECTION_METRICS[source].includes(key) || !Number.isSafeInteger(value) || value < 0) return { error: 'metrics' };
      metrics[key] = value;
    }
  }
  const name = project.startsWith('https://github.com/') || project.startsWith('https://huggingface.co/spaces/') ? project.split('/').slice(-2).join('/') : new URL(project).hostname + new URL(project).pathname.replace(/\/$/u, '');
  const item = { id: `${source}:${match[2]}:${project}`.slice(0, 320), source, name: name.slice(0, 200), summary: NOAH_COLLECTION_SOCIAL_SUMMARY[source], author, url: project, sourceUrl,
    observedAt: now, expiresAt: Math.min(now, postedAt) + collectionMaxAge(source), createdAt: postedAt, ...(Object.keys(metrics).length ? { metrics } : {}) };
  try { parseCollectionSnapshot({ schema: 'noah-collection/1', source, collectedAt: now, items: [item] }, now); } catch { return { error: 'contract' }; }
  if (raw.understanding === undefined) return { item };
  const read = understood(raw.understanding, { project, postedAt, now });
  return read.error ? { error: read.error } : { item, read: read.item };
}

const JAPANESE = /[぀-ヿ㐀-鿿]/u;
const READ_RUNS = ['space', 'key', 'mac'];
/** Codex が配布元まで読んで書いた理解を、「Noahが読んだ」の紹介にする。1 つの配布元に 1 件（新しい理解で置き換え）。 */
function understood(raw, { project, postedAt, now }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'understanding' };
  const name = typeof raw.name === 'string' ? raw.name.trim() : '', summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const maker = typeof raw.maker === 'string' ? raw.maker.trim() : '';
  if (!name || name.length > 200 || !summary || summary.length > 500 || !JAPANESE.test(summary) || maker.length > 200) return { error: 'understanding' };
  if ([name, summary, maker].some(value => looksLikeNoahSecret(value))) return { error: 'understanding' };
  if (raw.run !== undefined && !READ_RUNS.includes(raw.run)) return { error: 'understanding_run' };
  let page;
  try { page = collectionUrl(raw.page); } catch { return { error: 'understanding_page' }; }
  const author = maker || (project.startsWith('https://github.com/') ? project.split('/')[3] : new URL(project).hostname);
  const item = { id: `noah-read:${project}`.slice(0, 320), source: 'noah-read', name, summary, author, url: project, sourceUrl: page,
    observedAt: now, expiresAt: now + collectionMaxAge('noah-read'), createdAt: Math.min(postedAt, now), ...(raw.run ? { run: raw.run } : {}) };
  try { parseCollectionSnapshot({ schema: 'noah-collection/1', source: 'noah-read', collectedAt: now, items: [item] }, now); } catch { return { error: 'understanding_contract' }; }
  return { item };
}

/**
 * 読んだ紹介のファイル（data/noah-scout/leads.json。task 125）。Codex の Luna Max（や Claude）が読んで理解した紹介を、Git のファイルに書き、
 * クラウドの収集機（鍵は GitHub Actions の secret だけ）が毎回まとめて載せる。運営の Mac に掲載の鍵を置かなくてよい。
 * 1 件は、投稿付き（source・post・postedAt・metrics。X・Reddit・Bluesky の期限内だけ投稿のカードも出る）か、投稿なし（理解だけ）。どちらも understanding が要る。
 * foundAt（Noah が見つけた日時）から 30 日を過ぎた理解は載せない（新着の列を古い物で埋めないため）。
 */
export const NOAH_SCOUT_FILE = { maxLeads: 2000, keepMs: 30 * 86_400_000 };
export function scoutFileItems(input, now) {
  if (!input || typeof input !== 'object' || input.schema !== 'noah-scout-leads/1' || !Array.isArray(input.leads) || input.leads.length > NOAH_SCOUT_FILE.maxLeads) return { items: [], rejected: { file: 1 } };
  const items = new Map(), rejected = {};
  const reject = code => { rejected[code] = (rejected[code] ?? 0) + 1; };
  for (const raw of input.leads) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.understanding === undefined) { reject('shape'); continue; }
    const foundAt = Date.parse(raw.foundAt ?? '');
    if (!Number.isFinite(foundAt) || foundAt > now + 120_000) { reject('found_at'); continue; }
    if (foundAt + NOAH_SCOUT_FILE.keepMs <= now) { reject('too_old'); continue; }
    if (raw.post !== undefined) {
      const lead = socialLead(raw, now);
      if (lead.item) items.set(lead.item.id, lead.item);
      // 投稿だけが期限切れの時は、理解は残す（投稿のカードは X 1 日・他 3 日で消える決まりのまま）。
      if (lead.error && lead.error !== 'too_old') { reject(lead.error); continue; }
    }
    const project = typeof raw.project === 'string' ? projectUrl(raw.project) : null;
    if (!project || /^https:\/\/(?:x|twitter|www\.reddit|reddit|bsky)\./u.test(project)) { reject('project'); continue; }
    const read = understood(raw.understanding, { project, postedAt: foundAt, now });
    if (read.error) { reject(read.error); continue; }
    items.set(read.item.id, read.item);
  }
  return { items: [...items.values()], rejected };
}
/** リポジトリの読んだ紹介のファイルを読む。無い時は空（その出所のスナップショットを送らない＝上書きしない）。 */
export function readScoutFile(path, now) {
  if (!existsSync(path)) return { items: [], rejected: {} };
  try { return scoutFileItems(JSON.parse(readFileSync(path, 'utf8')), now); } catch { return { items: [], rejected: { file: 1 } }; }
}

/** 期限内の紹介を、手元の状態とまとめる（同じ投稿・同じ配布元は、新しい数で置き換え）。出所ごとに、新しい投稿から 500 件まで。「Noahが読んだ」も同じ形。 */
export const SOCIAL_SNAPSHOT_SOURCES = [...NOAH_COLLECTION_SOCIAL, 'noah-read'];
export function mergeSocial(previous, incoming, now) {
  const all = new Map(previous.filter(item => item.expiresAt > now).map(item => [item.id, item]));
  for (const item of incoming) all.set(item.id, { ...item, observedAt: now });
  return SOCIAL_SNAPSHOT_SOURCES.map(source => ({ schema: 'noah-collection/1', source, collectedAt: now,
    items: [...all.values()].filter(item => item.source === source).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, NOAH_COLLECTION_LIMITS.items) }));
}

export async function runSocial({ file, directory, publish, key, dryRun = false, fetcher = fetch, now = Date.now }) {
  const at = now(), input = JSON.parse(readFileSync(file, 'utf8'));
  if (!input || !Array.isArray(input.leads) || input.leads.length > 5000) throw Error('social_input');
  const results = input.leads.map(raw => socialLead(raw, at));
  const rejected = {};
  for (const result of results) if (result.error) rejected[result.error] = (rejected[result.error] ?? 0) + 1;
  const statePath = join(directory, 'social.json');
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).items ?? [] : [];
  // 送る前に、出所の期限（X 1 日・他 3 日）を、今の時刻で確かめ直す。
  const snapshots = mergeSocial(previous, results.flatMap(result => [result.item, result.read].filter(Boolean)), at)
    .filter(snapshot => snapshot.items.length || previous.some(item => item.source === snapshot.source));
  const counts = Object.fromEntries(snapshots.map(snapshot => [snapshot.source, snapshot.items.length]));
  if (dryRun) return { accepted: results.length - Object.values(rejected).reduce((a, b) => a + b, 0), rejected, counts, published: [] };
  const published = await publishCollection({ snapshots, origin: publish, key, fetcher, now });
  writeCollectorJson(statePath, { schema: 'noah-social-state/1', updatedAt: at, items: snapshots.flatMap(snapshot => snapshot.items) });
  return { accepted: results.length - Object.values(rejected).reduce((a, b) => a + b, 0), rejected, counts, published };
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: 'string' }, dir: { type: 'string' }, publish: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  if (!values.file || !values.dir || (!values.publish && !values['dry-run'])) throw Error('social_arguments');
  const result = await runSocial({ file: resolve(values.file), directory: resolve(values.dir), publish: values.publish, key: process.env.NOAH_COLLECTION_KEY, dryRun: !!values['dry-run'] });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  console.error(/^(social_|collector_publish_)[a-z0-9_]+$/u.test(error.message) ? error.message : 'social_failed'); process.exitCode = 1;
});
