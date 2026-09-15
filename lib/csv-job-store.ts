import { env } from 'cloudflare:workers';
import {
  CsvError,
  csvReportHtml,
  csvSpecification,
  decodeCsv,
  parseCsv,
  sha256,
  transformCsv,
  type CsvSpecification,
} from './csv-transform';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

type CsvJobRow = {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  input_name: string;
  input_key: string;
  input_bytes: number;
  input_sha256: string;
  input_encoding: string;
  specification_json: string;
  quote_minor: number;
  currency: string;
  result_key: string | null;
  safe_result_key: string | null;
  report_json_key: string | null;
  report_html_key: string | null;
  output_sha256: string | null;
  validation_json: string | null;
  attempt: number;
  revision: number;
  error_code: string | null;
  expires_at: number;
  created_at: number;
  updated_at: number;
  accepted_at: number | null;
  completed_at: number | null;
};

export type CsvJobView = {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  inputName: string;
  inputBytes: number;
  inputSha256: string;
  inputEncoding: string;
  specification: CsvSpecification;
  quoteMinor: number;
  currency: string;
  outputSha256: string | null;
  validation: unknown;
  attempt: number;
  revision: number;
  errorCode: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
  artifacts: string[];
};

export class CsvJobError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function resources() {
  const bindings = env as unknown as { DB?: D1Database; BUCKET?: R2Bucket };
  if (!bindings.DB || !bindings.BUCKET)
    throw new CsvJobError(
      503,
      'STORAGE',
      'ファイル保存の準備ができていません。',
    );
  return { db: bindings.DB, bucket: bindings.BUCKET };
}

function view(row: CsvJobRow): CsvJobView {
  const artifacts: string[] = [];
  if (row.result_key) artifacts.push('result');
  if (row.safe_result_key) artifacts.push('spreadsheet-safe');
  if (row.report_json_key) artifacts.push('report-json');
  if (row.report_html_key) artifacts.push('report-html');
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    inputName: row.input_name,
    inputBytes: row.input_bytes,
    inputSha256: row.input_sha256,
    inputEncoding: row.input_encoding,
    specification: JSON.parse(row.specification_json),
    quoteMinor: row.quote_minor,
    currency: row.currency,
    outputSha256: row.output_sha256,
    validation: row.validation_json ? JSON.parse(row.validation_json) : null,
    attempt: row.attempt,
    revision: row.revision,
    errorCode: row.error_code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    artifacts,
  };
}

async function owned(db: D1Database, user: string, id: string) {
  const row = await db
    .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .first<CsvJobRow>();
  if (!row) throw new CsvJobError(404, 'NOT_FOUND', '受付が見つかりません。');
  return row;
}

