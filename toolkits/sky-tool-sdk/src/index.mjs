import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];
const MAX_BODY_BYTES = 1_000_000;
const MAX_TOOLS = 100;

function fail(message, code = 'invalid_config') {
  throw Object.assign(new Error(message), { code });
}

function text(value, label, min = 1, max = 500) {
  let hasControlCharacter = false;
  if (typeof value === 'string')
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) hasControlCharacter = true;
    }
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max ||
    hasControlCharacter
  )
    fail(`${label}を${min}〜${max}文字で指定してください。`);
  return value.trim();
}

function httpsUrl(value, label) {
  const raw = text(value, label, 8, 500);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${label}をHTTPS URLで指定してください。`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    fail(`${label}を認証情報を含まないHTTPS URLで指定してください。`);
  return parsed.toString();
}

function identifier(value, label, pattern, max = 140) {
  const result = text(value, label, 1, max);
  if (!pattern.test(result)) fail(`${label}の形式を確認してください。`);
  return result;
}

function schema(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label}はJSON Schema objectにしてください。`);
  if (value.type !== 'object') fail(`${label}.typeはobjectにしてください。`);
  return structuredClone(value);
}

function stringList(value, label, fallback) {
  const list = value ?? fallback;
  if (
    !Array.isArray(list) ||
    list.length < 1 ||
    list.length > 12 ||
    list.some((item) => typeof item !== 'string')
  )
    fail(`${label}を1〜12件指定してください。`);
  return list.map((item) => text(item, label, 1, 240));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) fail('MCP request too large', 'request_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validateAgainstSchema(input, inputSchema, kind = 'arguments') {
  const invalidCode = kind === 'arguments' ? 'invalid_arguments' : 'invalid_result';
  const subject = kind === 'arguments' ? 'Tool arguments' : 'Tool result';
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail(`${subject} must be an object`, invalidCode);
  const properties = inputSchema.properties ?? {};
  const required = inputSchema.required ?? [];
  if (!Array.isArray(required)) fail(`${kind} schema required must be an array`);
  for (const key of required)
    if (!(key in input)) fail(`${subject} is missing required field: ${key}`, invalidCode);
  if (inputSchema.additionalProperties === false)
    for (const key of Object.keys(input))
      if (!(key in properties)) fail(`${subject} has unknown field: ${key}`, invalidCode);
  for (const [key, value] of Object.entries(input)) {
    const rule = properties[key];
    if (!rule || typeof rule !== 'object') continue;
    if (rule.type === 'string' && typeof value !== 'string')
      fail(`${subject}.${key} must be a string`, invalidCode);
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
      fail(`${subject}.${key} must be a finite number`, invalidCode);
    if (rule.type === 'integer' && !Number.isInteger(value))
      fail(`${subject}.${key} must be an integer`, invalidCode);
    if (rule.type === 'boolean' && typeof value !== 'boolean')
      fail(`${subject}.${key} must be a boolean`, invalidCode);
    if (rule.type === 'array' && !Array.isArray(value))
      fail(`${subject}.${key} must be an array`, invalidCode);
    if (rule.enum && (!Array.isArray(rule.enum) || !rule.enum.includes(value)))
      fail(`${subject}.${key} is not an allowed value`, invalidCode);
  }
  return structuredClone(input);
}

function mcpResult(value) {
  if (value && typeof value === 'object' && Array.isArray(value.content)) return value;
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  return {
    content: [{ type: 'text', text: stringValue }],
    ...(value && typeof value === 'object' && !Array.isArray(value)
      ? { structuredContent: value }
      : false),
  };
}

function normalizeInstallationId(value) {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value))
    return value;
  return 'direct_mcp';
}

