import { parseWorkAgentCreationReview, storedWorkToolExecutionReview, type WorkJob } from './workflow.ts';
import type { A2ADelegation, A2AParentBudget, A2ABudgetReservation, A2AUsageReceiptRecord } from './a2a-delegation-store.ts';
import type { RemoteAiTextRecord } from './remote-ai-text-store.ts';
import { agentOutputText, skyAppSections } from './sky-output-presenter.ts';
import type { StoredA2AArtifactDocument } from './a2a-artifacts.ts';
import { skyProgress } from './sky-presentation.ts';
import { parseSkyAppRequest, parseSkyAppResult } from './sky-app-contract.ts';

export const SKY_OWNER_EXPORT_SCHEMA = 'sky.owner-work-export/1';
export const SKY_OWNER_EXPORT_MAX_BYTES = 2 * 1024 * 1024;
export const SKY_OWNER_EXPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export class SkyOwnerExportError extends Error {
  readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'INVALID_INPUT' | 'TOO_LARGE' | 'INVALID_ARTIFACT' | 'UNAVAILABLE';
  constructor(code: SkyOwnerExportError['code']) {
    super(code);
    this.name = 'SkyOwnerExportError';
    this.code = code;
  }
}

export type OwnerExportArtifact = {
  id: string;
  sha256: string;
  byteLength: number;
  createdAt: number;
  document: unknown;
};
export type OwnerExportSnapshot = {
  job: WorkJob;
  agents: Array<{ delegation: A2ADelegation; artifacts: OwnerExportArtifact[]; receipt: A2AUsageReceiptRecord | null }>;
  cloud: RemoteAiTextRecord[];
  budget: A2AParentBudget | null;
  reservations: A2ABudgetReservation[];
};

function plain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Reconstruct the stored text schema; unknown payload fields never become export fields. */
export function ownerExportArtifact(value: unknown): StoredA2AArtifactDocument {
  if (!plain(value) || !onlyKeys(value, ['schemaVersion', 'artifacts', 'omittedNonTextParts', 'truncated']) ||
    value.schemaVersion !== 1 || !Array.isArray(value.artifacts) || value.artifacts.length > 16 ||
    !Number.isSafeInteger(value.omittedNonTextParts) || (value.omittedNonTextParts as number) < 0 ||
    typeof value.truncated !== 'boolean') throw new SkyOwnerExportError('INVALID_ARTIFACT');
  const artifacts = value.artifacts.map((item) => {
    if (!plain(item) || !onlyKeys(item, ['name', 'description', 'textParts']) ||
      (item.name !== undefined && typeof item.name !== 'string') ||
      (item.description !== undefined && typeof item.description !== 'string') ||
      !Array.isArray(item.textParts) || item.textParts.length > 128 ||
      !item.textParts.every((part) => typeof part === 'string')) throw new SkyOwnerExportError('INVALID_ARTIFACT');
    return {
      ...(item.name === undefined ? {} : { name: item.name as string }),
      ...(item.description === undefined ? {} : { description: item.description as string }),
      textParts: item.textParts as string[],
    };
  });
  return { schemaVersion: 1, artifacts, omittedNonTextParts: value.omittedNonTextParts as number, truncated: value.truncated };
}

const bytes = (text: string) => new TextEncoder().encode(text);
export async function ownerExportSha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', bytes(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

