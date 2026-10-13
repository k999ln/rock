export const SPIDER_RISK_POLICY_VERSION = 1;
export const MAX_RISK_PATHS = 256;
export const MAX_RISK_CONTENT_CHARACTERS = 131_072;

const CHECKS = Object.freeze({
  secrets: 'repository-secret-scan',
  identity: 'identity-and-authorization-boundaries',
  execution: 'code-execution-and-injection-boundaries',
  network: 'network-and-outbound-boundaries',
  data: 'database-and-storage-boundaries',
  finance: 'wallet-and-payment-boundaries',
  workflow: 'ci-and-release-integrity',
});

const PATH_RULES = [
  {
    id: 'secret-bearing-file',
    category: 'secrets',
    severity: 'critical',
    pattern: /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]*\.(?:pem|key|p12|pfx|jks|keystore)|credentials?\.(?:json|ya?ml|toml)|secrets?\.(?:json|ya?ml|toml))$/iu,
  },
  {
    id: 'identity-boundary', category: 'identity', severity: 'high',
    pattern: /(?:auth|oauth|webauthn|identity|permission|capabilit|broker|session|attestation|entitlement)/iu,
  },
  {
    id: 'execution-boundary', category: 'execution', severity: 'high',
    pattern: /(?:runner|executor|shell|command|subprocess|computer-use|browser-agent)/iu,
  },
  {
    id: 'network-boundary', category: 'network', severity: 'high',
    pattern: /(?:webhook|connector|mcp|provider|outbound|proxy|cors|tls|http)/iu,
  },
  {
    id: 'data-boundary', category: 'data', severity: 'high',
    pattern: /(?:^|\/)(?:db|drizzle|migrations?|storage|backup|schema)(?:\/|\.|$)/iu,
  },
  {
    id: 'financial-boundary', category: 'finance', severity: 'high',
    pattern: /(?:wallet|billing|payment|stripe|settlement|transfer|transaction)/iu,
  },
  {
    id: 'workflow-boundary', category: 'workflow', severity: 'high',
    pattern: /(?:^|\/)\.github\/workflows\/|(?:^|\/)(?:package-lock\.json|wrangler\.[^/]+|Dockerfile)$/iu,
  },
];

const CONTENT_RULES = [
  {
    id: 'credential-keyword', category: 'secrets', severity: 'high',
    pattern: /\b(?:api[_-]?key|secret|password|passwd|private[_-]?key|access[_-]?token|authorization|process\.env|import\.meta\.env)\b/iu,
  },
  {
    id: 'authorization-keyword', category: 'identity', severity: 'high',
    pattern: /\b(?:oauth|jwt|webauthn|authenticate|authorization|permission|capability|broker|owner[_-]?scope|session)\b/iu,
  },
  {
    id: 'dynamic-execution-keyword', category: 'execution', severity: 'high',
    pattern: /\b(?:eval|exec|execSync|spawn|subprocess|os\.system|shell\s*=|child_process|innerHTML|outerHTML)\b/iu,
  },
  {
    id: 'outbound-keyword', category: 'network', severity: 'high',
    pattern: /\b(?:fetch|webhook|redirect|rejectUnauthorized|verify\s*=\s*false|cors|egress|outbound|http[s]?:\/\/)\b/iu,
  },
  {
    id: 'database-keyword', category: 'data', severity: 'high',
    pattern: /\b(?:migration|database|encrypt|decrypt|backup|restore|sqlite|d1|sql)\b/iu,
  },
  {
    id: 'financial-keyword', category: 'finance', severity: 'high',
    pattern: /\b(?:wallet|payment|stripe|billing|settlement|transfer|transaction|refund)\b/iu,
  },
];

function safePath(path) {
  if (typeof path !== 'string' || path.length < 1 || path.length > 240 ||
      path.startsWith('/') || path.split('/').includes('..') ||
      !/^[A-Za-z0-9._/@+-]+$/u.test(path)) return '[redacted-path]';
  return path;
}

function normalizedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.content !== 'string') throw new Error('SPIDER_RISK_INPUT_INVALID');
  const path = safePath(value.path);
  return {
    path,
    content: value.content.slice(0, MAX_RISK_CONTENT_CHARACTERS),
    contentTruncated: value.content.length > MAX_RISK_CONTENT_CHARACTERS,
  };
}

export function createSpiderRiskPlan(inputs) {
  if (!Array.isArray(inputs) || inputs.length > MAX_RISK_PATHS)
    throw new Error('SPIDER_RISK_INPUT_INVALID');
  const triggers = [];
  let coverageLimited = false;
  const add = (path, source, rule) => {
    if (!triggers.some((trigger) => trigger.path === path &&
        trigger.source === source && trigger.rule === rule.id)) {
      triggers.push({
        path, source, rule: rule.id, category: rule.category, severity: rule.severity,
      });
    }
  };
  for (const inputValue of inputs) {
    const input = normalizedInput(inputValue);
    coverageLimited ||= input.contentTruncated || input.path === '[redacted-path]';
    for (const rule of PATH_RULES)
      if (rule.pattern.test(input.path)) add(input.path, 'path', rule);
    for (const rule of CONTENT_RULES)
      if (rule.pattern.test(input.content)) add(input.path, 'content', rule);
  }
  const categories = [...new Set(triggers.map(({ category }) => category))].sort();
  const profile = triggers.some(({ severity }) => severity === 'critical')
    ? 'critical'
    : triggers.length ? 'deep' : 'standard';
  return {
    schema: 'rockstaros-spider-risk-plan/1',
    policyVersion: SPIDER_RISK_POLICY_VERSION,
    profile,
    inspectedFiles: inputs.length,
    categories,
    triggers,
    recommendedChecks: categories.map((category) => CHECKS[category]),
    coverageLimited,
    limitations: [
      'キーワードとpathによる防御側の優先度付けであり、脆弱性や侵害の証明ではありません。',
      '値、原文、credentialをreportへ保存せず、実際の検査と修正は既存の承認・検証境界を通します。',
    ],
  };
}
