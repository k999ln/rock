import { exactObject, OperatorError, uuid } from './validation.ts';
import {
  commandChallenge,
  encodeBase64Url,
  type OperatorAssertion,
  type OperatorCredentialConfig,
  type SignedCommandFields,
  verifyOperatorAssertion,
} from './operator-webauthn.ts';

export const EMERGENCY_ACTIONS = [
  'lock_device',
  'enter_lost_mode',
  'stop_sky_and_zema_execution',
  'revoke_active_sessions',
  'pause_ota_installation',
  'quarantine_external_connections',
  'collect_sanitized_diagnostics',
  'open_limited_maintenance_session',
  'resume_sky_and_zema_execution',
  'resume_ota_installation',
  'release_external_quarantine',
  'close_limited_maintenance_session',
  'exit_lost_mode',
  'request_factory_reset',
] as const;

export type EmergencyAction = (typeof EMERGENCY_ACTIONS)[number];

export type OperatorManagedDevice = {
  id: string;
  displayName: string;
  platform: string;
  model: string;
  osVersion: string;
  status: string;
  trustState: string;
  channelState: string;
  keyFingerprint: string | null;
  lastSeenAt: number | null;
  updatedAt: number;
  online: boolean;
};

export type OperatorDeviceCommand = {
  id: string;
  deviceId: string;
  incidentId: string;
  action: EmergencyAction;
  reason: string;
  status: string;
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
  acknowledgedAt: number | null;
  completedAt: number | null;
  resultCode: string | null;
};

const deviceColumns = `id,display_name AS displayName,platform,model,
  os_version AS osVersion,status,trust_state AS trustState,
  channel_state AS channelState,key_fingerprint AS keyFingerprint,
  last_seen_at AS lastSeenAt,updated_at AS updatedAt`;
const commandColumns = `id,device_id AS deviceId,incident_id AS incidentId,
  action,reason,status,issued_at AS issuedAt,not_before AS notBefore,
  expires_at AS expiresAt,acknowledged_at AS acknowledgedAt,
  completed_at AS completedAt,result_code AS resultCode`;

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'string')
    throw new OperatorError(`${label}を入力してください。`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum)
    throw new OperatorError(`${label}の長さを確認してください。`);
  return normalized;
}

function incidentId(value: unknown) {
  const normalized = boundedText(value, '事故ID', 3, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized))
    throw new OperatorError('事故IDの形式を確認してください。');
  return normalized;
}

function action(value: unknown): EmergencyAction {
  if (!EMERGENCY_ACTIONS.includes(value as EmergencyAction))
    throw new OperatorError('許可されていない緊急操作です。');
  return value as EmergencyAction;
}