/** Human-facing meeting view; technical provenance stays in the collapsible record. */
export function skyMeetingOverview(request: ReturnType<typeof parseSkyAppRequest>, result: ReturnType<typeof parseSkyAppResult>, status: WorkJob['status']) {
  if (request.appId !== 'zoom') throw new SkyOwnerExportError('INVALID_INPUT');
  const list = (values: string[] | undefined) => values?.length
    ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
    : '<p>このメモには記載がありません。</p>';
  // Report only a literal undecided statement, without inferring a budget or a decision.
  const undecided = request.input.split(/\r?\n/u).flatMap((row) => {
    const match = row.trim().match(/^([^「」"<>:：]{1,32}?)は(?:まだ)?(?:未定|未決定)(?:です)?[。.]?$/u);
    return match ? [`${match[1]}はまだ決まっていません。`] : [];
  });
  const summary = !result.notes?.decisions?.length && !result.notes?.owners?.length && result.notes?.summary;
  return `<h1>会議のまとめ</h1>
<p>${result.execution === 'local-llm' ? 'Zoomに表示されていた内容をまとめたメモです。' : '入力した会議メモをまとめたものです。'}</p>
<p class="status">${status === 'completed' ? '確認済みのメモです。' : '下書きです。元のメモと内容を確認してください。'}</p>
${summary ? `<section><h2>概要</h2><p>${escapeHtml(summary)}</p></section>` : ''}
<section><h2>決まったこと</h2>${list(result.notes?.decisions)}</section>
<section><h2>担当</h2>${list(result.notes?.owners)}</section>
<section><h2>まだ決まっていないこと</h2>${list(undecided)}</section>
<p>このファイルは、Skyを開かずに読めます。</p>`;
}

/** All exports start with the same readable contract, independent of the connected app. */
export function skyOwnerOverview(snapshot: OwnerExportSnapshot, warnings: string[], exportedAt: string): string {
  const { job } = snapshot;
  const state = skyProgress(job.status);
  const title = job.skyApp?.request.appId === 'planner' ? 'プランナーの作業準備' : job.skyApp?.request.appId === 'zoom' ? '会議のまとめ' : job.title;
  const text = (body: string) => `<p class="result-text">${escapeHtml(body)}</p>`;
  const sections: string[] = [];
  if (job.skyApp?.result) {
    const request = parseSkyAppRequest(job.skyApp.request);
    const result = parseSkyAppResult(job.skyApp.result, job.id, request);
    for (const section of skyAppSections(request, result))
      sections.push(`<section><h2>${escapeHtml(section.title)}</h2>${section.lines.map(text).join('')}</section>`);
    if (request.appId === 'planner') sections.push(text('作業の準備を整理した下書きです。調査、制作、連絡、予定の変更は行っていません。'));
  }
  for (const item of job.toolObservations ?? []) {
    sections.push(`<section><h2>Toolから保存した内容</h2>${text('画面で受け取った内容です。Toolの処理成功は独立確認されていません。')}${text(item.text)}</section>`);
  }
  for (const { delegation, artifacts } of snapshot.agents) {
    sections.push(`<section><h2>${escapeHtml(delegation.targetAgentName)}の成果</h2>${text(skyProgress(delegation.state, 'execution').label)}${artifacts.map((artifact) => text(agentOutputText(ownerExportArtifact(artifact.document)) || '保存された本文はありません。')).join('')}${delegation.artifactsCaptured !== 1 ? text('成果が保存できたかをまだ確認できません。') : ''}</section>`);
  }
  for (const answer of snapshot.cloud) sections.push(`<section><h2>AIの回答</h2>${text(skyProgress(answer.state, 'execution').label)}${text(answer.saveResult && answer.resultText !== null ? answer.resultText : 'この回答の本文は保存されていません。')}</section>`);
  const amount = (minor: number, currency: string) => {
    try {
      const format = new Intl.NumberFormat('ja-JP', { style: 'currency', currency });
      const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
      return format.format(minor / 10 ** digits);
    } catch { return 'この通貨の金額表示には対応していません。詳しい記録を確認してください。'; }
  };
  const budget = snapshot.budget;
  const costs = budget ? `<ul><li>承認した上限: ${escapeHtml(amount(budget.budgetLimitMinor, budget.currency))}</li><li>取り置き中の予算: ${escapeHtml(amount(budget.reservedMinor, budget.currency))}</li><li>記録された利用額: ${escapeHtml(amount(budget.settledMinor, budget.currency))}</li></ul>` : text('この仕事の利用額のまとめは保存されていません。無料だったとは限りません。');
  return `<h1>${escapeHtml(title)}</h1><p class="status">${escapeHtml(state.label)}。${escapeHtml(state.detail)}</p>
<section><h2>できたもの</h2>${sections.length ? sections.join('') : text('このファイルに保存された成果の本文はありません。')}</section>
<section><h2>次にすること</h2>${text(state.next)}${text('保存された文章の内容を元の資料と比べて確認してください。')}</section>
<section><h2>利用額</h2>${costs}${text('利用額の記録と、請求書の確認や支払いの完了は別です。')}</section>
<section><h2>保存できた範囲</h2>${text('選んだ仕事の記録と、保存されている文章の成果をまとめました。元の添付ファイルやアカウント全体のデータは含みません。')}${warnings.length ? text('一部の成果や利用明細に、未保存・省略・未確認の項目があります。すべてそろった記録ではありません。詳しい記録で確認できます。') : ''}</section>
<p>保存した日時: ${escapeHtml(exportedAt)}</p><p>このファイルはSkyを開かずに読めます。保存先と共有する相手は、自分で選んでください。</p>`;
}

export async function buildSkyOwnerExport(snapshot: OwnerExportSnapshot, exportedAt = new Date().toISOString()) {
  const warnings: string[] = [];
  const files: Array<{ name: string; mediaType: string; content: string; sha256: string; byteLength: number }> = [];
  let totalBytes = 0;
  async function add(name: string, mediaType: string, content: string) {
    // Match the text a standalone HTML viewer exposes, including HTML's newline/NUL normalization.
    content = content.replace(/\r\n?/g, '\n').replaceAll('\0', '\uFFFD');
    const length = bytes(content).byteLength;
    totalBytes += length;
    if (totalBytes > SKY_OWNER_EXPORT_MAX_BYTES) throw new SkyOwnerExportError('TOO_LARGE');
    files.push({ name, mediaType, content, sha256: await ownerExportSha256(content), byteLength: length });
  }
  const addJson = (name: string, value: unknown) => add(name, 'application/json', JSON.stringify(value, null, 2) + '\n');
  const job = snapshot.job;
  // Project known business fields, never spread database rows, credentials or authorization proofs.
  await addJson('work.json', {
    id: job.id, revision: job.revision, title: job.title, templateId: job.templateId,
    status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
    objective: job.plan.objective,
    steps: job.steps.map((step) => ({ id: step.id, title: step.title, tool: step.tool, runner: step.runner, passed: step.passed })),
    history: job.events.map(({ at, command }) => ({ at, action: command.action,
      ...(command.action === 'record' ? { stepId: command.stepId, tool: command.tool, outcome: command.outcome, sample: command.sample, durationMs: command.durationMs } : {}),
      ...(command.action === 'complete' ? { note: command.note } : {}),
      ...(command.action === 'edit_plan' ? { objective: command.objective } : {}),
    })),
  });
  if (job.composition) warnings.push('組合せ仕事の内部graphと添付成果は今回の対象外です。');
  const agents = [];
  const summaries = [`# ${job.title}`, `保存時点: ${skyProgress(job.status).label}`, `目的: ${job.plan.objective}`];
  if (job.skyApp) {
    const request = parseSkyAppRequest(job.skyApp.request);
    const result = job.skyApp.result ? parseSkyAppResult(job.skyApp.result, job.id, request) : null;
    await addJson('sky-app.json', { request, result });
    summaries.push(`## ${request.appId === 'planner' ? '作業の準備' : '会議のまとめ'}`,
      result?.execution === 'local-llm'
        ? `本人が選んだZoomの表示文章をローカルLLM ${result.model!.name} で整理。会議の全記録・投稿・会議操作の証拠ではありません。`
        : '制限付きtext処理。実Zoom操作・外部実作業の証拠ではありません。',
      result?.body ?? 'この仕事には保存された連携成果がありません。');
  }
  if (job.agentBinding?.creationReview || job.toolAttempts?.length) {
    let creation = null;
    const attempts = [];
    try {
      if (job.agentBinding?.creationReview) creation = { agentId: job.agentBinding.agentId,
        agentRevision: job.agentBinding.agentRevision, requestDigest: job.agentBinding.requestDigest,
        review: parseWorkAgentCreationReview(job.agentBinding.creationReview) };
      for (const attempt of job.toolAttempts ?? []) {
        const review = await storedWorkToolExecutionReview(job, attempt);
        attempts.push({ attemptId: attempt.id, state: attempt.state, startedAt: attempt.startedAt,
          claimedAt: attempt.claimedAt ?? null, stopRequestedAt: attempt.stopRequestedAt ?? null,
          observationId: attempt.observationId ?? null, record: review ? 'client_confirmed_provider_declared' : 'not_recorded',
          review, reviewDigest: review ? attempt.executionReviewDigest : null,
          creationRelation: review ? attempt.creationRelation : null });
      }
    } catch { throw new SkyOwnerExportError('INVALID_ARTIFACT'); }
    await addJson('tool-execution-reviews.json', { creation, attempts });
    warnings.push('作成時と実行直前の条件は別の記録です。未記録は確認済みとせず、提供者の料金申告を確定料金や実行権限とは扱いません。');
  }
  if (job.toolObservations?.length) {
    if (job.toolObservations.length > 20 || job.toolObservations.some(item =>
      item.schema !== 'rockstaros.work-tool-observation/1' || item.verification !== 'client_observed_unverified' ||
      typeof item.text !== 'string' || bytes(item.text).byteLength > 8192)) throw new SkyOwnerExportError('INVALID_ARTIFACT');
    const observations = job.toolObservations.map(item => ({ id: item.id, packageKey: item.packageKey,
      manifestSha256: item.manifestSha256, connectorId: item.connectorId, toolName: item.toolName,
      text: item.text, verification: item.verification, recordedAt: item.recordedAt }));
    await addJson('tool-observations.json', observations);
    warnings.push('Toolの画面から保存した結果は独立検証されていません。実行成功や費用確定の証拠ではありません。');
    for (const item of observations) summaries.push(`## Tool: ${item.toolName}`, '状態: 画面で観測した結果（独立未検証）', item.text);
  }
  for (const { delegation: item, artifacts, receipt } of snapshot.agents) {
    agents.push({ id: item.id, revision: item.revision, state: item.state,
      agent: { name: item.targetAgentName, version: item.targetAgentVersion, origin: item.targetOrigin },
      artifactsCaptured: item.artifactsCaptured === 1, createdAt: item.createdAt, updatedAt: item.updatedAt,
      usageReceiptSummary: receipt ? { providerId: receipt.providerId, providerReference: receipt.providerReference,
        currency: receipt.currency, amountMinor: receipt.amountMinor, issuedAt: receipt.issuedAt, receivedAt: receipt.receivedAt } : null,
    });
    if (item.artifactsCaptured !== 1) warnings.push(`Agent ${item.id}: 成果の保存完了を確認していません。`);
    if (!receipt) warnings.push(`Agent ${item.id}: 確定usage receiptは未保存です。未請求や0円を意味しません。`);
    for (const artifact of artifacts) {
      if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw new SkyOwnerExportError('INVALID_ARTIFACT');
      const document = ownerExportArtifact(artifact.document);
      if (document.truncated || document.omittedNonTextParts > 0)
        warnings.push(`成果 ${artifact.id}: 保存時の省略あり（file/data ${document.omittedNonTextParts}件、text省略 ${document.truncated ? 'あり' : 'なし'}）。`);
      const index = files.length;
      await addJson(`agent-result-${index}.json`, { artifactId: artifact.id, delegationId: item.id,
        storedSha256: artifact.sha256, storedByteLength: artifact.byteLength, createdAt: artifact.createdAt, document });
      summaries.push(`## Agent: ${item.targetAgentName} / ${item.targetAgentVersion}`, `状態: ${skyProgress(item.state, 'execution').label}`, agentOutputText(document) || '保存された本文はありません。');
    }
  }
  await addJson('agents.json', agents);
  const cloud = snapshot.cloud.map((item) => {
    if (!item.saveResult || item.resultText === null)
      warnings.push(`Cloud AI ${item.id}: ${item.saveResult ? '本文が保存されていません。' : '保存しない設定のため本文は含みません。'}`);
    if (item.saveResult && item.resultText !== null)
      summaries.push(`## Cloud AI: ${item.quote.ceiling.modelId}`, `状態: ${skyProgress(item.state, 'execution').label}`, item.resultText);
    return { id: item.id, revision: item.revision, state: item.state, modelId: item.quote.ceiling.modelId,
      providerId: item.quote.ceiling.providerId, saveResult: item.saveResult,
      resultText: item.saveResult ? item.resultText : null, createdAt: item.createdAt, updatedAt: item.updatedAt,
      currency: item.quote.ceiling.currency, settledMinor: item.settledMinor,
      usage: item.usage ? { inputTokens: item.usage.inputTokens, outputTokens: item.usage.outputTokens } : null,
    };
  });
  await addJson('cloud-answers.json', cloud);
  const budget = snapshot.budget;
  await addJson('usage.json', {
    note: 'minorは通貨の最小単位です。予約額と確定額を区別してください。提供者の請求書や送金の証明ではありません。',
    budget: budget ? { currency: budget.currency, limitMinor: budget.budgetLimitMinor,
      reservedMinor: budget.reservedMinor, settledMinor: budget.settledMinor, revision: budget.revision } : null,
    reservations: snapshot.reservations.map((item) => ({ delegationId: item.delegationId, currency: item.currency,
      reservedMinor: item.reservedMinor, settledMinor: item.settledMinor, state: item.state, updatedAt: item.updatedAt })),
  });
  await add('results.md', 'text/markdown', summaries.join('\n\n') + '\n');
  const manifest = {
    schema: SKY_OWNER_EXPORT_SCHEMA, exportedAt,
    scope: { kind: 'selected_owner_work', jobId: job.id, revision: job.revision },
    completeness: warnings.length ? 'partial' : 'complete_within_declared_scope',
    warnings,
    exclusions: ['選択していない仕事・アカウント全体のデータ', 'CSV等の元file、未保存・期限切れ成果、非text添付',
      '端末内履歴・設定・記憶、商品本体・model weights', '接続credential、秘密鍵、session、実行承認、署名済みusage receipt原文', '他人のデータ'],
    compatibility: 'UTF-8のHTML/JSON/Markdown。閲覧用で、他環境へのimportや実行許可を付与しません。作者・提供者のlicenseを引き継ぎます。',
    provenance: {
      agents: agents.map((item) => ({ delegationId: item.id, ...item.agent })),
      cloud: cloud.map((item) => ({ executionId: item.id, modelId: item.modelId, providerId: item.providerId })),
      license: '個別license本文はこの保存recordにありません。本人の私有回収用で、公開・再配布の権利を新たに付与しません。',
    },
    integrity: '各file欄の本文をUTF-8（LF改行、NULは置換文字）へ戻してSHA-256を照合できます。hashは提供者の署名や内容の正しさを保証しません。',
    files: files.map(({ name, mediaType, sha256, byteLength }) => ({ name, mediaType, sha256, byteLength })),
  };
  const overview = skyOwnerOverview(snapshot, warnings, exportedAt);
  const meeting = job.skyApp?.result && job.skyApp.request.appId === 'zoom'
    ? skyMeetingOverview(parseSkyAppRequest(job.skyApp.request), parseSkyAppResult(job.skyApp.result, job.id, job.skyApp.request), job.status) : null;
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(SKY_OWNER_EXPORT_CSP)}"><meta name="referrer" content="no-referrer">
<title>${meeting ? '会議のまとめ' : `${escapeHtml(job.title)} — 持出した仕事`}</title>
<style>.result-text{white-space:pre-wrap;overflow-wrap:anywhere}body{margin:0 auto;padding:24px;max-width:960px;font:16px/1.7 system-ui,sans-serif;color:#172332;background:#fafafa}h1{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid #ccd4dd;padding:16px;border-radius:8px;font:14px/1.7 ui-monospace,monospace}section{margin:28px 0}details{margin:20px 0}summary{cursor:pointer}li{margin:8px 0}.status{padding:16px;background:#edf2f8;border-radius:8px}</style></head>
<body>${overview}<details class="technical"><summary>元の資料と詳しい記録</summary><h1>${escapeHtml(job.title)}</h1>
<p>このfileはSkyへの接続・ログインなしで読めます。スクリプト・外部通信は使いません。個人情報を含むことがあるため、保存先と共有先を自分で管理してください。</p>
<p class="status">持出し日時: ${escapeHtml(exportedAt)} ／ 仕事の状態: ${escapeHtml(job.status)}<br>回収範囲: 選択した仕事の記録・保存済みtext成果・利用額の要約。${warnings.length ? '省略・未確認の項目があります。' : '明示した回収範囲を取得しました。'} 仕事の成功・請求確定・全データ回収を意味しません。</p>
${warnings.length ? `<section><h2>省略・未確認</h2><ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>` : ''}
<section><h2>成果を読む</h2><pre>${escapeHtml(files.find((file) => file.name === 'results.md')!.content)}</pre></section>
<section><h2>利用額</h2><pre>${escapeHtml(files.find((file) => file.name === 'usage.json')!.content)}</pre><p>Agentの確定usage要約は下のagents.json、Cloud AIの確定額はcloud-answers.jsonで確認できます。未確認額を0円と扱わないでください。</p></section>
<section><h2>回収範囲・完全性・file一覧</h2><pre id="export-manifest">${escapeHtml(JSON.stringify(manifest, null, 2))}</pre></section>
<section><h2>機械で読める記録</h2>${files.map((file) => `<details><summary>${escapeHtml(file.name)} (${file.byteLength} bytes)</summary><pre data-export-file="${escapeHtml(file.name)}">${escapeHtml(file.content)}</pre></details>`).join('')}</section>
</details></body></html>`;
  if (bytes(html).byteLength > SKY_OWNER_EXPORT_MAX_BYTES * 6) throw new SkyOwnerExportError('TOO_LARGE');
  return { html, manifest, filename: `sky-work-${job.id}-r${job.revision}.html` };
}
