import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, symlinkSync, existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectFeedback, githubRequest, markdown, publicPath, publish } from '../scripts/spider-feedback.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const REF = 'codex/spider-guard';
const codeql = (number = 1, overrides = {}) => ({ number, state: 'open', rule: 'js/xss-through-dom', severity: 'high', path: 'lib/security.ts', line: 17, ref: `refs/heads/${REF}`, commit: HEAD, ...overrides });
const dependency = (number = 1, overrides = {}) => ({ number, state: 'open', rule: 'GHSA-xxxx-yyyy-zzzz', severity: 'medium', path: 'package-lock.json', package: '@scope/example', ecosystem: 'npm', patchedVersion: '1.2.3', ...overrides });

function fixture({ alerts = [], dependencies = [], runs, head = HEAD, requestHook } = {}) {
  const calls = [];
  return { calls, request(endpoint, projection) {
    calls.push({ endpoint, projection });
    const override = requestHook?.(endpoint, projection, calls);
    if (override !== undefined) return override;
    if (endpoint.includes('/git/ref/')) return { sha: head };
    if (endpoint.includes('/code-scanning/')) return alerts;
    if (endpoint.includes('/dependabot/')) return dependencies;
    if (endpoint.includes('/actions/workflows/')) return runs ?? { total: 1, runs: [{ id: 123, status: 'completed', conclusion: 'success', head, branch: REF }] };
    throw new Error('unexpected endpoint');
  } };
}

test('collects bounded metadata, keeps stable alert IDs and scopes current-head evidence', () => {
  const transport = fixture({ alerts: [codeql(4), codeql(2, { path: 'tests/xss.test.ts' }), codeql(3, { path: 'vendor/mr/src/parser.py' })], dependencies: [dependency(5), dependency(6, { patchedVersion: null })] });
  const report = collectFeedback({ request: transport.request, now: () => new Date('2026-10-03T00:00:00Z') });
  assert.equal(report.status, 'complete');
  assert.equal(report.currentChecksComplete, true);
  assert.equal(report.targetHead, HEAD);
  assert.deepEqual(report.counts, { total: 5, actionable: 2, review: 2, awaiting_upstream: 1 });
  assert.equal(report.items.find(item => item.id === 'codeql:3').status, 'review');
  assert.equal(report.items.find(item => item.id === 'dependabot:5').scope, 'repository_default_branch');
  assert.match(report.items[0].url, /^https:\/\/github.com\/k999ln\/rock\/security\/code-scanning\/\d+$/);
  assert.equal(transport.calls.filter(call => call.endpoint.includes('/git/ref/')).length, 2);
  for (const call of transport.calls) {
    assert.match(call.endpoint, /^repos\/k999ln\/rock\//);
    assert.doesNotMatch(call.endpoint, /secret-scanning|\/logs|\/artifacts|\/contents/);
    assert.doesNotMatch(call.projection, /description|summary|message|snippet|secret|body|title|author/);
    if (call.endpoint.includes('/actions/')) assert.match(call.endpoint, new RegExp(`head_sha=${HEAD}`));
    if (call.endpoint.includes('/code-scanning/')) assert.match(call.endpoint, /ref=refs%2Fheads%2Fcodex%2Fspider-guard/);
  }
  assert.match(markdown(report), /Tests and vendor code still require review/);
});

test('untrusted metadata cannot inject Markdown, commands, credential values or URLs', () => {
  const secret = 'gh' + 'p_' + 'A1b2'.repeat(9);
  const malicious = '![instructions](https://evil.invalid)\n::error::run code';
  const transport = fixture({ alerts: [codeql(2, { rule: malicious, path: `src/${secret}.ts` }), codeql(3, { path: '../outside.ts' })], dependencies: [dependency(4, { package: malicious, patchedVersion: '$(touch marker)' })] });
  const report = collectFeedback({ request: transport.request });
  assert.equal(report.status, 'complete');
  const serialized = JSON.stringify(report) + markdown(report);
  for (const forbidden of [secret, malicious, 'evil.invalid', 'touch marker', '../outside']) assert(!serialized.includes(forbidden));
  assert.equal(report.items.find(item => item.id === 'codeql:2').path, '[redacted-path]');
  assert.equal(report.items.find(item => item.id === 'dependabot:4').patchedVersion, '[redacted]');
  for (const path of ['/absolute', 'a//b', 'a/./b', 'a/../b', 'a\\b', '日本語.py', 'a\nb.py', 'a'.repeat(241)]) assert.equal(publicPath(path), '[redacted-path]');
});

test('retrieval failure and malformed or wrong-ref alerts preserve unknown totals and partial evidence', () => {
  for (const bad of [null, {}, [codeql(1, { ref: 'refs/heads/main' })], [codeql(1, { commit: null })], [codeql(1, { number: -1 })], [codeql(1, { line: true })], [codeql(1, { state: 'dismissed' })], [codeql(1, { extra: 'private detail' })], [codeql(1, { severity: 'unknown' })]]) {
    const transport = fixture({ requestHook: endpoint => endpoint.includes('/code-scanning/') ? bad : undefined });
    const report = collectFeedback({ request: transport.request });
    assert.equal(report.status, 'incomplete');
    assert.equal(report.counts, null);
    assert.equal(report.sources.codeql.count, null);
    assert.equal(report.currentChecksComplete, false);
  }
  const transport = fixture({ requestHook: endpoint => { if (endpoint.includes('/dependabot/')) throw new Error('private auth or source detail'); } });
  const report = collectFeedback({ request: transport.request });
  assert.equal(report.sources.dependabot.error, 'GITHUB_REQUEST_FAILED');
  assert(!JSON.stringify(report).includes('private auth'));
  assert.match(markdown(report), /Total open alerts: unknown/);
});

test('pagination is bounded, complete across pages, and refuses duplicate or truncated snapshots', () => {
  const requestHook = endpoint => {
    if (!endpoint.includes('/code-scanning/')) return undefined;
    const page = Number(new URL(`https://api.github.com/${endpoint}`).searchParams.get('page'));
    return page < 3 ? Array.from({ length: 100 }, (_, index) => codeql((page - 1) * 100 + index + 1)) : [];
  };
  const complete = collectFeedback({ request: fixture({ requestHook }).request });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.sources.codeql.pages, 3);
  assert.equal(complete.counts.total, 200);
  const boundedTransport = fixture({ requestHook: endpoint => {
    if (!endpoint.includes('/code-scanning/')) return undefined;
    const page = Number(new URL(`https://api.github.com/${endpoint}`).searchParams.get('page'));
    return Array.from({ length: 100 }, (_, index) => codeql((page - 1) * 100 + index + 1));
  } });
  const bounded = collectFeedback({ request: boundedTransport.request });
  assert.equal(bounded.status, 'incomplete');
  assert.equal(bounded.sources.codeql.error, 'PAGINATION_LIMIT_REACHED');
  assert.equal(bounded.sources.codeql.retrievedCount, 1000);
  assert.equal(bounded.sources.codeql.count, null);
  assert.equal(boundedTransport.calls.filter(call => call.endpoint.includes('/code-scanning/')).length, 10);
  const duplicate = collectFeedback({ request: fixture({ alerts: Array.from({ length: 100 }, (_, index) => codeql(index + 1)) }).request });
  assert.equal(duplicate.sources.codeql.error, 'ALERT_PAGINATION_CHANGED');
});

