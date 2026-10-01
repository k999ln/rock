// Collect public metadata for human review. Never execute discovered code.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const intervalArg = args.find((arg) => arg.startsWith('--interval='));
const intervalSeconds = intervalArg ? Number(intervalArg.slice('--interval='.length)) : 21600;
const query = args.filter((arg) => arg !== '--watch' && !arg.startsWith('--interval=')).join(' ').trim() || 'automation';

if (args.includes('--help')) {
  console.log('Usage: npm run discover -- [--watch] [--interval=seconds] [search words]');
  console.log('Queries public GitHub repositories and Hugging Face models, and optionally approved Product Hunt metadata.');
  console.log('All results are review-only and saved to data/discovered.json.');
  process.exit(0);
}
if (!Number.isFinite(intervalSeconds) || intervalSeconds < 60) throw new Error('--interval は60秒以上で指定してください。');
if (query.length > 200) throw new Error('検索語は200文字以内にしてください。');

const root = fileURLToPath(new URL('../', import.meta.url));
const outputPath = resolve(root, 'data/discovered.json');

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Rock-Star-discovery/0.1', ...headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}${response.status === 403 || response.status === 429 ? ' (rate limit or access restriction)' : ''}`);
  return response.json();
}

function reviewRecord(record) {
  return { ...record, reviewStatus: 'pending', executionEnabled: false };
}

const jobs = [
  {
    source: 'github',
    async run() {
      const url = new URL('https://api.github.com/search/repositories');
      url.searchParams.set('q', `${query} archived:false`);
      url.searchParams.set('sort', 'updated');
      url.searchParams.set('per_page', '12');
      const data = await getJson(url, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
      if (!Array.isArray(data.items)) throw new Error('Unexpected GitHub response');
      return data.items.map((record) => reviewRecord({
        source: 'github', id: record.full_name, name: record.name, description: record.description || '',
        url: record.html_url, license: record.license?.spdx_id || 'REVIEW_REQUIRED', updatedAt: record.updated_at,
      }));
    },
  },
  {
    source: 'huggingface',
    async run() {
      const url = new URL('https://huggingface.co/api/models');
      url.searchParams.set('search', query);
      url.searchParams.set('limit', '12');
      url.searchParams.set('sort', 'lastModified');
      url.searchParams.set('direction', '-1');
      const data = await getJson(url);
      if (!Array.isArray(data)) throw new Error('Unexpected Hugging Face response');
      return data.map((record) => reviewRecord({
        source: 'huggingface', id: record.id, name: record.id, description: record.pipeline_tag || '',
        url: `https://huggingface.co/${record.id}`, license: 'REVIEW_MODEL_CARD', updatedAt: record.lastModified || null,
      }));
    },
  },
];

function productHuntEnabled() {
  return Boolean(process.env.PRODUCT_HUNT_ACCESS_TOKEN) && process.env.PRODUCT_HUNT_BUSINESS_APPROVED === 'true';
}

if (productHuntEnabled()) {
  jobs.push({
    source: 'producthunt',
    async run() {
      const response = await fetch('https://api.producthunt.com/v2/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PRODUCT_HUNT_ACCESS_TOKEN}`,
          'User-Agent': 'Rock-Star-discovery/0.1',
        },
        body: JSON.stringify({ query: '{ posts(first: 50) { edges { node { id name tagline url website createdAt } } } }' }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
      const posts = payload.data?.posts?.edges?.map((edge) => edge.node).filter(Boolean);
      if (!Array.isArray(posts)) throw new Error('Unexpected Product Hunt response');
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return posts
        .filter((post) => terms.length === 0 || terms.some((term) => `${post.name} ${post.tagline || ''}`.toLowerCase().includes(term)))
        .map((post) => reviewRecord({
          source: 'producthunt', id: String(post.id), name: post.name, description: post.tagline || '',
          url: post.url, websiteUrl: post.website || null, updatedAt: post.createdAt || null,
          license: 'REVIEW_PRODUCT_HUNT_TERMS',
        }));
    },
  });
}

async function readExisting() {
  try {
    const existing = JSON.parse(await readFile(outputPath, 'utf8'));
    return Array.isArray(existing.records) ? existing.records : [];
  } catch {
    return [];
  }
}

async function collect() {
  const results = await Promise.allSettled(jobs.map((job) => job.run()));
  const records = [];
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') records.push(...result.value);
    else failures.push({ source: jobs[index].source, error: result.reason instanceof Error ? result.reason.message : 'Unknown error' });
  });

  const merged = new Map((await readExisting()).map((record) => [`${record.source}:${record.id}`, record]));
  records.forEach((record) => merged.set(`${record.source}:${record.id}`, record));
  const report = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    query,
    mode: 'review-only',
    productHunt: productHuntEnabled() ? 'enabled-with-approved-token' : 'disabled-pending-commercial-permission',
    records: [...merged.values()].slice(-500),
    failures,
  };
  await mkdir(resolve(root, 'data'), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`);
  await rename(tempPath, outputPath);
  console.log(`${records.length} fresh candidates collected; ${report.records.length} review records retained; ${failures.length} sources failed. No tools were executed or published.`);
  for (const failure of failures) console.error(`${failure.source}: ${failure.error}`);
  return failures.length === 0;
}

let success = await collect();
if (watch) {
  console.log(`Watching discovery sources every ${intervalSeconds} seconds. Press Ctrl+C to stop.`);
  while (true) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalSeconds * 1000));
    success = (await collect()) && success;
  }
}
if (!success) process.exitCode = 1;
