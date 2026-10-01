import { OperatorError, exactObject, uuid } from './validation.ts';
import {
  decodeBase64Url,
  ecdsaDerToRaw,
  encodeBase64Url,
} from './operator-webauthn.ts';

const encoder = new TextEncoder();
const noncePattern = /^[A-Za-z0-9_-]{22,86}$/u;
const resultPattern = /^[A-Z][A-Z0-9_]{2,79}$/u;

function field(name: string, value: string) {
  return `${name}:${encoder.encode(value).byteLength}:${value}\n`;
}

function canonicalDeviceRequest(
  method: string,
  path: string,
  deviceId: string,
  timestamp: string,
  nonce: string,
  bodySha256: string,
) {
  return encoder.encode(
    'avocadoOS-device-request/1\n' +
      field('method', method) + field('path', path) +
      field('deviceId', deviceId) + field('timestamp', timestamp) +
      field('nonce', nonce) + field('bodySha256', bodySha256),
  );
}

function header(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new OperatorError('端末requestを認証できません。', 401);
  return value;
}

function safeDetails(value: unknown) {
  const details = exactObject(value, [
    'osVersion', 'securityPatch', 'batteryStatus', 'batteryTemperatureDeciC',
    'availableBytes', 'deviceOwner', 'packageVersions', 'maintenanceExpiresAt',
  ]);
  for (const key of ['osVersion', 'securityPatch'] as const) {
    if (typeof details[key] !== 'string' || details[key].length > 80)
      throw new OperatorError('診断結果の文字列を確認できません。');
  }
  if (!Number.isSafeInteger(details.batteryStatus) ||
      !Number.isSafeInteger(details.batteryTemperatureDeciC) ||
      Number(details.batteryTemperatureDeciC) < -1000 ||
      Number(details.batteryTemperatureDeciC) > 2000 ||
      !Number.isSafeInteger(details.availableBytes) || Number(details.availableBytes) < 0 ||
      typeof details.deviceOwner !== 'boolean' ||
      !(details.maintenanceExpiresAt === null ||
        (Number.isSafeInteger(details.maintenanceExpiresAt) && Number(details.maintenanceExpiresAt) >= 0)))
    throw new OperatorError('診断結果の値を確認できません。');
  const versions = exactObject(details.packageVersions, [
    'dev.rock.operator.agent', 'dev.rock.automation', 'dev.rock.shell',
    'com.localactionassistant', 'dev.rock.tools.article',
  ]);
  for (const version of Object.values(versions)) {
    if (!Number.isSafeInteger(version) || Number(version) < 0)
      throw new OperatorError('package versionを確認できません。');
  }
  details.packageVersions = versions;
  const json = JSON.stringify(details);
  if (encoder.encode(json).byteLength > 2048)
    throw new OperatorError('診断結果が上限を超えています。', 413);
  return json;
}

