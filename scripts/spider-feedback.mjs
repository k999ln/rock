#!/usr/bin/env node
/** Read-only metadata projected inside gh. Log and secret-alert APIs are not called. */
import { spawnSync } from 'node:child_process';
import { constants, lstatSync, mkdirSync, openSync, closeSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'k999ln/rock';
export const REFS = ['main', 'codex/spider-guard'];
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const WORKFLOWS = ['spider.yml', 'spider-codeql.yml'];
const SHA = /^[0-9a-f]{40}$/;
const CREDENTIAL = /(?:gh[pousr]_|github_pat_|glpat[-_]|xox[baprs]-|sk[-_]|AKIA|ASIA)[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{48,}/i;
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'warning', 'note', 'error']);
const RUN_STATUSES = new Set(['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested']);
const CONCLUSIONS = new Set(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure']);
const PROJECTIONS = {
  head: '{sha: .object.sha}',
  codeql: '[.[] | {number, state, rule: .rule.id, severity: (.rule.security_severity_level // .rule.severity), path: .most_recent_instance.location.path, line: .most_recent_instance.location.start_line, ref: .most_recent_instance.ref, commit: .most_recent_instance.commit_sha}]',
  dependabot: '[.[] | {number, state, rule: .security_advisory.ghsa_id, severity: .security_advisory.severity, path: .dependency.manifest_path, package: .dependency.package.name, ecosystem: .dependency.package.ecosystem, patchedVersion: .security_vulnerability.first_patched_version.identifier}]',
  runs: '{total: .total_count, runs: [.workflow_runs[] | {id, status, conclusion, head: .head_sha, branch: .head_branch}]}',
};

class FeedbackError extends Error {}
const fail = code => { throw new FeedbackError(code); };
const integer = value => Number.isSafeInteger(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => object(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');

function identifier(value, maximum = 100) {
  if (typeof value !== 'string' || !value || value.length > maximum || !/^[A-Za-z0-9@._+/-]+$/.test(value) || CREDENTIAL.test(value)) return '[redacted]';
  return value;
}

export function publicPath(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]{1,240}$/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..') || CREDENTIAL.test(value)) return '[redacted-path]';
  return value;
}

function category(path) {
  if (path === '[redacted-path]') return 'unknown';
  if (/(^|\/)(vendor|third_party|third-party|node_modules)(\/|$)/.test(path)) return 'vendor';
  if (/(^|\/)(tests?|__tests__|fixtures?)(\/|$)|(^|\/)test_[^/]+|\.(test|spec)\.[^/]+$/.test(path)) return 'test';
  if (/^(docs|data)\//.test(path)) return 'documentation_or_data';
  return 'source';
}

/** Projection occurs inside gh before stdout reaches this process. No shell or candidate code. */
export function githubRequest(endpoint, projection, { binary = 'gh', environment = process.env, execute = spawnSync } = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'XDG_CONFIG_HOME', 'GH_CONFIG_DIR', 'GH_TOKEN', 'GITHUB_TOKEN', 'SystemRoot']) {
    if (environment[key]) env[key] = environment[key];
  }
  Object.assign(env, { GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat', NO_COLOR: '1' });
  const cursorPagination = endpoint.startsWith(`repos/${REPOSITORY}/dependabot/alerts?`);
  const result = execute(binary, ['api', '--hostname', 'github.com', '--method', 'GET', endpoint,
    ...(cursorPagination ? ['--include'] : []),
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', '--jq', projection],
  { cwd: tmpdir(), env, shell: false, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0 || result.signal) fail('GITHUB_REQUEST_FAILED');
  try {
    if (!cursorPagination) return JSON.parse(result.stdout);
    const split = result.stdout.search(/\r?\n\r?\n/);
    if (split < 0 || split > 32_768) fail('PAGINATION_HEADER_INVALID');
    const headers = result.stdout.slice(0, split);
    const rows = JSON.parse(result.stdout.slice(split).trim());
    if (!/^HTTP\/\S+ 200(?: |$)/.test(headers) || !Array.isArray(rows)) fail('PAGINATION_HEADER_INVALID');
    const link = headers.match(/^link:\s*(.+)$/mi)?.[1] ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    let cursor = null;
    if (next) {
      const url = new URL(next[1]);
      cursor = url.searchParams.get('after');
      if (url.origin !== 'https://api.github.com' || url.pathname !== `/repos/${REPOSITORY}/dependabot/alerts` || url.username || url.password || url.hash || !cursor || !/^[A-Za-z0-9_+=/-]{1,512}$/.test(cursor)) fail('PAGINATION_HEADER_INVALID');
    } else if (/rel="next"/.test(link)) fail('PAGINATION_HEADER_INVALID');
    Object.defineProperty(rows, 'nextCursor', { value: cursor });
    return rows;
  } catch (error) { if (error instanceof FeedbackError) throw error; fail('GITHUB_RESPONSE_INVALID'); }
}

function normalizeAlert(row, kind, ref) {
  const common = ['number', 'state', 'rule', 'severity', 'path'];
  const fields = kind === 'codeql' ? [...common, 'line', 'ref', 'commit'] : [...common, 'package', 'ecosystem', 'patchedVersion'];
  if (!keys(row, fields) || !integer(row.number) || row.state !== 'open' || typeof row.rule !== 'string' || typeof row.path !== 'string' || !SEVERITIES.has(row.severity)) fail('ALERT_SCHEMA_INVALID');
  const path = publicPath(row.path);
  const classification = category(path);
  const item = {
    id: `${kind}:${row.number}`, source: kind, number: row.number, severity: row.severity,
    rule: identifier(row.rule), path, category: classification,
    status: classification === 'source' ? 'actionable' : 'review',
    url: `https://github.com/${REPOSITORY}/security/${kind === 'codeql' ? 'code-scanning' : 'dependabot'}/${row.number}`,
  };
  if (kind === 'codeql') {
    if (!integer(row.line) || row.line > 2147483647 || row.ref !== `refs/heads/${ref}` || typeof row.commit !== 'string' || !SHA.test(row.commit)) fail('ALERT_SCOPE_INVALID');
    Object.assign(item, { line: row.line, analyzedCommit: row.commit, ref: row.ref });
  } else {
    if (typeof row.package !== 'string' || typeof row.ecosystem !== 'string' || (row.patchedVersion !== null && typeof row.patchedVersion !== 'string')) fail('ALERT_SCHEMA_INVALID');
    Object.assign(item, { package: identifier(row.package), ecosystem: identifier(row.ecosystem), patchedVersion: row.patchedVersion === null ? null : identifier(row.patchedVersion, 80), scope: 'repository_default_branch' });
    if (row.patchedVersion === null) item.status = 'awaiting_upstream';
  }
  return item;
}

function errorCode(error) {
  return error instanceof FeedbackError ? error.message : 'GITHUB_REQUEST_FAILED';
}

function collectAlerts(kind, ref, request) {
  const items = [];
  const ids = new Set();
  let pages = 0;
  let cursor = null;
  const cursors = new Set();
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const parameters = new URLSearchParams({ state: 'open', per_page: String(PAGE_SIZE) });
      if (kind === 'codeql') { parameters.set('page', String(page)); parameters.set('ref', `refs/heads/${ref}`); parameters.set('tool_name', 'CodeQL'); }
      else if (cursor) parameters.set('after', cursor);
      const endpoint = `repos/${REPOSITORY}/${kind === 'codeql' ? 'code-scanning' : 'dependabot'}/alerts?${parameters}`;
      const response = request(endpoint, PROJECTIONS[kind]);
      if (!Array.isArray(response) || response.length > PAGE_SIZE) fail('ALERT_PAGE_INVALID');
      pages++;
      for (const row of response) {
        const item = normalizeAlert(row, kind, ref);
        if (ids.has(item.id)) fail('ALERT_PAGINATION_CHANGED');
        ids.add(item.id);
        items.push(item);
      }
      if (kind === 'dependabot') {
        cursor = response.nextCursor;
        if (cursor == null) {
          if (cursor === undefined && response.length === PAGE_SIZE) fail('PAGINATION_CURSOR_MISSING');
          return { status: 'complete', count: items.length, retrievedCount: items.length, pages, items };
        }
        if (typeof cursor !== 'string' || !/^[A-Za-z0-9_+=/-]{1,512}$/.test(cursor) || cursors.has(cursor)) fail('PAGINATION_HEADER_INVALID');
        cursors.add(cursor);
      } else if (response.length < PAGE_SIZE) return { status: 'complete', count: items.length, retrievedCount: items.length, pages, items };
    }
    fail('PAGINATION_LIMIT_REACHED');
  } catch (error) {
    return { status: 'incomplete', count: null, retrievedCount: items.length, pages, error: errorCode(error), items };
  }
}

function readHead(ref, request) {
  const response = request(`repos/${REPOSITORY}/git/ref/heads/${ref}`, PROJECTIONS.head);
  if (!keys(response, ['sha']) || typeof response.sha !== 'string' || !SHA.test(response.sha)) fail('HEAD_RESPONSE_INVALID');
  return response.sha;
}

function collectRun(workflow, ref, head, request) {
  try {
    const parameters = new URLSearchParams({ branch: ref, head_sha: head, per_page: '1', page: '1' });
    const response = request(`repos/${REPOSITORY}/actions/workflows/${workflow}/runs?${parameters}`, PROJECTIONS.runs);
    if (!keys(response, ['total', 'runs']) || !Number.isSafeInteger(response.total) || response.total < 0 || !Array.isArray(response.runs) || response.runs.length !== Math.min(1, response.total)) fail('WORKFLOW_RESPONSE_INVALID');
    if (response.total === 0) fail('WORKFLOW_RUN_MISSING');
    const row = response.runs[0];
    if (!keys(row, ['id', 'status', 'conclusion', 'head', 'branch']) || !integer(row.id) || !RUN_STATUSES.has(row.status) || row.head !== head || row.branch !== ref || (row.status === 'completed' ? !CONCLUSIONS.has(row.conclusion) : row.conclusion !== null)) fail('WORKFLOW_SCOPE_INVALID');
    return { status: 'complete', workflow, run: { id: row.id, status: row.status, conclusion: row.conclusion, head, url: `https://github.com/${REPOSITORY}/actions/runs/${row.id}` } };
  } catch (error) { return { status: 'incomplete', workflow, error: errorCode(error), run: null }; }
}

export function collectFeedback({ ref = 'codex/spider-guard', request = githubRequest, now = () => new Date() } = {}) {
  if (!REFS.includes(ref)) fail('REF_NOT_ALLOWED');
  const report = {
    schemaVersion: 1, repository: REPOSITORY, ref, collectedAt: now().toISOString(), targetHead: null,
    status: 'incomplete', currentChecksComplete: false, counts: null, sources: {}, workflows: [], items: [],
    limitations: [
      'This is a read-only metadata work queue, not an automatic fix, dismissal, merge, or proof of security.',
      'CodeQL alerts are scoped to the selected branch; Dependabot alerts describe the repository default branch.',
      'Routing is a review hint. Tests and vendor code still require review; no upstream fix is inferred from a path.',
      'Each alert source is bounded to 10 pages of 100. Failure, missing analysis, or the page limit cannot mean zero alerts.',
      'Only the latest run of each SPIDER workflow at the resolved branch HEAD is collected; run success is not zero findings.',
      'Alert lists are a live API view, not an atomic snapshot. No alert prose, source snippets, run logs, secret alerts, or credentials are stored.',
    ],
  };
  try { report.targetHead = readHead(ref, request); }
  catch (error) { report.error = errorCode(error); return report; }
  for (const kind of ['codeql', 'dependabot']) {
    const { items, ...source } = collectAlerts(kind, ref, request);
    report.sources[kind] = source;
    report.items.push(...items);
  }
  report.workflows = WORKFLOWS.map(workflow => collectRun(workflow, ref, report.targetHead, request));
  try { if (readHead(ref, request) !== report.targetHead) fail('BRANCH_CHANGED_DURING_COLLECTION'); }
  catch (error) { report.error = errorCode(error); }
  if (!report.error && Object.values(report.sources).every(source => source.status === 'complete') && report.workflows.every(workflow => workflow.status === 'complete')) {
    report.status = 'complete';
    report.counts = { total: report.items.length, actionable: 0, review: 0, awaiting_upstream: 0 };
    for (const item of report.items) report.counts[item.status]++;
  }
  report.currentChecksComplete = report.status === 'complete' && report.workflows.every(workflow => workflow.run.status === 'completed' && workflow.run.conclusion === 'success');
  const rank = { critical: 0, high: 1, medium: 2, error: 3, warning: 4, low: 5, note: 6 };
  report.items.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
  return report;
}

export function markdown(report) {
  const lines = ['# SPIDER security feedback', '', `Repository: \`${REPOSITORY}\` / branch: \`${report.ref}\``,
    `Target HEAD: \`${report.targetHead ?? 'unavailable'}\``, `Collection: **${report.status}** / current checks successful: **${report.currentChecksComplete}**`,
    `Collected at: ${report.collectedAt}`, '',
    report.counts ? `Open alerts: ${report.counts.total}; actionable ${report.counts.actionable}, review ${report.counts.review}, awaiting upstream ${report.counts.awaiting_upstream}.` : 'Total open alerts: unknown. The metadata below may be partial; do not interpret this as zero alerts.', ''];
  if (report.error) lines.push(`Collection error: \`${report.error}\``, '');
  for (const [kind, source] of Object.entries(report.sources)) lines.push(`- ${kind}: ${source.status}; retrieved ${source.retrievedCount}; pages ${source.pages}${source.error ? `; ${source.error}` : ''}`);
  lines.push('', '## Current workflow runs', '');
  for (const workflow of report.workflows) lines.push(workflow.run ? `- ${workflow.workflow}: [run ${workflow.run.id}](${workflow.run.url}) — ${workflow.run.status} / ${workflow.run.conclusion ?? 'pending'}` : `- ${workflow.workflow}: unavailable (${workflow.error})`);
  lines.push('', '## Review queue', '', '| Alert | Severity | Routing | Rule | Location |', '| --- | --- | --- | --- | --- |');
  for (const item of report.items) lines.push(`| [${item.id}](${item.url}) | ${item.severity} | ${item.status} | ${item.rule} | ${item.path}${item.line ? `:${item.line}` : ''} |`);
  lines.push('', 'For each item: inspect the actual source and alert on GitHub, establish the cause, patch on a review branch, run relevant tests, rescan, and open or update a PR. Do not dismiss alerts or merge based on this queue alone.', '', '## Scope and limits', '', ...report.limitations.map(line => `- ${line}`), '');
  return lines.join('\n');
}

function writePrivate(directory, name, text) {
  const target = join(directory, name);
  try { if (!lstatSync(target).isFile() || lstatSync(target).nlink !== 1) fail('OUTPUT_UNSAFE'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = join(directory, `.spider-feedback-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(descriptor, text, 'utf8');
    closeSync(descriptor); descriptor = undefined;
    renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export function publish(report, output) {
  const directory = resolve(output);
  for (let current = directory; ; current = dirname(current)) {
    try { if (lstatSync(current).isSymbolicLink()) fail('OUTPUT_UNSAFE'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(current) === current) break;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writePrivate(directory, 'report.json', JSON.stringify(report, null, 2) + '\n');
  writePrivate(directory, 'queue.md', markdown(report));
}

export function main(args = process.argv.slice(2)) {
  try {
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index];
      if (!['--ref', '--output', '--repo'].includes(name) || !args[index + 1] || options[name] !== undefined) fail('ARGUMENTS_INVALID');
      options[name] = args[index + 1];
    }
    if (!options['--output'] || (options['--repo'] && options['--repo'] !== REPOSITORY)) fail('ARGUMENTS_INVALID');
    const report = collectFeedback({ ref: options['--ref'] ?? 'codex/spider-guard' });
    publish(report, options['--output']);
    console.log(`SPIDER feedback: ${report.status}; ${report.counts ? `${report.counts.total} open alerts` : 'alert total unknown'}.`);
    return report.status === 'complete' ? 0 : 2;
  } catch (error) { console.error(`SPIDER feedback: ${error instanceof FeedbackError ? error.message : 'COLLECTION_OR_OUTPUT_FAILED'}.`); return 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