test('missing, stale, pending and failed runs do not imply current analysis success', () => {
  for (const runs of [ { total: 0, runs: [] }, { total: 1, runs: [{ id: 1, status: 'completed', conclusion: 'success', head: OLD, branch: REF }] }, { total: 1, runs: [] } ]) {
    const report = collectFeedback({ request: fixture({ runs }).request });
    assert.equal(report.status, 'incomplete');
    assert.equal(report.currentChecksComplete, false);
    assert.equal(report.counts, null);
  }
  for (const [status, conclusion] of [['in_progress', null], ['completed', 'failure'], ['completed', 'cancelled']]) {
    const report = collectFeedback({ request: fixture({ runs: { total: 1, runs: [{ id: 1, status, conclusion, head: HEAD, branch: REF }] } }).request });
    assert.equal(report.status, 'complete');
    assert.equal(report.currentChecksComplete, false);
    assert.equal(report.workflows[0].run.conclusion, conclusion);
  }
});

test('Dependabot follows bounded opaque cursors, never obsolete page parameters or external next URLs', () => {
  const transport = fixture({ requestHook: endpoint => {
    if (!endpoint.includes('/dependabot/')) return undefined;
    const url = new URL(`https://api.github.com/${endpoint}`);
    assert.equal(url.searchParams.has('page'), false);
    const second = url.searchParams.get('after') === 'opaque-cursor';
    const rows = [dependency(second ? 2 : 1)];
    Object.defineProperty(rows, 'nextCursor', { value: second ? null : 'opaque-cursor' });
    return rows;
  } });
  const report = collectFeedback({ request: transport.request });
  assert.equal(report.status, 'complete');
  assert.equal(report.sources.dependabot.pages, 2);
  assert.equal(report.sources.dependabot.count, 2);
  const endpoint = 'repos/k999ln/rock/dependabot/alerts?state=open&per_page=100';
  let actualArgs;
  const rows = githubRequest(endpoint, 'projection', { execute: (_binary, args) => {
    actualArgs = args;
    return { status: 0, stdout: 'HTTP/2.0 200 OK\r\nLink: <https://api.github.com/repos/k999ln/rock/dependabot/alerts?after=opaque-cursor>; rel="next"\r\n\r\n[]' };
  } });
  assert(actualArgs.includes('--include'));
  assert.equal(rows.nextCursor, 'opaque-cursor');
  assert.throws(() => githubRequest(endpoint, 'projection', { execute: () => ({ status: 0, stdout: 'HTTP/2.0 200 OK\nLink: <https://evil.invalid/?after=token>; rel="next"\n\n[]' }) }), /PAGINATION_HEADER_INVALID/);
  const endless = collectFeedback({ request: fixture({ requestHook: url => {
    if (!url.includes('/dependabot/')) return undefined;
    const cursor = new URL(`https://api.github.com/${url}`).searchParams.get('after');
    const index = cursor ? Number(cursor) + 1 : 1;
    const page = [dependency(index)];
    Object.defineProperty(page, 'nextCursor', { value: String(index) });
    return page;
  } }).request });
  assert.equal(endless.sources.dependabot.pages, 10);
  assert.equal(endless.sources.dependabot.error, 'PAGINATION_LIMIT_REACHED');
});