async function withTimeout(promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              Object.assign(new Error('Tool timeout'), {
                code: 'outcome_unknown',
              }),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function toolDefinition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Tool definition must be an object');
  const sideEffects = stringList(value.sideEffects, 'sideEffects', ['none']);
  const allowedEffects = new Set([
    'none',
    'local_write',
    'external_write',
    'financial',
  ]);
  if (sideEffects.some((item) => !allowedEffects.has(item)))
    fail('sideEffectsに未対応の値があります。');
  const name = identifier(
    value.name,
    'MCP Tool名',
    /^[a-zA-Z0-9_.-]+$/,
    128,
  );
  const description = text(value.description, 'Tool説明', 20, 600);
  const timeoutSeconds = value.timeoutSeconds ?? 60;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600)
    fail('timeoutSecondsを1〜3600の整数にしてください。');
  if (typeof value.handler !== 'function') fail(`${name}: handlerが必要です。`);
  return {
    name,
    title:
      typeof value.title === 'string'
        ? text(value.title, 'Tool表示名', 2, 80)
        : name,
    description,
    purpose: text(value.purpose ?? description, 'Tool目的', 10, 500),
    useWhen: stringList(value.useWhen, 'useWhen', [description]),
    doNotUseWhen: stringList(value.doNotUseWhen, 'doNotUseWhen', [
      '必要な入力、権限、予算または接続が不足しているとき',
    ]),
    inputSchema: schema(value.inputSchema, 'inputSchema'),
    outputSchema: schema(
      value.outputSchema ?? {
        type: 'object',
        additionalProperties: true,
        properties: {},
      },
      'outputSchema',
    ),
    sideEffects,
    permissions: stringList(value.permissions, 'permissions', [
      'read_user_input',
      'write_results',
      'network',
    ]),
    price: {
      model: value.price?.model ?? 'free',
      note: text(
        value.price?.note ?? '無料。外部実費はありません。',
        '料金説明',
        2,
        300,
      ),
    },
    timeoutSeconds,
    successCondition: text(
      value.successCondition ?? '宣言された出力Schemaに一致する結果を返すこと。',
      '成功条件',
      10,
      500,
    ),
    fundCategories: stringList(value.fundCategories, 'Fund分類', ['未分類']),
    tags: stringList(value.tags, 'タグ', ['mcp', 'sdk']),
    handler: value.handler,
  };
}

function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Sky SDK config must be an object');
  const developerId = identifier(
    value.developer?.id,
    '開発者ID',
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    100,
  );
  const appId = identifier(
    value.app?.id,
    'App ID',
    /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/,
    140,
  );
  const version = identifier(
    value.app?.version,
    '版',
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    64,
  );
  const publicMcpUrl = value.app?.publicMcpUrl
    ? httpsUrl(value.app.publicMcpUrl, '公開MCP URL')
    : null;
  if (publicMcpUrl && (!value.skyUrl || !value.developerToken))
    fail('公開登録にはSky URLと開発者キーが必要です。');
  if (!publicMcpUrl && value.registration === 'required')
    fail('必須の公開登録には公開MCP URLが必要です。');
  return {
    skyUrl: value.skyUrl
      ? httpsUrl(value.skyUrl, 'Sky URL').replace(/\/$/, '')
      : null,
    developerToken: value.developerToken
      ? text(value.developerToken, '開発者キー', 20, 200)
      : null,
    developer: {
      id: developerId,
      name: text(value.developer.name, '開発者名', 2, 80),
      supportUrl: httpsUrl(value.developer.supportUrl, 'サポートURL'),
    },
    app: {
      id: appId,
      name: text(value.app.name, 'App名', 2, 80),
      version,
      sourceUrl: httpsUrl(value.app.sourceUrl, 'ソースURL'),
      license: text(value.app.license, 'ライセンス', 2, 100),
      publicMcpUrl,
    },
    autoPublish: value.autoPublish === true,
    registration: ['required', 'best_effort', false].includes(value.registration)
      ? value.registration
      : 'best_effort',
    authorize: value.authorize,
    fetch: value.fetch ?? globalThis.fetch,
    logger: value.logger ?? console,
    localDiscovery: value.localDiscovery !== false,
    localToolDirectory: value.localToolDirectory ?? process.env.SKY_LOCAL_TOOL_DIR ??
      join(homedir(), '.sky', 'mcp-tools'),
  };
}

