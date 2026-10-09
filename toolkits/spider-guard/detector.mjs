// Shared deterministic guard. No I/O, telemetry, persistence, or raw values in findings.
export const MAX_INSPECTION_CHARACTERS = 256_000;
export const MAX_TEXT_LENGTH = MAX_INSPECTION_CHARACTERS;
const MAX_NODES = 10_000;
const MAX_DEPTH = 20;
const MAX_FINDINGS = 2_000;
const MASK = '[機密情報を非表示]';

export class SensitiveDataBlockedError extends Error {
  constructor(count = 0, kinds = []) {
    super('SENSITIVE_DATA_BLOCKED');
    this.name = 'SensitiveDataBlockedError';
    this.code = 'SENSITIVE_DATA_BLOCKED';
    this.status = 422;
    this.count = count;
    this.kinds = [...new Set(kinds)]
      .filter((kind) => kind === 'secret' || kind === 'personal')
      .sort((a, b) => a.localeCompare(b));
  }
}

function secretLabel(key) {
  const name = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/(?:apikey)$/.test(name)) return 'APIキー';
  if (name.endsWith('token') || name === 'authorization')
    return 'アクセストークン';
  if (/(?:password|passwd|pwd)$/.test(name)) return 'パスワード';
  if (name.endsWith('privatekey')) return '秘密鍵';
  if (/(?:secret|secretkey|secretaccesskey)$/.test(name)) return 'シークレット';
  return null;
}

function isLuhn(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits))
    return false;
  let sum = 0;
  for (
    let index = digits.length - 1, double = false;
    index >= 0;
    index--, double = !double
  ) {
    let digit = Number(digits[index]);
    if (double) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Offsets are UTF-16 string offsets in the original unmodified text. */
export function detectSensitiveData(text) {
  if (typeof text !== 'string' || text.length > MAX_INSPECTION_CHARACTERS)
    throw new SensitiveDataBlockedError();
  const candidates = [];
  function add(start, end, kind, label, severity, priority) {
    if (end <= start) return;
    if (candidates.length >= MAX_FINDINGS)
      throw new SensitiveDataBlockedError();
    candidates.push({ start, end, kind, label, severity, priority });
  }
  function matches(expression, visit) {
    for (const match of text.matchAll(expression)) visit(match);
  }
  matches(
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|$)/g,
    (m) => {
      add(m.index, m.index + m[0].length, 'secret', '秘密鍵', 'critical', 100);
    },
  );
  matches(
    /\b([A-Za-z_][A-Za-z0-9_.-]{0,100})["']?[ \t]*[:=][ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s,;#}"'`]+))/g,
    (m) => {
      const label = secretLabel(m[1]);
      if (!label) return;
      const value = m[2] ?? m[3] ?? m[4] ?? m[5];
      if (!value || value === MASK) return;
      if (
        m[5] !== undefined &&
        /^(?:process\.env\.|import\.meta\.env\.|os\.environ|undefined$|null$|[A-Za-z_$][\w$]*\()/.test(
          value,
        )
      )
        return;
      const start = m.index + m[0].lastIndexOf(value);
      add(start, start + value.length, 'secret', label, 'critical', 90);
    },
  );
  const tokenPatterns = [
    /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{30,255}\b/g,
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,512}\b/g,
    /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{15,255}\b/g,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,1024}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{10,1024}\b/g,
    /\bBearer[ \t]+[A-Za-z0-9_.~+/-]{16,1024}={0,2}/gi,
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]{1,100}:[^\s@/]{1,500}@[^\s"']+/gi,
  ];
  for (const expression of tokenPatterns)
    matches(expression, (m) => {
      add(
        m.index,
        m.index + m[0].length,
        'secret',
        '認証トークン候補',
        'critical',
        80,
      );
    });
  matches(
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi,
    (m) => {
      if (/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]/i.test(text.charAt(m.index - 1)))
        return;
      add(
        m.index,
        m.index + m[0].length,
        'personal',
        'メールアドレス',
        'medium',
        40,
      );
    },
  );
  matches(/\+?\d(?:[\d -]*\d)?/g, (m) => {
    const start = m.index,
      end = start + m[0].length;
    if (/\w/.test(text.charAt(start - 1)) || /\w/.test(text.charAt(end)))
      return;
    const digits = m[0].replace(/\D/g, '');
    if (!m[0].startsWith('+') && isLuhn(m[0]))
      add(start, end, 'personal', 'カード番号候補', 'high', 60);
    else if (
      /^0[1-9]\d{8,9}$/.test(digits) ||
      (m[0].startsWith('+81') && /^81[1-9]\d{8,9}$/.test(digits))
    )
      add(start, end, 'personal', '電話番号候補', 'high', 50);
  });
  candidates.sort(
    (a, b) => b.priority - a.priority || a.start - b.start || b.end - a.end,
  );
  const accepted = [];
  for (const candidate of candidates) {
    if (
      !accepted.some(
        (other) => candidate.start < other.end && other.start < candidate.end,
      )
    )
      accepted.push(candidate);
  }
  return accepted
    .sort((a, b) => a.start - b.start)
    .map(({ priority: _priority, ...finding }, index) => ({
      id: `${finding.kind}-${index}-${finding.start}`,
      ...finding,
    }));
}