test('branch changes during collection fail closed and forbidden refs never dispatch', () => {
  let reads = 0;
  const report = collectFeedback({ request: fixture({ requestHook: endpoint => endpoint.includes('/git/ref/') ? { sha: ++reads === 1 ? HEAD : OLD } : undefined }).request });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.error, 'BRANCH_CHANGED_DURING_COLLECTION');
  assert.equal(report.counts, null);
  let invoked = false;
  assert.throws(() => collectFeedback({ ref: 'main; touch marker', request: () => { invoked = true; } }), /REF_NOT_ALLOWED/);
  assert.equal(invoked, false);
});

test('gh dispatch is GET-only argv with a projection, bounded pipes and no inherited debug hooks', () => {
  let call;
  const response = githubRequest('repos/k999ln/rock/git/ref/heads/main', '{sha: .object.sha}', {
    environment: { PATH: '/usr/bin', HOME: '/safe-home', GH_TOKEN: 'private-token', GH_DEBUG: 'api', NODE_OPTIONS: '--require untrusted', GH_HOST: 'evil.invalid', GH_PAGER: 'untrusted' },
    execute: (binary, args, options) => { call = { binary, args, options }; return { status: 0, stdout: '{"sha":"ok"}', stderr: '' }; },
  });
  assert.deepEqual(response, { sha: 'ok' });
  assert.equal(call.binary, 'gh');
  assert.deepEqual(call.args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']);
  assert.deepEqual(call.args.slice(-2), ['--jq', '{sha: .object.sha}']);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.timeout, 30_000);
  assert.equal(call.options.maxBuffer, 1024 * 1024);
  assert.equal(call.options.env.GH_HOST, 'github.com');
  assert.equal(call.options.env.GH_DEBUG, undefined);
  assert.equal(call.options.env.NODE_OPTIONS, undefined);
  for (const result of [{ status: 1, stdout: 'raw private content', stderr: 'private auth detail' }, { status: 0, stdout: 'invalid', stderr: '' }, { status: null, signal: 'SIGTERM', stdout: '' }, { error: new Error('private path') }]) {
    assert.throws(() => githubRequest('endpoint', 'projection', { execute: () => result }), /^Error: GITHUB_(REQUEST_FAILED|RESPONSE_INVALID)$/);
  }
});

test('real subprocess receives literal arguments; metadata is written privately and symlinks refused', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'spider-feedback-test-')));
  try {
    const helper = join(directory, 'fake-gh');
    const capture = join(directory, 'argv.json');
    const marker = join(directory, 'not-executed');
    writeFileSync(helper, `#!${process.execPath}\nimport fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write('{"sha":"ok"}');\n`);
    chmodSync(helper, 0o700);
    const endpoint = `repos/k999ln/rock/git/ref/heads/main;touch ${marker}`;
    githubRequest(endpoint, '{sha: .object.sha}', { binary: helper });
    assert(readFileSync(capture, 'utf8').includes(endpoint));
    assert.equal(existsSync(marker), false);
    const report = collectFeedback({ request: fixture({ alerts: [codeql()] }).request });
    const output = join(directory, 'queue');
    publish(report, output);
    assert.equal(JSON.parse(readFileSync(join(output, 'report.json'))).items[0].id, 'codeql:1');
    assert.match(readFileSync(join(output, 'queue.md'), 'utf8'), /Review queue/);
    const elsewhere = join(directory, 'elsewhere');
    writeFileSync(elsewhere, 'preserve');
    rmSync(join(output, 'report.json'));
    symlinkSync(elsewhere, join(output, 'report.json'));
    assert.throws(() => publish(report, output), /OUTPUT_UNSAFE/);
    assert.equal(readFileSync(elsewhere, 'utf8'), 'preserve');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI rejects unknown repository and does not echo hostile argument strings', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/spider-feedback.mjs'), '--repo', 'evil/secret-private-name', '--output', 'unused'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ARGUMENTS_INVALID/);
  assert(!result.stderr.includes('secret-private-name'));
});