export function operatorControl(
  db: D1Database,
  authenticatedOperatorSub: string,
  configuredOperatorSub: string,
  clock: () => number = Date.now,
  operatorCredential?: OperatorCredentialConfig,
) {
  if (!configuredOperatorSub)
    throw new OperatorError('運営管理者の設定が完了していません。', 503);
  if (authenticatedOperatorSub !== configuredOperatorSub)
    throw new OperatorError('運営管理者だけが利用できます。', 403);

  const statement = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);

  async function getCommand(id: string) {
    return statement(
      `SELECT ${commandColumns} FROM operator_device_commands
       WHERE id=? AND operator_user_id=?`,
      id,
      authenticatedOperatorSub,
    ).first<OperatorDeviceCommand>();
  }

  async function overview() {
    const now = clock();
    const [devices, commands, audit] = await Promise.all([
      statement(
        `SELECT ${deviceColumns} FROM operator_managed_devices
         ORDER BY COALESCE(last_seen_at,0) DESC,created_at DESC LIMIT 100`,
      ).all<Omit<OperatorManagedDevice, 'online'>>(),
      statement(
        `SELECT ${commandColumns} FROM operator_device_commands
         WHERE operator_user_id=? ORDER BY issued_at DESC,id DESC LIMIT 100`,
        authenticatedOperatorSub,
      ).all<OperatorDeviceCommand>(),
      statement(
        `SELECT id,device_id AS deviceId,command_id AS commandId,
          incident_id AS incidentId,event,details_json AS detailsJson,
          created_at AS createdAt
         FROM operator_audit_events ORDER BY created_at DESC,id DESC LIMIT 100`,
      ).all(),
    ]);
    return {
      controlPlane: 'ready',
      deviceAgent: 'source_emulator_verified_production_enrollment_pending',
      operatorAccess: true,
      devices: devices.results.map((device) => ({
        ...device,
        online:
          device.status === 'active' &&
          device.channelState === 'connected' &&
          device.lastSeenAt !== null &&
          device.lastSeenAt > now - 90_000,
      })),
      commands: commands.results,
      audit: audit.results,
    };
  }

  function commandInput(value: unknown, operation: 'prepare' | 'issue') {
    const input = exactObject(value, [
      'operation',
      'id',
      'deviceId',
      'incidentId',
      'action',
      'reason',
      ...(operation === 'issue'
        ? ['issuedAt', 'notBefore', 'expiresAt', 'assertion']
        : []),
    ]);
    if (input.operation !== operation)
      throw new OperatorError('操作形式を確認してください。');
    const id = uuid(input.id);
    const deviceId = uuid(input.deviceId);
    const requestedAction = action(input.action);
    const requestedIncidentId = incidentId(input.incidentId);
    const reason = boundedText(input.reason, '理由', 5, 240);
    return { input, id, deviceId, requestedAction, requestedIncidentId, reason };
  }

  async function verifiedDevice(deviceId: string) {
    const device = await statement(
      `SELECT id,status,trust_state AS trustState,key_fingerprint AS keyFingerprint,
        attestation_record_sha256 AS attestationRecordSha256
       FROM operator_managed_devices WHERE id=?`,
      deviceId,
    ).first<{
      id: string;
      status: string;
      trustState: string;
      keyFingerprint: string | null;
      attestationRecordSha256: string | null;
    }>();
    if (!device) throw new OperatorError('登録端末が見つかりません。', 404);
    if (device.status !== 'active' || device.trustState !== 'verified' ||
        !device.keyFingerprint || !device.attestationRecordSha256)
      throw new OperatorError('端末のhardware identity確認が完了していません。', 409);
    return device;
  }

  async function prepare(value: unknown) {
    if (!operatorCredential)
      throw new OperatorError('運営hardware credentialが設定されていません。', 503);
    const { id, deviceId, requestedAction, requestedIncidentId, reason } =
      commandInput(value, 'prepare');
    await verifiedDevice(deviceId);
    const issuedAt = clock();
    const reset = requestedAction === 'request_factory_reset';
    const draft: SignedCommandFields = {
      id, deviceId, incidentId: requestedIncidentId, action: requestedAction, reason,
      issuedAt,
      notBefore: reset ? issuedAt + 30 * 60_000 : issuedAt,
      expiresAt: reset ? issuedAt + 60 * 60_000 : issuedAt + 15 * 60_000,
    };
    return {
      draft,
      publicKeyRequest: {
        challenge: encodeBase64Url(await commandChallenge(draft)),
        credentialId: operatorCredential.credentialId,
        rpId: operatorCredential.rpId,
        timeout: 60_000,
        userVerification: 'required',
      },
    };
  }

  async function issue(value: unknown) {
    if (!operatorCredential)
      throw new OperatorError('運営hardware credentialが設定されていません。', 503);
    const { input, id, deviceId, requestedAction, requestedIncidentId, reason } =
      commandInput(value, 'issue');
    const issuedAt = Number(input.issuedAt);
    const notBefore = Number(input.notBefore);
    const expiresAt = Number(input.expiresAt);
    if (![issuedAt, notBefore, expiresAt].every(Number.isSafeInteger))
      throw new OperatorError('命令時刻を確認できません。');
    const now = clock();
    const reset = requestedAction === 'request_factory_reset';
    if (issuedAt < now - 2 * 60_000 || issuedAt > now + 30_000 ||
        notBefore !== (reset ? issuedAt + 30 * 60_000 : issuedAt) ||
        expiresAt !== (reset ? issuedAt + 60 * 60_000 : issuedAt + 15 * 60_000))
      throw new OperatorError('命令の有効時間を確認できません。', 409);
    const assertionInput = exactObject(input.assertion, [
      'credentialId', 'authenticatorData', 'clientDataJSON', 'signature',
    ]);
    for (const key of ['credentialId', 'authenticatorData', 'clientDataJSON', 'signature'] as const) {
      if (typeof assertionInput[key] !== 'string')
        throw new OperatorError('運営credential assertionを確認できません。');
    }
    const assertion: OperatorAssertion = {
      credentialId: assertionInput.credentialId as string,
      authenticatorData: assertionInput.authenticatorData as string,
      clientDataJSON: assertionInput.clientDataJSON as string,
      signature: assertionInput.signature as string,
    };
    const signed: SignedCommandFields = {
      id, deviceId, incidentId: requestedIncidentId, action: requestedAction,
      reason, issuedAt, notBefore, expiresAt,
    };
    const existing = await getCommand(id);
    if (existing) {
      if (
        existing.deviceId !== deviceId ||
        existing.incidentId !== requestedIncidentId ||
        existing.action !== requestedAction ||
        existing.reason !== reason || existing.issuedAt !== issuedAt ||
        existing.notBefore !== notBefore || existing.expiresAt !== expiresAt
      )
        throw new OperatorError(
          '同じ操作IDで異なる緊急命令は作成できません。',
          409,
        );
      return { command: existing, replay: true };
    }
    await verifiedDevice(deviceId);
    const verified = await verifyOperatorAssertion(signed, assertion, operatorCredential);
    const authState = verified.signCount === 0
      ? statement(`SELECT ? AS credential_id`, assertion.credentialId)
      : statement(
          `INSERT OR IGNORE INTO operator_webauthn_assertions(
            credential_id,sign_count,command_id,used_at)
           SELECT ?,?,?,? WHERE ?>COALESCE((
             SELECT MAX(sign_count) FROM operator_webauthn_assertions
             WHERE credential_id=?
           ),0)`,
          assertion.credentialId, verified.signCount, id, now,
          verified.signCount, assertion.credentialId,
        );
    const counterCondition = verified.signCount === 0
      ? ''
      : ` AND EXISTS(SELECT 1 FROM operator_webauthn_assertions
          WHERE credential_id=? AND sign_count=? AND command_id=?)`;
    const inserted = await db.batch([
      authState,
      statement(
        `INSERT OR IGNORE INTO operator_device_commands(
          id,device_id,operator_user_id,incident_id,action,reason,status,
          issued_at,not_before,expires_at,operator_credential_id,
          authenticator_data,client_data_json,operator_signature,signed_payload_sha256
        ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          WHERE 1=1${counterCondition} RETURNING id`,
        id,
        deviceId,
        authenticatedOperatorSub,
        requestedIncidentId,
        requestedAction,
        reason,
        reset ? 'scheduled' : 'queued',
        issuedAt,
        notBefore,
        expiresAt,
        assertion.credentialId,
        assertion.authenticatorData,
        assertion.clientDataJSON,
        assertion.signature,
        verified.payloadSha256,
        ...(verified.signCount === 0
          ? []
          : [assertion.credentialId, verified.signCount, id]),
      ),
      statement(
        `INSERT OR IGNORE INTO operator_audit_events(
          id,device_id,command_id,actor_user_id,incident_id,event,
          details_json,created_at
        ) SELECT ?,device_id,id,operator_user_id,incident_id,?,?,?
          FROM operator_device_commands
          WHERE id=? AND operator_user_id=? AND device_id=?
            AND incident_id=? AND action=? AND reason=?`,
        `${id}:issued`,
        'command_issued',
        JSON.stringify({ action: requestedAction, expiresAt, notBefore }),
        now,
        id,
        authenticatedOperatorSub,
        deviceId,
        requestedIncidentId,
        requestedAction,
        reason,
      ),
    ]);
    if (!inserted[1].results.length) {
      const collision = await getCommand(id);
      if (collision) return { command: collision, replay: true };
      throw new OperatorError('credential counterまたは緊急命令を保存できませんでした。', 409);
    }
    return { command: (await getCommand(id))!, replay: false };
  }

  async function cancel(value: unknown) {
    const input = exactObject(value, ['operation', 'id', 'incidentId']);
    if (input.operation !== 'cancel')
      throw new OperatorError('操作形式を確認してください。');
    const id = uuid(input.id);
    const requestedIncidentId = incidentId(input.incidentId);
    const before = await getCommand(id);
    if (!before) throw new OperatorError('緊急命令が見つかりません。', 404);
    if (before.incidentId !== requestedIncidentId)
      throw new OperatorError('事故IDが一致しません。', 409);
    if (before.status === 'cancelled') return { command: before, replay: true };
    const now = clock();
    const result = await db.batch([
      statement(
        `UPDATE operator_device_commands SET status='cancelled'
         WHERE id=? AND operator_user_id=?
           AND status IN ('queued','scheduled')
           AND acknowledged_at IS NULL RETURNING id`,
        id,
        authenticatedOperatorSub,
      ),
      statement(
        `INSERT OR IGNORE INTO operator_audit_events(
          id,device_id,command_id,actor_user_id,incident_id,event,
          details_json,created_at
        ) SELECT ?,device_id,id,operator_user_id,incident_id,
          'command_cancelled','{}',? FROM operator_device_commands
          WHERE id=? AND operator_user_id=? AND status='cancelled'`,
        `${id}:cancelled`,
        now,
        id,
        authenticatedOperatorSub,
      ),
    ]);
    if (!result[0].results.length)
      throw new OperatorError(
        '端末が受領済みの命令は取り消せません。履歴を更新してください。',
        409,
      );
    return { command: (await getCommand(id))!, replay: false };
  }

  return { overview, prepare, issue, cancel };
}
