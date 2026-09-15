import { OperationError, object, uuid } from './operations.ts';

export const EMERGENCY_ACTIONS = [
  'lock_device',
  'enter_lost_mode',
  'stop_sky_and_zema_execution',
  'revoke_active_sessions',
  'pause_ota_installation',
  'quarantine_external_connections',
  'collect_sanitized_diagnostics',
  'open_limited_maintenance_session',
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

function text(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'string')
    throw new OperationError(`${label}を入力してください。`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum)
    throw new OperationError(`${label}の長さを確認してください。`);
  return normalized;
}

function incidentId(value: unknown) {
  const normalized = text(value, '事故ID', 3, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized))
    throw new OperationError('事故IDの形式を確認してください。');
  return normalized;
}

function action(value: unknown): EmergencyAction {
  if (!EMERGENCY_ACTIONS.includes(value as EmergencyAction))
    throw new OperationError('許可されていない緊急操作です。');
  return value as EmergencyAction;
}

export function operatorControl(
  db: D1Database,
  authenticatedUserId: string,
  configuredOperatorUserId: string,
  clock: () => number = Date.now,
) {
  if (!configuredOperatorUserId)
    throw new OperationError('運営管理者の設定が完了していません。', 503);
  if (authenticatedUserId !== configuredOperatorUserId)
    throw new OperationError('運営管理者だけが利用できます。', 403);

  const statement = (sql: string, ...args: (string | number | null)[]) =>
    db.prepare(sql).bind(...args);

  async function getCommand(id: string) {
    return statement(
      `SELECT ${commandColumns} FROM operator_device_commands
       WHERE id=? AND operator_user_id=?`,
      id,
      authenticatedUserId,
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
        authenticatedUserId,
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
      deviceAgent: 'not_implemented',
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

  async function issue(value: unknown) {
    const input = object(value, [
      'operation',
      'id',
      'deviceId',
      'incidentId',
      'action',
      'reason',
    ]);
    if (input.operation !== 'issue')
      throw new OperationError('操作形式を確認してください。');
    const id = uuid(input.id);
    const deviceId = uuid(input.deviceId);
    const requestedAction = action(input.action);
    const requestedIncidentId = incidentId(input.incidentId);
    const reason = text(input.reason, '理由', 5, 240);
    const existing = await getCommand(id);
    if (existing) {
      if (
        existing.deviceId !== deviceId ||
        existing.incidentId !== requestedIncidentId ||
        existing.action !== requestedAction ||
        existing.reason !== reason
      )
        throw new OperationError(
          '同じ操作IDで異なる緊急命令は作成できません。',
          409,
        );
      return { command: existing, replay: true };
    }
    const device = await statement(
      `SELECT id,status,trust_state AS trustState,key_fingerprint AS keyFingerprint
       FROM operator_managed_devices WHERE id=?`,
      deviceId,
    ).first<{
      id: string;
      status: string;
      trustState: string;
      keyFingerprint: string | null;
    }>();
    if (!device) throw new OperationError('登録端末が見つかりません。', 404);
    if (
      device.status !== 'active' ||
      device.trustState !== 'verified' ||
      !device.keyFingerprint
    )
      throw new OperationError(
        '端末のhardware identity確認が完了していません。',
        409,
      );
    const now = clock();
    const isReset = requestedAction === 'request_factory_reset';
    const notBefore = isReset ? now + 30 * 60_000 : now;
    const expiresAt = isReset ? now + 60 * 60_000 : now + 15 * 60_000;
    const inserted = await db.batch([
      statement(
        `INSERT OR IGNORE INTO operator_device_commands(
          id,device_id,operator_user_id,incident_id,action,reason,status,
          issued_at,not_before,expires_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        id,
        deviceId,
        authenticatedUserId,
        requestedIncidentId,
        requestedAction,
        reason,
        isReset ? 'scheduled' : 'queued',
        now,
        notBefore,
        expiresAt,
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
        authenticatedUserId,
        deviceId,
        requestedIncidentId,
        requestedAction,
        reason,
      ),
    ]);
    if (!inserted[0].results.length) {
      const collision = await getCommand(id);
      if (collision) return issue(value);
      throw new OperationError('緊急命令を保存できませんでした。', 409);
    }
    return { command: (await getCommand(id))!, replay: false };
  }

  async function cancel(value: unknown) {
    const input = object(value, ['operation', 'id', 'incidentId']);
    if (input.operation !== 'cancel')
      throw new OperationError('操作形式を確認してください。');
    const id = uuid(input.id);
    const requestedIncidentId = incidentId(input.incidentId);
    const before = await getCommand(id);
    if (!before) throw new OperationError('緊急命令が見つかりません。', 404);
    if (before.incidentId !== requestedIncidentId)
      throw new OperationError('事故IDが一致しません。', 409);
    if (before.status === 'cancelled') return { command: before, replay: true };
    const now = clock();
    const result = await db.batch([
      statement(
        `UPDATE operator_device_commands SET status='cancelled'
         WHERE id=? AND operator_user_id=?
           AND status IN ('queued','scheduled')
           AND acknowledged_at IS NULL RETURNING id`,
        id,
        authenticatedUserId,
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
        authenticatedUserId,
      ),
    ]);
    if (!result[0].results.length)
      throw new OperationError(
        '端末が受領済みの命令は取り消せません。履歴を更新してください。',
        409,
      );
    return { command: (await getCommand(id))!, replay: false };
  }

  return { overview, issue, cancel };
}