export function redactSensitiveData(
  text,
  findings = detectSensitiveData(text),
) {
  if (
    typeof text !== 'string' ||
    text.length > MAX_INSPECTION_CHARACTERS ||
    !Array.isArray(findings)
  )
    throw new SensitiveDataBlockedError();
  const spans = findings
    .map(({ start, end }) => {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end > text.length ||
        end <= start
      )
        throw new SensitiveDataBlockedError();
      return { start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let result = '',
    cursor = 0;
  for (const span of spans) {
    if (span.start >= cursor) result += text.slice(cursor, span.start) + MASK;
    cursor = Math.max(cursor, span.end);
  }
  return result + text.slice(cursor);
}

/** Fail-closed inspection of JSON payloads; credentials used by transports are excluded by callers. */
export function assertSafeOutbound(value) {
  let characters = 0,
    nodes = 0,
    count = 0;
  const kinds = new Set();
  const ancestors = new Set();
  function inspectText(text) {
    characters += text.length;
    if (characters > MAX_INSPECTION_CHARACTERS)
      throw new SensitiveDataBlockedError();
    const findings = detectSensitiveData(text);
    count += findings.length;
    for (const finding of findings) kinds.add(finding.kind);
    if (count > MAX_FINDINGS)
      throw new SensitiveDataBlockedError(count, [...kinds]);
  }
  function visit(item, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH)
      throw new SensitiveDataBlockedError();
    if (typeof item === 'string') {
      inspectText(item);
      return;
    }
    if (item === null || item === undefined || typeof item === 'boolean')
      return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new SensitiveDataBlockedError();
      inspectText(String(item));
      return;
    }
    if (typeof item !== 'object' || ancestors.has(item))
      throw new SensitiveDataBlockedError();
    const prototype = Object.getPrototypeOf(item);
    if (
      !Array.isArray(item) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      throw new SensitiveDataBlockedError();
    // JSON.stringify invokes toJSON even when the method is non-enumerable.
    // Such objects must not manufacture uninspected data after this check.
    if (Object.getOwnPropertyDescriptor(item, 'toJSON'))
      throw new SensitiveDataBlockedError();
    ancestors.add(item);
    for (const key of Object.keys(item)) {
      inspectText(key);
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (!property || !('value' in property))
        throw new SensitiveDataBlockedError();
      if (
        secretLabel(key) &&
        property.value !== null &&
        property.value !== undefined &&
        property.value !== '' &&
        property.value !== MASK
      ) {
        count++;
        kinds.add('secret');
      }
      visit(property.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value, 0);
  if (count) throw new SensitiveDataBlockedError(count, [...kinds]);
}