function packageFor(config, tool) {
  const financial = tool.sideEffects.includes('financial');
  const externalWrite = tool.sideEffects.includes('external_write');
  const permissions = [...new Set([
    ...tool.permissions,
    ...(financial ? ['financial_action'] : []),
  ])];
  return {
    schema: 'sky-tool-package/1',
    id: `${config.app.id}.${tool.name.toLowerCase().replace(/_/g, '-')}`,
    version: config.app.version,
    name: tool.title,
    summary: tool.description,
    developer: {
      id: config.developer.id,
      displayName: config.developer.name,
      supportUrl: config.developer.supportUrl,
    },
    source: {
      kind: 'mcp',
      url: config.app.sourceUrl,
      license: config.app.license,
    },
    llm: {
      purpose: tool.purpose,
      useWhen: tool.useWhen,
      doNotUseWhen: tool.doNotUseWhen,
    },
    io: {
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    },
    adapter: {
      connectionType: 'mcp_streamable_http',
      endpointUrl: config.app.publicMcpUrl,
    },
    capabilities: {
      connectivity: 'online',
      executionTargets: ['pc', 'cloud'],
      permissions,
      sideEffects: tool.sideEffects,
    },
    pricing: {
      model: tool.price.model,
      note: tool.price.note,
      developerRecipientId: config.developer.id,
    },
    execution: {
      timeoutSeconds: tool.timeoutSeconds,
      maxAttempts: 1,
      idempotency:
        financial || externalWrite ? 'required' : 'not_needed',
      confirmation: financial || externalWrite ? 'per_run' : 'first_use',
    },
    verification: {
      method: externalWrite || financial ? 'read_after_write' : 'response_schema',
      successCondition: tool.successCondition,
    },
    tests: [
      { name: '正常な入力でSchemaに合う結果を返す', kind: 'valid_input' },
      { name: '不正な入力をhandler実行前に拒否する', kind: 'invalid_input' },
      { name: 'タイムアウトを成功として記録しない', kind: 'timeout' },
      { name: '同一要求の重複実行を検査する', kind: 'duplicate' },
    ],
    fund: { categories: tool.fundCategories, tags: tool.tags },
    generation: {
      generatedBy: 'rock-studio/1',
      reviewRequired: ['Rock StudioのSandbox実行結果と公開範囲'],
    },
    rightsConfirmed: true,
  };
}

