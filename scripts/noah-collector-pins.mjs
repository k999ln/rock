import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NOAH_SHELF_SCENES } from '../lib/noah-pin-scenes-shelf.ts';
import { parseStoredNoahPin } from '../lib/noah-pin-storage.ts';
import { checkNoahPinWriting, noahPinSourceContainsSecret, noahPinWritingInstructions } from '../lib/noah-pin-writing.ts';

export const NOAH_PIN_MODEL = 'gpt-5.4-mini-2026-03-17';
export const NOAH_PIN_LIMITS = { perRun: 20, monthMicroUsd: 50_000_000, outputTokens: 700, seconds: 90 };
const RESPONSES = 'https://api.openai.com/v1/responses';
const EXAMPLE_REASONS = [
  '取引を勘定科目、仕訳、税区分に分けます。', '番号を確かめて照会する手順です。', '箇所ごとの重さを濃さで示します。',
  '手作業、自動化、承認の担当が分かれます。', '調べる事を題、URL、日付、要点に分けます。', '求人を希望で絞ります。',
  '仕事と法令の重なりを示します。', '単語から発音の要素へ広げます。', '単語が当てはまる HSK の級を示します。',
  '人が参加して遊べることを示します。', '区切った面を塗る内容です。', '寄附額の上限の目安を示します。',
  '引かれた税と戻る額を重ねます。', '総支給を手取りと控除に分けます。', '見頃の期間と行く日を示します。',
  '地区から距離の近い順を示します。', '園の名前から所在地や連絡先へ広げます。',
];
const shelf = new URL('../data/noah-shelf-first-cards.json', import.meta.url);
const instructions = () => noahPinWritingInstructions(JSON.parse(readFileSync(shelf, 'utf8')).map(({ id, title, give, get }, index) =>
  ({ title, give, get, scene: NOAH_SHELF_SCENES[id], reason: EXAMPLE_REASONS[index] })));
const migration = new URL('../docs/noah/migrations/0061_noah_intake_pins.sql', import.meta.url);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceOf = ({ name, summary, summary_ja, tools = [] }) =>
  ({ name, summary, ...(summary_ja ? { summary_ja } : {}), tools });
const collectionKey = (item) => `${item.source}:${item.id}`;

export function prepareCollectorPins(local) {
  local.assertLease();
  const sql = local.sql;
  sql.exec('BEGIN');
  try {
    const column = sql.prepare("SELECT 1 FROM pragma_table_info('noah_intake_candidates') WHERE name='pin_at'").get();
    if (!column) sql.exec(readFileSync(migration, 'utf8'));
    sql.exec(`
      CREATE TABLE IF NOT EXISTS _noah_pin_tools (id TEXT PRIMARY KEY, tools_sha256 TEXT NOT NULL, tools_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _noah_pin_collection (
        id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, pin_json TEXT, pin_skip TEXT
      );
      CREATE TABLE IF NOT EXISTS _noah_pin_budget (month TEXT PRIMARY KEY, reserved_micro_usd INTEGER NOT NULL);
    `);
    sql.exec('COMMIT');
  } catch (error) {
    sql.exec('ROLLBACK');
    throw error;
  }
  const put = sql.prepare(`INSERT INTO _noah_pin_tools VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE
    SET tools_sha256=excluded.tools_sha256, tools_json=excluded.tools_json
    WHERE tools_sha256 IS NOT excluded.tools_sha256 OR tools_json IS NOT excluded.tools_json`);
  return async ({ candidateId, toolsSha256, tools }) => {
    local.assertLease();
    const projection = tools.slice(0, 20).map(({ name, description }) => ({ name, description }));
    put.run(candidateId, toolsSha256, JSON.stringify(projection));
  };
}

export function createNoahPinWriter(key, fetcher = fetch) {
  return async ({ instructions, source, error, signal }) => {
    const input = JSON.stringify(source);
    const response = await fetcher(RESPONSES, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: NOAH_PIN_MODEL, store: false, max_output_tokens: NOAH_PIN_LIMITS.outputTokens,
        instructions: error ? `${instructions}\n前の回答の誤りを直してください。 ${error}` : instructions,
        input, text: { format: { type: 'json_object' } } }),
      signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('pin_provider_unavailable');
    }
    const body = await response.json();
    const output = body.output?.filter((item) => item.type === 'message').flatMap((item) => item.content)
      .filter((part) => part.type === 'output_text').map((part) => part.text).join('');
    return body.status === 'completed' && typeof output === 'string' ? output : '';
  };
}

/** Reserve an intentionally conservative USD estimate per request, including a possible rewrite. */
function requestEstimate(prefix, source, error) {
  const bytes = Buffer.byteLength(prefix) + Buffer.byteLength(JSON.stringify(source)) + Buffer.byteLength(error ?? '') + 512;
  return Math.ceil(bytes * 0.75 + NOAH_PIN_LIMITS.outputTokens * 4.5);
}