export async function handleDeviceChannel(
  request: Request,
  db: D1Database,
  clock: () => number = Date.now,
) {
  if (request.method !== 'POST')
    throw new OperatorError('許可されていないHTTP methodです。', 405);
  const url = new URL(request.url);
  if (!['/api/device/v1/poll', '/api/device/v1/ack', '/api/device/v1/result'].includes(url.pathname) || url.search)
    throw new OperatorError('端末APIが見つかりません。', 404);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > 8192)
    throw new OperatorError('端末requestの長さを確認できません。', 413);
  const deviceId = uuid(header(request, 'X-Avocado-Device-Id'));
  const timestampText = header(request, 'X-Avocado-Device-Timestamp');
  const timestamp = Number(timestampText);
  const nonce = header(request, 'X-Avocado-Device-Nonce');
  if (!Number.isSafeInteger(timestamp) || Math.abs(clock() - timestamp) > 120_000 || !noncePattern.test(nonce))
    throw new OperatorError('端末requestの時刻またはnonceを確認できません。', 401);
  const signature = decodeBase64Url(
    header(request, 'X-Avocado-Device-Signature'), '端末署名', 256,
  );
  const device = await db.prepare(
    `SELECT status,trust_state AS trustState,device_public_key_spki AS publicKey,
      attestation_record_sha256 AS attestationRecordSha256
     FROM operator_managed_devices WHERE id=?`,
  ).bind(deviceId).first<{
    status: string; trustState: string; publicKey: string | null;
    attestationRecordSha256: string | null;
  }>();
  if (!device || device.status !== 'active' || device.trustState !== 'verified' ||
      !device.publicKey || !device.attestationRecordSha256)
    throw new OperatorError('登録済み端末を確認できません。', 403);
  const bodySha256 = encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', body)));
  const publicKey = await crypto.subtle.importKey(
    'spki', decodeBase64Url(device.publicKey, '端末公開鍵', 1024),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, ecdsaDerToRaw(signature),
    canonicalDeviceRequest(request.method, url.pathname, deviceId, timestampText, nonce, bodySha256),
  );
  if (!verified) throw new OperatorError('端末署名を確認できません。', 403);
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new OperatorError('端末requestのJSONを確認できません。');
  }
  const nonceInsert = db.prepare(
    `INSERT OR IGNORE INTO operator_device_request_nonces(device_id,nonce,used_at)
     VALUES(?,?,?) RETURNING nonce`,
  ).bind(deviceId, nonce, clock());
  const seen = await db.batch([
    nonceInsert,
    db.prepare(
      `UPDATE operator_managed_devices SET channel_state='connected',last_seen_at=?,updated_at=?
       WHERE id=? RETURNING id`,
    ).bind(clock(), clock(), deviceId),
    db.prepare(
      `DELETE FROM operator_device_request_nonces WHERE used_at<?`,
    ).bind(clock() - 86_400_000),
  ]);
  if (!seen[0].results.length)
    throw new OperatorError('端末requestの再送を拒否しました。', 409);

  if (url.pathname === '/api/device/v1/poll') {
    const parsed = exactObject(input, ['operation']);
    if (parsed.operation !== 'poll') throw new OperatorError('端末操作形式を確認できません。');
    const commands = await db.prepare(
      `SELECT id,device_id AS deviceId,incident_id AS incidentId,action,reason,status,
        issued_at AS issuedAt,not_before AS notBefore,expires_at AS expiresAt,
        operator_credential_id AS operatorCredentialId,
        authenticator_data AS authenticatorData,client_data_json AS clientDataJSON,
        operator_signature AS operatorSignature,signed_payload_sha256 AS signedPayloadSha256
       FROM operator_device_commands
       WHERE device_id=? AND (
         (status IN ('queued','scheduled') AND expires_at>?) OR
         (status='acknowledged' AND issued_at>?)
       )
         AND operator_credential_id IS NOT NULL
       ORDER BY issued_at,id LIMIT 10`,
    ).bind(deviceId, clock(), clock() - 86_400_000).all();
    return { status: 'ok', serverTime: clock(), commands: commands.results };
  }

  const parsed = exactObject(input,
    url.pathname.endsWith('/ack')
      ? ['operation', 'commandId']
      : ['operation', 'commandId', 'status', 'resultCode', 'details']);
  const commandId = uuid(parsed.commandId);
  if (url.pathname.endsWith('/ack')) {
    if (parsed.operation !== 'ack') throw new OperatorError('端末操作形式を確認できません。');
    const now = clock();
    const updated = await db.batch([
      db.prepare(
        `UPDATE operator_device_commands SET status='acknowledged',acknowledged_at=?
         WHERE id=? AND device_id=? AND status IN ('queued','scheduled')
           AND not_before<=? AND expires_at>?
         RETURNING id`,
      ).bind(now, commandId, deviceId, now, now),
      db.prepare(
        `INSERT OR IGNORE INTO operator_audit_events(
          id,device_id,command_id,actor_user_id,incident_id,event,details_json,created_at
        ) SELECT ?,device_id,id,?,incident_id,'command_acknowledged','{}',?
          FROM operator_device_commands WHERE id=? AND device_id=? AND status='acknowledged'`,
      ).bind(`${commandId}:acknowledged`, `device:${deviceId}`, now, commandId, deviceId),
    ]);
    if (updated[0].results.length)
      return { status: 'acknowledged', commandId, replay: false };
    const existing = await db.prepare(
      `SELECT status FROM operator_device_commands WHERE id=? AND device_id=?`,
    ).bind(commandId, deviceId).first<{ status: string }>();
    if (existing?.status === 'acknowledged')
      return { status: 'acknowledged', commandId, replay: true };
    throw new OperatorError('命令を受領状態へ変更できません。', 409);
  }

  if (parsed.operation !== 'result' ||
      (parsed.status !== 'completed' && parsed.status !== 'failed') ||
      typeof parsed.resultCode !== 'string' || !resultPattern.test(parsed.resultCode))
    throw new OperatorError('端末結果を確認できません。');
  const resultStatus = parsed.status;
  const resultCode = parsed.resultCode;
  const detailsJson = safeDetails(parsed.details);
  const now = clock();
  const completed = await db.batch([
    db.prepare(
      `UPDATE operator_device_commands SET status=?,completed_at=?,result_code=?
       WHERE id=? AND device_id=? AND status='acknowledged' RETURNING id`,
    ).bind(resultStatus, now, resultCode, commandId, deviceId),
    db.prepare(
      `INSERT OR IGNORE INTO operator_audit_events(
        id,device_id,command_id,actor_user_id,incident_id,event,details_json,created_at
      ) SELECT ?,device_id,id,?,incident_id,?,?,?
        FROM operator_device_commands WHERE id=? AND device_id=? AND status=?`,
    ).bind(`${commandId}:result`, `device:${deviceId}`, `command_${resultStatus}`,
      detailsJson, now, commandId, deviceId, resultStatus),
  ]);
  if (completed[0].results.length)
    return { status: resultStatus, commandId, replay: false };
  const existing = await db.prepare(
    `SELECT status,result_code AS resultCode FROM operator_device_commands
     WHERE id=? AND device_id=?`,
  ).bind(commandId, deviceId).first<{ status: string; resultCode: string | null }>();
  if (existing && existing.status === resultStatus && existing.resultCode === resultCode)
    return { status: resultStatus, commandId, replay: true };
  throw new OperatorError('命令結果を保存できません。', 409);
}