async function skyRequest(config, path, init) {
  if (!config.skyUrl || !config.developerToken)
    fail('Skyへの公開登録にはSky URLと開発者キーが必要です。');
  const response = await config.fetch(`${config.skyUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.developerToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(body.error ?? `Sky request failed (${response.status})`),
      { status: response.status, body },
    );
  return body;
}

async function reportUsageEvent(config, event) {
  let lastError;
  for (const delay of [0, 250, 1_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await skyRequest(config, '/api/sky/tool-events', {
        method: 'POST',
        body: JSON.stringify(event),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function createSkyToolApp(rawConfig) {
  const config = validateConfig(rawConfig);
  const tools = new Map();

  const api = {
    tool(definition) {
      if (tools.size >= MAX_TOOLS) fail(`Toolは最大${MAX_TOOLS}件です。`);
      const tool = toolDefinition(definition);
      if (tools.has(tool.name)) fail(`Tool名が重複しています: ${tool.name}`);
      if (
        tool.sideEffects.some((effect) =>
          ['external_write', 'financial'].includes(effect),
        ) &&
        typeof config.authorize !== 'function'
      )
        fail(
          `${tool.name}: 外部変更・金融操作にはauthorize callbackが必要です。`,
          'authorization_required',
        );
      tools.set(tool.name, tool);
      return api;
    },

    manifests() {
      if (!config.app.publicMcpUrl)
        fail('Skyへの公開登録にはapp.publicMcpUrlが必要です。');
      return [...tools.values()].map((tool) => packageFor(config, tool));
    },

    async register() {
      if (!tools.size) fail('登録するToolがありません。');
      const results = [];
      for (const manifest of api.manifests()) {
        let registration;
        try {
          const saved = await skyRequest(config, '/api/sky/tool-packages', {
            method: 'POST',
            body: JSON.stringify({
              manifest,
              confirmations: {
                rights: true,
                pricing: true,
                sideEffects: true,
                tests: true,
              },
            }),
          });
          registration = saved.package;
        } catch (error) {
          if (error.status !== 409) throw error;
          registration = {
            packageKey: `${manifest.id}@${manifest.version}`,
            manifestSha256: sha256(manifest),
            status: 'already_registered',
          };
        }
        if (config.autoPublish) {
          try {
            const publication = await skyRequest(
              config,
              '/api/sky/tool-publications',
              {
                method: 'POST',
                body: JSON.stringify({
                  packageKey: registration.packageKey,
                  manifestSha256: registration.manifestSha256,
                }),
              },
            );
            results.push(publication.package);
            continue;
          } catch (error) {
            if (error.status !== 409) throw error;
          }
        }
        results.push(registration);
      }
      return results;
    },

    async start(options = {}) {
      if (!tools.size) fail('公開するToolがありません。');
      let registration = [];
      if (config.registration && config.app.publicMcpUrl) {
        try {
          registration = await api.register();
        } catch (error) {
          if (config.registration === 'required') throw error;
          config.logger.warn?.(`Sky registration deferred: ${error.message}`);
        }
      }
      const host = options.host ?? '127.0.0.1';
      if (config.localDiscovery && host !== '127.0.0.1')
        fail('PC内の自動検出は127.0.0.1でのみ利用できます。');
      const port = options.port ?? 0;
      const mcpPath = options.path ?? '/mcp';
      if (!/^\/[a-zA-Z0-9/_-]{1,100}$/.test(mcpPath))
        fail('MCP pathを確認してください。');
      const localSecret = config.localDiscovery
        ? randomBytes(32).toString('base64url')
        : null;
      const server = createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/health')
          return json(res, 200, {
            ok: true,
            app: config.app.id,
            version: config.app.version,
            tools: tools.size,
          });
        if (req.method !== 'POST' || req.url !== mcpPath)
          return json(res, 404, { error: 'not_found' });
        if (localSecret) {
          const supplied = req.headers['x-sky-local-secret'];
          if (
            typeof supplied !== 'string' ||
            supplied.length !== localSecret.length ||
            !timingSafeEqual(Buffer.from(supplied), Buffer.from(localSecret))
          ) return json(res, 401, { error: 'unauthorized' });
        }
        let message;
        try {
          message = await readJson(req);
          if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
            fail('Invalid JSON-RPC request', 'invalid_request');
          if (message.method === 'notifications/initialized') {
            res.writeHead(202, { 'Cache-Control': 'no-store' });
            return res.end();
          }
          const id = message.id ?? null;
          if (message.method === 'initialize') {
            const requested = message.params?.protocolVersion;
            const protocolVersion = PROTOCOL_VERSIONS.includes(requested)
              ? requested
              : PROTOCOL_VERSIONS[0];
            return json(res, 200, {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: config.app.name, version: config.app.version },
              },
            });
          }
          if (message.method === 'tools/list')
            return json(res, 200, {
              jsonrpc: '2.0',
              id,
              result: {
                tools: [...tools.values()].map((tool) => ({
                  name: tool.name,
                  title: tool.title,
                  description: tool.description,
                  inputSchema: tool.inputSchema,
                  outputSchema: tool.outputSchema,
                  annotations: {
                    readOnlyHint: tool.sideEffects.every((item) => item === 'none'),
                    destructiveHint: tool.sideEffects.includes('financial'),
                    idempotentHint: !tool.sideEffects.some((item) =>
                      ['external_write', 'financial'].includes(item),
                    ),
                  },
                })),
              },
            });
          if (message.method !== 'tools/call')
            return json(res, 200, {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: 'Method not found' },
            });
          const name = message.params?.name;
          const tool = tools.get(name);
          if (!tool) fail('Unknown tool', 'unknown_tool');
          const args = validateAgainstSchema(
            message.params?.arguments ?? {},
            tool.inputSchema,
          );
          const installationId = normalizeInstallationId(
            req.headers['x-sky-installation-id'],
          );
          const started = performance.now();
          let outcome = 'failed';
          try {
            if (
              tool.sideEffects.some((effect) =>
                ['external_write', 'financial'].includes(effect),
              )
            ) {
              const approved = await config.authorize({
                tool: tool.name,
                arguments: structuredClone(args),
                headers: { ...req.headers },
              });
              if (approved !== true) {
                outcome = 'rejected';
                fail('Execution approval required', 'approval_required');
              }
            }
            const result = await withTimeout(
              tool.handler(structuredClone(args), {
                installationId,
                requestId: randomUUID(),
              }),
              tool.timeoutSeconds * 1000,
            );
            validateAgainstSchema(result, tool.outputSchema, 'result');
            outcome = 'succeeded';
            return json(res, 200, {
              jsonrpc: '2.0',
              id,
              result: mcpResult(result),
            });
          } finally {
            const event = {
              eventId: randomUUID(),
              packageKey: `${config.app.id}.${tool.name.toLowerCase().replace(/_/g, '-')}@${config.app.version}`,
              toolName: tool.name,
              installationId,
              outcome,
              durationMs: Math.max(0, Math.round(performance.now() - started)),
              occurredAt: new Date().toISOString(),
            };
            if (config.app.publicMcpUrl)
              void reportUsageEvent(config, event).catch((error) =>
                config.logger.warn?.(`Sky usage event deferred: ${error.message}`),
              );
          }
        } catch (error) {
          const code = error.code === 'invalid_arguments' ? -32602 : -32000;
          return json(res, 200, {
            jsonrpc: '2.0',
            id: message?.id ?? null,
            error: { code, message: error.message, data: { code: error.code ?? 'tool_error' } },
          });
        }
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      let localFile = null;
      let localId = null;
      if (localSecret) {
        localId = `sdk-${createHash('sha256').update(config.app.id).digest('hex').slice(0, 24)}`;
        const descriptor = {
          schema: 'sky-local-tool/1',
          id: localId,
          name: config.app.name,
          description: `${config.developer.name} · ${tools.size}機能 · ${config.app.version}`,
          transport: 'local_http',
          url: `http://127.0.0.1:${address.port}${mcpPath}`,
          secret: localSecret,
          pid: process.pid,
        };
        try {
          await mkdir(config.localToolDirectory, { recursive: true, mode: 0o700 });
          const directory = await lstat(config.localToolDirectory);
          if (!directory.isDirectory() || (directory.mode & 0o077))
            fail('PC Toolの保存場所は所有者専用のディレクトリにしてください。');
          localFile = join(config.localToolDirectory, `${localId}.json`);
          const temporary = `${localFile}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(descriptor), { mode: 0o600 });
          await rename(temporary, localFile);
        } catch (error) {
          await new Promise((resolve) => server.close(resolve));
          throw error;
        }
      }
      return {
        server,
        host,
        port: typeof address === 'object' && address ? address.port : port,
        path: mcpPath,
        registration,
        localId,
        close: async () => {
          await new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
          if (localFile) {
            const saved = JSON.parse(await readFile(localFile, 'utf8').catch(() => '{}'));
            if (saved.secret === localSecret) await unlink(localFile);
          }
        },
      };
    },
  };
  return api;
}
