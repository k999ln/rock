import {
  createSkyToolPackageDraft,
  parseSkyToolPackage,
  type JsonObject,
  type SkyToolPackage,
  type SkyToolSideEffect,
} from './sky-tool-package.ts';
import { SkySubmissionError } from './sky-submission.ts';
import type { SkyPermission } from './sky-submission.ts';

export const SKY_CODE_MAX_BYTES = 512 * 1024;

export type SkyCodeIntake = {
  manifest: SkyToolPackage;
  fileName: string;
  language: string;
  entrypoint: string;
  sourceSha256: string;
  integrationCode: string;
  findings: string[];
};

const languageByExtension: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  py: 'Python',
  rb: 'Ruby',
  php: 'PHP',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
};

function cleanFileName(value?: string) {
  const raw = value?.split(/[\\/]/).at(-1)?.trim() || 'pasted-code.js';
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
  return safe || 'pasted-code.js';
}

function language(fileName: string, code: string) {
  const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
  if (languageByExtension[extension]) return languageByExtension[extension];
  if (/^\s*(?:from\s+\S+\s+)?import\s+/m.test(code) && /def\s+\w+\s*\(/.test(code))
    return 'Python';
  if (/\b(?:const|let|function|export|import)\b/.test(code)) return 'JavaScript';
  return 'Source code';
}

function entrypoint(code: string) {
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
    /def\s+([A-Za-z_][\w]*)\s*\(/,
    /func\s+([A-Za-z_][\w]*)\s*\(/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(code);
    if (match?.[1]) return match[1];
  }
  return 'run';
}

function parameters(code: string, functionName: string) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`function\\s+${escaped}\\s*\\(([^)]*)\\)`),
    new RegExp(`(?:const|let)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)`),
    new RegExp(`def\\s+${escaped}\\s*\\(([^)]*)\\)`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(code);
    if (!match) continue;
    return match[1]
      .split(',')
      .map((item) => item.trim().split(/[:=]/)[0].trim())
      .filter((item) => /^[A-Za-z_$][\w$]*$/.test(item) && item !== 'self')
      .slice(0, 12);
  }
  return [];
}

function inputSchema(names: string[]): JsonObject {
  const keys = names.length ? names : ['input'];
  return {
    type: 'object',
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(
      keys.map((name) => [name, { description: `${name}へ渡す入力` }]),
    ),
  };
}

function capabilities(code: string) {
  const financial = /\b(?:stripe|payment|charge|refund|payout|transfer|wallet)\b/i.test(code);
  const externalWrite = /\b(?:POST|PUT|PATCH|DELETE|sendMail|publish|upload)\b/.test(code);
  const localWrite = /\b(?:writeFile|appendFile|unlink|mkdir|rename)\b/.test(code);
  const online = /\b(?:fetch|axios|https?|stripe|openai|websocket)\b/i.test(code);
  const sideEffects: SkyToolSideEffect[] = financial
    ? ['financial']
    : externalWrite
      ? ['external_write']
      : localWrite
        ? ['local_write']
        : ['none'];
  return { financial, externalWrite, localWrite, online, sideEffects };
}

function category(code: string) {
  if (/\b(?:invoice|order|customer|sales|stripe|payment)\b/i.test(code)) return '販売・収益';
  if (/\b(?:post|caption|instagram|campaign|content)\b/i.test(code)) return '発信・コンテンツ';
  if (/\b(?:csv|json|analy|report|metric|data)\b/i.test(code)) return '分析・データ';
  if (/\b(?:file|folder|document|markdown)\b/i.test(code)) return 'ファイル処理';
  return '業務自動化';
}

function bytesToHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function analyzeSkyCodeIntake(input: {
  code: string;
  fileName?: string;
}): Promise<SkyCodeIntake> {
  const code = input.code.trim();
  const size = new TextEncoder().encode(code).length;
  if (size < 20) throw new SkySubmissionError('20文字以上のコードを貼り付けてください。');
  if (size > SKY_CODE_MAX_BYTES)
    throw new SkySubmissionError('コードまたはファイルは512 KB以下にしてください。');
  const fileName = cleanFileName(input.fileName);
  const detectedLanguage = language(fileName, code);
  const detectedEntrypoint = entrypoint(code);
  const parameterNames = parameters(code, detectedEntrypoint);
  const detected = capabilities(code);
  const fundCategory = category(code);
  const base = createSkyToolPackageDraft({
    sourceKind: 'inline_code',
    fileName,
    name: detectedEntrypoint === 'run' ? fileName.replace(/\.[^.]+$/, '') : detectedEntrypoint,
    summary: `${detectedEntrypoint}をSkyから安全に呼び出し、構造化された結果を返す自動化Toolです。`,
    developerName: 'Sky Developer',
    developerId: 'sky-developer',
    license: 'LicenseRef-Owner-Confirmation',
  });
  const permissions: SkyPermission[] = [
    'read_user_input',
    'write_results',
    ...(detected.online ? (['network'] as SkyPermission[]) : []),
    ...(detected.financial ? (['financial_action'] as SkyPermission[]) : []),
    ...(detected.localWrite ? (['selected_files'] as SkyPermission[]) : []),
  ];
  const dangerous = detected.financial || detected.externalWrite;
  const manifest = parseSkyToolPackage({
    ...base,
    io: {
      inputSchema: inputSchema(parameterNames),
      outputSchema: base.io.outputSchema,
    },
    capabilities: {
      connectivity: detected.online ? 'online' : 'offline',
      executionTargets: ['pc'],
      permissions: [...new Set(permissions)],
      sideEffects: detected.sideEffects,
    },
    execution: {
      ...base.execution,
      idempotency: dangerous ? 'required' : 'not_needed',
      confirmation: dangerous ? 'per_run' : 'first_use',
    },
    verification: {
      method: dangerous ? 'read_after_write' : 'response_schema',
      successCondition: dangerous
        ? '外部の読み取り結果または署名済みReceiptで変更を確認できること。'
        : '宣言された出力Schemaに一致する結果が返ること。',
    },
    fund: {
      categories: [fundCategory],
      tags: [detectedLanguage.toLowerCase(), detected.online ? 'online' : 'offline'],
    },
    generation: {
      ...base.generation,
      reviewRequired: [
        ...base.generation.reviewRequired,
        `${fileName}の${detectedEntrypoint}を実際のexportへ接続`,
      ],
    },
  });
  const digest = bytesToHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
  );
  const integrationCode = `import { createSkyToolApp } from '@rockstaros/sky-tool-sdk';
import { ${detectedEntrypoint} as automation } from './${fileName}';

const sky = createSkyToolApp({ /* Skyが開発者情報と接続先を設定 */ });

sky.tool({
  name: '${manifest.id.split('.').at(-1)}',
  description: ${JSON.stringify(manifest.summary)},
  inputSchema: ${JSON.stringify(manifest.io.inputSchema, null, 2)},
  outputSchema: ${JSON.stringify(manifest.io.outputSchema, null, 2)},
  sideEffects: ${JSON.stringify(manifest.capabilities.sideEffects)},
  handler: async (input) => automation(input)
});`;
  const findings = [
    `${detectedLanguage}として解析`,
    `入口候補: ${detectedEntrypoint}`,
    `${parameterNames.length || 1}個の入力候補`,
    detected.online ? 'ネット接続を検出' : 'オフライン実行候補',
    dangerous ? '実行ごとの確認を設定' : '初回確認を設定',
  ];
  return {
    manifest,
    fileName,
    language: detectedLanguage,
    entrypoint: detectedEntrypoint,
    sourceSha256: digest,
    integrationCode,
    findings,
  };
}
