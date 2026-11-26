/**
 * Read-only maintenance guidance for an explicitly supplied mock device state.
 *
 * This module deliberately has no process, filesystem, network, USB, or device
 * integration. It is a small boundary object that lets Noah explain a known
 * state without pretending that a repair or a real-device check happened.
 */

export const NOAH_HARDWARE_MAINTENANCE_SCHEMA =
  'noah.hardware-maintenance/1' as const;

export const NOAH_HARDWARE_FAMILIES = [
  { id: 'drone', label: 'ドローン' },
  { id: '3d-printer', label: '3Dプリンター' },
  { id: 'camera', label: 'カメラ' },
  { id: 'external-storage', label: '外付けストレージ' },
  { id: 'usb-audio-midi', label: 'USBオーディオ・MIDI' },
  { id: 'usb-dock-display', label: 'USBドック・画面' },
  { id: 'keyboard-controller', label: 'キーボード・コントローラー' },
  { id: 'smartphone-tablet', label: 'スマホ・タブレット' },
  { id: 'printer-scanner', label: 'プリンター・スキャナー' },
  { id: 'router-nas', label: 'ルーター・NAS' },
  { id: 'embedded-board', label: '組み込み基板' },
  { id: 'unclassified-device', label: '未対応機器' },
] as const;

const CONNECTION_KINDS = [
  'usb',
  'network',
  'bluetooth',
  'file',
  'api',
  'unknown',
] as const;
const CONNECTION_STATES = [
  'connected',
  'disconnected',
  'permission-required',
  'unknown',
] as const;
const OPERATION_STATES = ['idle', 'busy', 'blocked', 'error', 'unknown'] as const;
const CONSUMABLE_STATES = ['ok', 'low', 'empty', 'unknown'] as const;

type ConnectionKind = (typeof CONNECTION_KINDS)[number];
type ConnectionState = (typeof CONNECTION_STATES)[number];
type OperationState = (typeof OPERATION_STATES)[number];
type ConsumableState = (typeof CONSUMABLE_STATES)[number];
type DeviceFamily = (typeof NOAH_HARDWARE_FAMILIES)[number]['id'];

export type NoahHardwareMaintenanceInput = {
  schema: typeof NOAH_HARDWARE_MAINTENANCE_SCHEMA;
  deviceFamily: DeviceFamily;
  connection: {
    kind: ConnectionKind;
    state: ConnectionState;
  };
  operationState: OperationState;
  consumables: readonly {
    name: string;
    levelPercent: number;
    state: ConsumableState;
  }[];
  /** A short human note is accepted for fixture parity but never echoed. */
  statusDetail?: string;
};

export type NoahHardwareMaintenanceSummary = {
  schema: typeof NOAH_HARDWARE_MAINTENANCE_SCHEMA;
  agent: 'noah-local-device-maintenance';
  source: 'mock-state-json';
  evidence: 'mock-state-json';
  status: 'ready' | 'attention' | 'unknown';
  deviceWrites: 0;
  externalCalls: 0;
  deviceFamily: DeviceFamily;
  deviceFamilyLabel: string;
  connection: {
    kind: ConnectionKind;
    state: ConnectionState;
  };
  operationState: OperationState;
  consumables: readonly {
    name: string;
    levelPercent: number;
    state: ConsumableState;
  }[];
  findings: readonly string[];
  nextChecks: readonly string[];
};

const INPUT_KEYS = new Set([
  'schema',
  'deviceFamily',
  'connection',
  'operationState',
  'consumables',
  'statusDetail',
]);
const CONNECTION_KEYS = new Set(['kind', 'state']);
const CONSUMABLE_KEYS = new Set(['name', 'levelPercent', 'state']);

// Unknown keys are rejected as a second line of defence. This list also keeps
// identifiers, credentials, paths, and addresses out of a fixture by design.
const SENSITIVE_TEXT =
  /(?:\bserial(?:[-_ ]?number)?\b|\buuid\b|\btoken\b|\bsecret\b|\bpassword\b|\bcredential\b|\bssid\b|\b(?:mac|ip)[-_ ]?address\b|\bdevice[-_ ]?id\b|\bidentifier\b)/i;
const SAFE_LABEL = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(
        `${label} に未対応の項目があります。識別子・認証情報・パスは入力しないでください。`,
      );
    }
  }
}

function readEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${label} は許可された状態名から選んでください。`);
  }
  return value as T;
}

function readSafeLabel(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !SAFE_LABEL.test(value) ||
    SENSITIVE_TEXT.test(value)
  ) {
    throw new Error(
      `${label} は英小文字・数字・.-_ の安全な表示名だけを指定してください。`,
    );
  }
  return value;
}

function readStatusDetail(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let hasControlCharacter = false;
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 0x20 || code === 0x7f) {
        hasControlCharacter = true;
        break;
      }
    }
  }
  if (
    typeof value !== 'string' ||
    value.length > 160 ||
    hasControlCharacter ||
    SENSITIVE_TEXT.test(value)
  ) {
    throw new Error(
      'statusDetail は識別子を含まない160文字以内の短い説明にしてください。',
    );
  }
  return value;
}

function parseInput(jsonText: string): NoahHardwareMaintenanceInput {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    throw new Error('模擬状態JSONを入力してください。');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('模擬状態JSONを読み取れません。JSON形式を確認してください。');
  }
  if (!isRecord(parsed)) {
    throw new Error('模擬状態JSONの最上位はオブジェクトにしてください。');
  }
  assertAllowedKeys(parsed, INPUT_KEYS, '入力');
  if (parsed.schema !== NOAH_HARDWARE_MAINTENANCE_SCHEMA) {
    throw new Error(`schema は ${NOAH_HARDWARE_MAINTENANCE_SCHEMA} にしてください。`);
  }

  const family = readEnum(
    parsed.deviceFamily,
    NOAH_HARDWARE_FAMILIES.map(({ id }) => id) as DeviceFamily[],
    'deviceFamily',
  ) as DeviceFamily;
  if (!isRecord(parsed.connection)) {
    throw new Error('connection は kind と state を持つオブジェクトにしてください。');
  }
  assertAllowedKeys(parsed.connection, CONNECTION_KEYS, 'connection');
  const connection = {
    kind: readEnum(parsed.connection.kind, CONNECTION_KINDS, 'connection.kind'),
    state: readEnum(parsed.connection.state, CONNECTION_STATES, 'connection.state'),
  };
  const operationState = readEnum(
    parsed.operationState,
    OPERATION_STATES,
    'operationState',
  );

  if (parsed.consumables !== undefined && !Array.isArray(parsed.consumables)) {
    throw new Error('consumables は配列にしてください。');
  }
  const rawConsumables = (
    parsed.consumables === undefined ? [] : parsed.consumables
  ) as unknown[];
  const consumables = rawConsumables.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`consumables[${index}] はオブジェクトにしてください。`);
    }
    assertAllowedKeys(item, CONSUMABLE_KEYS, `consumables[${index}]`);
    if (
      typeof item.levelPercent !== 'number' ||
      !Number.isInteger(item.levelPercent) ||
      item.levelPercent < 0 ||
      item.levelPercent > 100
    ) {
      throw new Error(`consumables[${index}].levelPercent は0から100の整数にしてください。`);
    }
    return {
      name: readSafeLabel(item.name, `consumables[${index}].name`),
      levelPercent: item.levelPercent,
      state: readEnum(item.state, CONSUMABLE_STATES, `consumables[${index}].state`),
    };
  });
  readStatusDetail(parsed.statusDetail);

  return {
    schema: NOAH_HARDWARE_MAINTENANCE_SCHEMA,
    deviceFamily: family,
    connection,
    operationState,
    consumables,
    ...(parsed.statusDetail === undefined ? {} : { statusDetail: parsed.statusDetail as string }),
  };
}

function familyLabel(family: DeviceFamily): string {
  return NOAH_HARDWARE_FAMILIES.find(({ id }) => id === family)?.label ?? '未対応機器';
}

export function summarizeNoahHardwareState(
  jsonText: string,
): NoahHardwareMaintenanceSummary {
  const input = parseInput(jsonText);
  const findings: string[] = [];
  const nextChecks: string[] = [
    '表示された状態を、本人が同じ機器の公式アプリまたは表示で照合してください。',
    'この結果から再接続・設定変更・修理・ファームウェア更新は行いません。',
  ];
  let hasAttention = false;
  let hasUnknown = false;

  if (input.connection.state === 'disconnected') {
    hasAttention = true;
    findings.push('接続が切断されています。');
    nextChecks.unshift('ケーブル・電源・本人が許可した接続先を確認してください。');
  } else if (input.connection.state === 'permission-required') {
    hasAttention = true;
    findings.push('接続には本人の許可が必要です。');
    nextChecks.unshift('許可を求める画面が本人の操作で表示されているか確認してください。');
  } else if (input.connection.state === 'unknown' || input.connection.kind === 'unknown') {
    hasUnknown = true;
    findings.push('接続状態を判定できません。');
    nextChecks.unshift('接続種別と状態を、識別子を含めずに再確認してください。');
  } else {
    findings.push('接続状態は模擬入力上で接続済みです。');
  }

  if (input.operationState === 'blocked' || input.operationState === 'error') {
    hasAttention = true;
    findings.push(
      input.operationState === 'blocked'
        ? '機器の操作状態は停止または待機が必要です。'
        : '機器の操作状態はエラーです。',
    );
    nextChecks.unshift('公式の状態表示と安全な再試行条件を本人が確認してください。');
  } else if (input.operationState === 'busy') {
    hasAttention = true;
    findings.push('機器は使用中のため、状態が落ち着くまで待機してください。');
  } else if (input.operationState === 'unknown') {
    hasUnknown = true;
    findings.push('操作状態を判定できません。');
  } else {
    findings.push('操作状態は模擬入力上で待機中です。');
  }

  for (const consumable of input.consumables) {
    if (consumable.state === 'empty' || consumable.state === 'low') {
      hasAttention = true;
      findings.push(`${consumable.name} の残量表示は ${consumable.state} です。`);
      nextChecks.unshift('交換・補充は機器の公式手順と本人の確認後に行ってください。');
    } else if (consumable.state === 'unknown') {
      hasUnknown = true;
      findings.push(`${consumable.name} の残量状態を判定できません。`);
    }
  }

  return {
    schema: NOAH_HARDWARE_MAINTENANCE_SCHEMA,
    agent: 'noah-local-device-maintenance',
    source: 'mock-state-json',
    evidence: 'mock-state-json',
    status: hasAttention ? 'attention' : hasUnknown ? 'unknown' : 'ready',
    deviceWrites: 0,
    externalCalls: 0,
    deviceFamily: input.deviceFamily,
    deviceFamilyLabel: familyLabel(input.deviceFamily),
    connection: input.connection,
    operationState: input.operationState,
    consumables: input.consumables,
    findings,
    nextChecks,
  };
}

export function formatNoahHardwareMaintenance(jsonText: string): string {
  return JSON.stringify(summarizeNoahHardwareState(jsonText), null, 2);
}