async function event(
  db: D1Database,
  row: CsvJobRow,
  name: string,
  detail: unknown = {},
) {
  await db
    .prepare(
      'INSERT INTO csv_job_events (job_id, user_id, event, detail_json, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(row.id, row.user_id, name, JSON.stringify(detail), Date.now())
    .run();
}

async function purgeExpired(db: D1Database, bucket: R2Bucket, user: string) {
  const expired = await db
    .prepare(
      'SELECT * FROM csv_jobs WHERE user_id = ? AND expires_at <= ? LIMIT 20',
    )
    .bind(user, Date.now())
    .all<CsvJobRow>();
  for (const row of expired.results) {
    const keys = [
      row.input_key,
      row.result_key,
      row.safe_result_key,
      row.report_json_key,
      row.report_html_key,
    ].filter(Boolean) as string[];
    if (keys.length) await bucket.delete(keys);
    await db
      .prepare('DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?')
      .bind(row.id, user)
      .run();
    await db
      .prepare('DELETE FROM csv_jobs WHERE id = ? AND user_id = ?')
      .bind(row.id, user)
      .run();
  }
}

export async function listCsvJobs(user: string) {
  const { db, bucket } = resources();
  await purgeExpired(db, bucket, user);
  const rows = await db
    .prepare(
      'SELECT * FROM csv_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
    )
    .bind(user)
    .all<CsvJobRow>();
  return rows.results.map(view);
}

export async function createCsvJob(
  user: string,
  input: {
    id: string;
    name: string;
    bytes: Uint8Array;
    specification: unknown;
    sample: boolean;
  },
) {
  const { db, bucket } = resources();
  if (!/^[0-9a-f-]{36}$/i.test(input.id))
    throw new CsvJobError(400, 'ID', '受付番号が不正です。');
  const name = input.name.trim().slice(0, 180) || 'input.csv';
  const specification = csvSpecification(input.specification);
  const decoded = decodeCsv(input.bytes);
  parseCsv(decoded.text);
  // Quote-time dry run rejects invalid column references and impossible output encodings.
  await transformCsv(input.bytes, specification);
  const hash = await sha256(input.bytes);
  const now = Date.now();
  const inputKey = `csv/${input.id}/input.csv`;
  const existing = await db
    .prepare('SELECT * FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(input.id, user)
    .first<CsvJobRow>();
  if (existing) {
    if (
      existing.input_sha256 !== hash ||
      existing.specification_json !== JSON.stringify(specification)
    )
      throw new CsvJobError(
        409,
        'IDEMPOTENCY',
        '同じ受付番号に異なる内容は保存できません。',
      );
    return view(existing);
  }
  await bucket.put(inputKey, input.bytes, {
    httpMetadata: { contentType: 'text/csv' },
    customMetadata: {
      sha256: hash,
      owner: await sha256(new TextEncoder().encode(user)),
    },
  });
  try {
    await db
      .prepare(
        `INSERT INTO csv_jobs (id, user_id, status, payment_status, input_name, input_key, input_bytes, input_sha256, input_encoding, specification_json, quote_minor, currency, attempt, revision, expires_at, created_at, updated_at) VALUES (?, ?, 'quoted', ?, ?, ?, ?, ?, ?, ?, ?, 'JPY', 0, 0, ?, ?, ?)`,
      )
      .bind(
        input.id,
        user,
        input.sample ? 'sample' : 'unpaid',
        name,
        inputKey,
        input.bytes.byteLength,
        hash,
        decoded.encoding,
        JSON.stringify(specification),
        input.sample ? 0 : 300000,
        now + RETENTION_MS,
        now,
        now,
      )
      .run();
  } catch (error) {
    await bucket.delete(inputKey);
    throw error;
  }
  const row = await owned(db, user, input.id);
  await event(db, row, 'quoted', {
    sample: input.sample,
    quoteMinor: row.quote_minor,
    currency: row.currency,
  });
  return view(row);
}

async function processCsvJob(row: CsvJobRow) {
  const { db, bucket } = resources();
  const now = Date.now();
  if (row.attempt >= MAX_ATTEMPTS)
    throw new CsvJobError(409, 'ATTEMPTS', '自動再試行の上限に達しました。');
  const claim = await db
    .prepare(
      `UPDATE csv_jobs SET status = 'processing', attempt = attempt + 1, error_code = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ? AND status IN ('accepted', 'quality_failed')`,
    )
    .bind(now, row.id, row.user_id, row.revision)
    .run();
  if ((claim.meta.changes ?? 0) !== 1)
    return view(await owned(db, row.user_id, row.id));
  row = await owned(db, row.user_id, row.id);
  await event(db, row, 'processing', { attempt: row.attempt });
  try {
    const inputObject = await bucket.get(row.input_key);
    if (!inputObject)
      throw new CsvJobError(
        500,
        'INPUT_MISSING',
        '入力ファイルが見つかりません。',
      );
    const bytes = new Uint8Array(await inputObject.arrayBuffer());
    if ((await sha256(bytes)) !== row.input_sha256)
      throw new CsvJobError(
        500,
        'INPUT_HASH',
        '入力ファイルの検査値が一致しません。',
      );
    const result = await transformCsv(
      bytes,
      JSON.parse(row.specification_json),
    );
    const base = `csv/${row.id}`;
    const resultKey = `${base}/result.csv`,
      reportJsonKey = `${base}/report.json`,
      reportHtmlKey = `${base}/report.html`;
    const safeResultKey = result.safeOutput
      ? `${base}/spreadsheet-safe.csv`
      : null;
    await bucket.put(resultKey, result.output, {
      httpMetadata: { contentType: 'text/csv' },
      customMetadata: { sha256: result.outputSha256 },
    });
    if (safeResultKey && result.safeOutput)
      await bucket.put(safeResultKey, result.safeOutput, {
        httpMetadata: { contentType: 'text/csv' },
      });
    await bucket.put(reportJsonKey, JSON.stringify(result.report, null, 2), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    await bucket.put(reportHtmlKey, csvReportHtml(result.report, row.id), {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
    });
    const completed = Date.now();
    await db
      .prepare(
        `UPDATE csv_jobs SET status = 'completed', result_key = ?, safe_result_key = ?, report_json_key = ?, report_html_key = ?, output_sha256 = ?, validation_json = ?, revision = revision + 1, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'processing'`,
      )
      .bind(
        resultKey,
        safeResultKey,
        reportJsonKey,
        reportHtmlKey,
        result.outputSha256,
        JSON.stringify(result.report.validation),
        completed,
        completed,
        row.id,
        row.user_id,
      )
      .run();
    row = await owned(db, row.user_id, row.id);
    await event(db, row, 'completed', {
      outputSha256: result.outputSha256,
      validation: result.report.validation,
    });
    return view(row);
  } catch (error) {
    await bucket.delete([
      `csv/${row.id}/result.csv`,
      `csv/${row.id}/spreadsheet-safe.csv`,
      `csv/${row.id}/report.json`,
      `csv/${row.id}/report.html`,
    ]);
    const code =
      error instanceof CsvError || error instanceof CsvJobError
        ? error.code
        : 'PROCESSING';
    await db
      .prepare(
        `UPDATE csv_jobs SET status = 'quality_failed', error_code = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'processing'`,
      )
      .bind(code, Date.now(), row.id, row.user_id)
      .run();
    row = await owned(db, row.user_id, row.id);
    await event(db, row, 'quality_failed', { code });
    throw error;
  }
}

export async function acceptCsvJob(
  user: string,
  id: string,
  input: {
    revision: number;
    paymentMethod?: string;
    paymentReference?: string;
  },
) {
  const { db } = resources();
  let row = await owned(db, user, id);
  if (row.expires_at <= Date.now()) {
    await deleteCsvJob(user, id);
    throw new CsvJobError(410, 'EXPIRED', '保管期限を過ぎたため削除しました。');
  }
  if (row.status === 'completed') return view(row);
  if (row.status === 'processing') return view(row);
  if (!Number.isInteger(input.revision) || input.revision !== row.revision)
    throw new CsvJobError(
      409,
      'REVISION',
      '別の画面で更新されています。再読込してください。',
    );
  const sample = row.payment_status === 'sample';
  const method = input.paymentMethod?.trim().slice(0, 40) ?? '';
  const reference = input.paymentReference?.trim().slice(0, 120) ?? '';
  if (!sample && (!method || reference.length < 4))
    throw new CsvJobError(
      400,
      'PAYMENT_EVIDENCE',
      '入金を確認した方法と照合番号を入力してください。',
    );
  const now = Date.now();
  const accepted = await db
    .prepare(
      `UPDATE csv_jobs SET status = 'accepted', payment_status = ?, payment_method = ?, payment_reference = ?, accepted_at = COALESCE(accepted_at, ?), revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ? AND status IN ('quoted', 'quality_failed')`,
    )
    .bind(
      sample ? 'sample' : 'manual_verified',
      sample ? null : method,
      sample ? null : reference,
      now,
      now,
      id,
      user,
      row.revision,
    )
    .run();
  if ((accepted.meta.changes ?? 0) !== 1)
    throw new CsvJobError(409, 'STATE', '現在の状態では開始できません。');
  row = await owned(db, user, id);
  await event(db, row, 'accepted', { paymentStatus: row.payment_status });
  return processCsvJob(row);
}

export async function retryCsvJob(user: string, id: string, revision: number) {
  const { db } = resources();
  const row = await owned(db, user, id);
  if (row.status !== 'quality_failed' || revision !== row.revision)
    throw new CsvJobError(409, 'STATE', '再試行できる状態ではありません。');
  return processCsvJob(row);
}

export async function deleteCsvJob(user: string, id: string) {
  const { db, bucket } = resources();
  const row = await owned(db, user, id);
  const keys = [
    row.input_key,
    row.result_key,
    row.safe_result_key,
    row.report_json_key,
    row.report_html_key,
  ].filter(Boolean) as string[];
  if (keys.length) await bucket.delete(keys);
  await db
    .prepare('DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?')
    .bind(id, user)
    .run();
  await db
    .prepare('DELETE FROM csv_jobs WHERE id = ? AND user_id = ?')
    .bind(id, user)
    .run();
}

export async function csvArtifact(user: string, id: string, kind: string) {
  const { db, bucket } = resources();
  const row = await owned(db, user, id);
  if (row.expires_at <= Date.now()) {
    await deleteCsvJob(user, id);
    throw new CsvJobError(410, 'EXPIRED', '保管期限を過ぎたため削除しました。');
  }
  const map: Record<
    string,
    { key: string | null; name: string; type: string }
  > = {
    result: { key: row.result_key, name: 'result.csv', type: 'text/csv' },
    'spreadsheet-safe': {
      key: row.safe_result_key,
      name: 'spreadsheet-safe.csv',
      type: 'text/csv',
    },
    'report-json': {
      key: row.report_json_key,
      name: 'report.json',
      type: 'application/json; charset=utf-8',
    },
    'report-html': {
      key: row.report_html_key,
      name: 'report.html',
      type: 'text/html; charset=utf-8',
    },
  };
  const selected = map[kind];
  if (!selected?.key)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  const object = await bucket.get(selected.key);
  if (!object)
    throw new CsvJobError(404, 'ARTIFACT', '成果物が見つかりません。');
  return { object, name: selected.name, type: selected.type };
}

export function csvApiError(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return Response.json(
      {
        error: 'サインインするとCSVの受付と履歴を利用できます。',
        code: 'UNAUTHORIZED',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof Error && error.message === 'ORIGIN')
    return Response.json(
      { error: 'このサイトから操作してください。', code: 'ORIGIN' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof CsvJobError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  if (error instanceof CsvError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  console.error('csv-job', error);
  return Response.json(
    {
      error: '処理に失敗しました。入力を保持している場合は再試行できます。',
      code: 'INTERNAL',
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