export async function writeCollectorPins({ local, snapshots, writer, now = Date.now, signal, limits = NOAH_PIN_LIMITS }) {
  local.assertLease();
  const sql = local.sql, started = now();
  const intake = sql.prepare(`SELECT c.id,c.name,c.summary,c.summary_ja,c.pin_source_sha256,c.pin_at,c.pin_json,c.pin_skip,k.tools_sha256,t.tools_json
    FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id
    LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id
    LEFT JOIN _noah_pin_tools t ON t.id=c.id AND t.tools_sha256=k.tools_sha256
    WHERE f.listed=1 AND f.hidden_at IS NULL AND f.withdrawn_at IS NULL
    ORDER BY f.one_tap DESC, COALESCE(k.l1_at, 0) DESC, c.id`).all();
  const registry = new Map(intake.map((row) => [row.id, row]));
  const collection = new Map(sql.prepare('SELECT * FROM _noah_pin_collection').all().map((row) => [row.id, row]));
  const fromIntake = (row) => sourceOf({ ...row, tools: row.tools_json ? JSON.parse(row.tools_json) : [] });
  const validRecord = (row, source) => (row && (row.pin_json || row.pin_skip) && (row.pin_source_sha256 ?? row.source_sha256) === hash(source));
  const pending = [];
  const status = { status: 'ready', written: 0, skipped: 0, invalid: 0, waitingForTools: 0, perRunStopped: 0, monthStopped: 0, waiting: 0, attempts: 0, reservedMicroUsd: 0 };
  for (const row of intake) {
    if (row.tools_sha256 && !row.tools_json) { status.waitingForTools++; continue; }
    const source = fromIntake(row);
    if (!validRecord(row, source)) pending.push({ id: row.id, source, intake: row });
  }
  for (const snapshot of snapshots) for (const item of snapshot.items) {
    if (item.source === 'mcp-registry' && registry.has(item.id)) continue;
    const id = collectionKey(item), source = sourceOf(item);
    if (!validRecord(collection.get(id), source)) pending.push({ id, source });
  }
  const prefix = pending.length ? instructions() : '';
  const reserve = sql.prepare(`INSERT INTO _noah_pin_budget VALUES (?, ?)
    ON CONFLICT(month) DO UPDATE SET reserved_micro_usd=reserved_micro_usd+excluded.reserved_micro_usd
    WHERE reserved_micro_usd+excluded.reserved_micro_usd <= ?`);
  const saveCollection = sql.prepare(`INSERT INTO _noah_pin_collection VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET source_sha256=excluded.source_sha256,pin_json=excluded.pin_json,pin_skip=excluded.pin_skip`);
  const saveIntake = sql.prepare('UPDATE noah_intake_candidates SET pin_source_sha256=?,pin_json=?,pin_skip=?,pin_model=?,pin_at=? WHERE id=?');
  for (const [index, row] of pending.entries()) {
    if (index >= limits.perRun) { status.perRunStopped = pending.length - index; break; }
    if (signal?.aborted || now() >= started + limits.seconds * 1000) { status.waiting = pending.length - index; break; }
    let output = { skip: 'unclear' };
    if (!noahPinSourceContainsSecret(row.source)) {
      try {
        let error;
        for (let attempt = 0; attempt < 2; attempt++) {
          local.assertLease();
          const at = now(), month = new Date(at).toISOString().slice(0, 7), cost = requestEstimate(prefix, row.source, error);
          if (cost > limits.monthMicroUsd || !reserve.run(month, cost, limits.monthMicroUsd).changes) {
            status.monthStopped = pending.length - index;
            break;
          }
          status.attempts++;
          status.reservedMicroUsd += cost;
          output = checkNoahPinWriting(await writer({ instructions: prefix, source: row.source, error, signal }), row.source);
          if (!output.error) break;
          error = output.error;
          output = { skip: 'invalid' };
        }
      } catch {
        status.status = 'unavailable';
        status.waiting = pending.length - index;
        break;
      }
      if (status.monthStopped) break;
    }
    local.assertLease();
    const fingerprint = hash(row.source);
    const json = output.pin ? JSON.stringify(output.pin) : null, skip = output.skip ?? null;
    if (row.intake) {
      saveIntake.run(fingerprint, json, skip, NOAH_PIN_MODEL, Math.max(now(), (row.intake.pin_at ?? 0) + 1), row.id);
    } else saveCollection.run(row.id, fingerprint, json, skip);
    if (json) status.written++;
    else if (skip === 'invalid') status.invalid++;
    else status.skipped++;
  }
  return status;
}

/** 古い文や古い握手から作った図解は書き出しません。 */
export function collectorPinFilter(local) {
  const captured = new Map(local.sql.prepare(`SELECT t.id,t.tools_json FROM _noah_pin_tools t
    JOIN noah_intake_checks k ON k.candidate_id=t.id AND k.tools_sha256=t.tools_sha256`).all()
    .map((row) => [row.id, JSON.parse(row.tools_json)]));
  return (row) => row.pin_source_sha256 === hash(sourceOf({ ...row, tools: captured.get(row.id) ?? [] }));
}

export function addCollectorPins(local, snapshots, exported) {
  const registry = new Map(exported.candidates.map((row) => [row.id, row.pin_json]));
  const lookup = local.sql.prepare('SELECT pin_json, source_sha256 FROM _noah_pin_collection WHERE id=?');
  for (const snapshot of snapshots) for (const item of snapshot.items) {
    const row = lookup.get(collectionKey(item));
    const json = item.source === 'mcp-registry' && registry.has(item.id) ? registry.get(item.id)
      : row?.source_sha256 === hash(sourceOf(item)) ? row.pin_json : null;
    const pin = parseStoredNoahPin(json);
    if (pin) item.pin = pin;
  }
}
