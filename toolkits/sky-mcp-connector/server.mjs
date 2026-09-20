#!/usr/bin/env node
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];
export const DEFAULT_PORT = 38479;
const MAX_BODY = 2_000_000;
const MAX_TOOLS = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;
const APPROVAL_TTL_MS = 5 * 60_000;
const MAX_APPROVALS = 10_000;
const ORIGINS = new Set([
  'https://rockstaros-kaiya.noellesugar1.chatgpt.site',
  'https://rock-star.kirin-999.chatgpt.site',
  'https://loop-automation-hub.kirin-999.chatgpt.site',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
]);
const here = dirname(fileURLToPath(import.meta.url));

function fail(message, status = 400, code = 'invalid_request') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function cleanText(value, label, max) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > max ||
    hasControlCharacter(value)
  )
    fail(`${label}を確認してください。`);
  return value;
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

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function privateIp(address) {
  address = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (address.startsWith('::ffff:')) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) return privateIp(mapped);
    const words = mapped.split(':');
    if (
      words.length === 2 &&
      words.every((word) => /^[0-9a-f]{1,4}$/.test(word))
    ) {
      const high = Number.parseInt(words[0], 16);
      const low = Number.parseInt(words[1], 16);
      return privateIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
  }
  if (
    address === '::1' ||
    address === '::' ||
    address.startsWith('fe80:') ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('2001:db8:')
  )
    return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export async function validateRemoteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('遠隔MCPのURLを確認してください。');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    fail('遠隔MCPは認証情報を含まないHTTPS URLにしてください。');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address)))
    fail(
      'ローカル・社内向けアドレスへ遠隔接続できません。',
      400,
      'private_network_denied',
    );
  return {
    url,
    address: addresses[0].address,
    family: addresses[0].family,
  };
}

async function postHttps(resolved, headers, payload, timeoutMs) {
  return await new Promise((resolvePromise, reject) => {
    const request = httpsRequest(
      resolved.url,
      {
        method: 'POST',
        headers,
        lookup: (_hostname, options, callback) => {
          if (options?.all)
            callback(null, [
              { address: resolved.address, family: resolved.family },
            ]);
          else callback(null, resolved.address, resolved.family);
        },
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY)
            request.destroy(
              Object.assign(new Error('MCP response too large'), {
                code: 'response_too_large',
              }),
            );
          else chunks.push(chunk);
        });
        response.on('end', () =>
          resolvePromise({
            status: response.statusCode ?? 502,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.setTimeout(timeoutMs, () =>
      request.destroy(
        Object.assign(new Error('MCP timeout'), { code: 'outcome_unknown' }),
      ),
    );
    request.on('error', reject);
    request.end(payload);
  });
}

function validateLocalDescriptor(raw, file) {
  if (!raw || raw.schema !== 'sky-local-tool/1' || raw.transport !== 'local_http')
    fail('PC Toolの登録定義を確認してください。');
  const id = cleanText(raw.id, 'PC Tool ID', 64);
  if (!/^sdk-[a-f0-9]{24}$/.test(id) || file !== `${id}.json`)
    fail('PC Tool IDを確認してください。');
  let url;
  try { url = new URL(raw.url); } catch { fail('PC Tool URLを確認してください。'); }
  if (
    url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
    !url.port || url.username || url.password || url.search || url.hash ||
    !/^\/[a-zA-Z0-9/_-]{1,100}$/.test(url.pathname)
  ) fail('PC Toolは127.0.0.1のHTTPだけ登録できます。');
  if (typeof raw.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.secret))
    fail('PC Toolの接続キーを確認してください。');
  if (!Number.isSafeInteger(raw.pid) || raw.pid < 1)
    fail('PC ToolのプロセスIDを確認してください。');
  return {
    id,
    name: cleanText(raw.name, '名称', 80),
    description: cleanText(raw.description, '説明', 300),
    required: false,
    transport: 'local_http',
    url: url.toString(),
    secret: raw.secret,
    pid: raw.pid,
  };
}

async function discoverLocalTools(directory) {
  let folder;
  try { folder = await lstat(directory); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!folder.isDirectory() || (folder.mode & 0o077)) return [];
  const files = (await readdir(directory)).filter((file) => /^sdk-[a-f0-9]{24}\.json$/.test(file)).slice(0, 100);
  const specs = [];
  for (const file of files) {
    try {
      const path = join(directory, file);
      const info = await lstat(path);
      if (!info.isFile() || (info.mode & 0o077) || info.size > 4_096) continue;
      const spec = validateLocalDescriptor(JSON.parse(await readFile(path, 'utf8')), file);
      process.kill(spec.pid, 0);
      specs.push(spec);
    } catch { /* A damaged descriptor cannot become a connection. */ }
  }
  return specs;
}

async function postLocal(spec, headers, payload, timeoutMs) {
  return await new Promise((resolvePromise, reject) => {
    const request = httpRequest(spec.url, { method: 'POST', headers }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) request.destroy(new Error('MCP response too large'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolvePromise({
        status: response.statusCode ?? 502,
        headers: response.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('MCP timeout')));
    request.on('error', reject);
    request.end(payload);
  });
}

export function validateRegistry(input, registryPath) {
  if (
    !input ||
    input.schema !== 'rockstaros-mcp-registry/1' ||
    !Array.isArray(input.servers) ||
    input.servers.length > 100
  )
    fail('MCP registryの形式が違います。');
  const ids = new Set();
  const base = dirname(registryPath);
  return input.servers.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      fail('MCP接続定義を確認してください。');
    const id = cleanText(raw.id, 'MCP ID', 64);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || ids.has(id))
      fail('MCP IDが不正または重複しています。');
    ids.add(id);
    const common = {
      id,
      name: cleanText(raw.name, '名称', 80),
      description: cleanText(raw.description, '説明', 300),
      required: raw.required === true,
    };
    if (raw.transport === 'stdio') {
      if (
        typeof raw.command !== 'string' ||
        !raw.command ||
        hasControlCharacter(raw.command) ||
        !Array.isArray(raw.args) ||
        raw.args.length > 30 ||
        raw.args.some(
          (item) =>
            typeof item !== 'string' ||
            item.length > 500 ||
            item.includes(String.fromCharCode(0)),
        )
      )
        fail(`${id}: stdio定義を確認してください。`);
      if (typeof raw.cwd !== 'string' || !raw.cwd || raw.cwd.length > 500)
        fail(`${id}: 作業場所を確認してください。`);
      const cwd = resolve(base, raw.cwd);
      const envNames = raw.env ?? [];
      if (
        !Array.isArray(envNames) ||
        envNames.length > 50 ||
        envNames.some((name) => !/^[A-Z][A-Z0-9_]{0,99}$/.test(name))
      )
        fail(`${id}: 環境変数名を確認してください。`);
      return {
        ...common,
        transport: 'stdio',
        command: raw.command,
        args: [...raw.args],
        cwd,
        envNames,
      };
    }
    if (raw.transport === 'streamable_http') {
      if (typeof raw.url !== 'string' || raw.url.length > 500)
        fail(`${id}: URLを確認してください。`);
      if (
        raw.authEnv !== undefined &&
        !/^[A-Z][A-Z0-9_]{0,99}$/.test(raw.authEnv)
      )
        fail(`${id}: 認証参照を確認してください。`);
      return {
        ...common,
        transport: 'streamable_http',
        url: raw.url,
        authEnv: raw.authEnv ?? null,
      };
    }
    fail(`${id}: 対応していないtransportです。`);
  });
}

class StdioTransport {
  constructor(spec) {
    this.spec = spec;
    this.process = null;
    this.pending = new Map();
    this.buffer = '';
  }
  start() {
    if (this.process && this.process.exitCode === null) return;
    const env = { PATH: process.env.PATH ?? '' };
    for (const name of this.spec.envNames)
      if (process.env[name] !== undefined) env[name] = process.env[name];
    const child = spawn(this.spec.command, this.spec.args, {
      cwd: this.spec.cwd,
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (this.process === child) this.onData(chunk);
    });
    child.stderr.resume();
    child.on('error', (error) => {
      if (this.process === child) this.close(error);
    });
    child.on('exit', () => {
      if (this.process === child) this.close(new Error('MCP process stopped'));
    });
  }
  onData(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_BODY * 2)
      return this.close(new Error('MCP response too large'));
    for (;;) {
      const end = this.buffer.indexOf('\n');
      if (end < 0) break;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return this.close(new Error('Invalid MCP response'));
      }
      const pending = this.pending.get(String(message.id));
      if (pending) {
        this.pending.delete(String(message.id));
        pending.resolve(message);
      }
    }
  }
  close(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.process = null;
    this.buffer = '';
  }
  reset() {
    const running = this.process;
    this.close(new Error('MCP connection reset'));
    if (running && running.exitCode === null) running.kill('SIGTERM');
  }
  async request(message, timeoutMs = REQUEST_TIMEOUT_MS) {
    this.start();
    if (!('id' in message)) {
      this.process.stdin.write(`${JSON.stringify(message)}\n`);
      return null;
    }
    return await new Promise((resolvePromise, reject) => {
      const key = String(message.id);
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('MCP timeout'));
      }, timeoutMs);
      this.pending.set(key, {
        resolve: (value) => {
          clearTimeout(timer);
          resolvePromise(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.process.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(key);
          reject(error);
        }
      });
    });
  }
}

class HttpTransport {
  constructor(spec) {
    this.spec = spec;
    this.protocol = null;
    this.sessionId = null;
  }
  reset() {
    this.protocol = null;
    this.sessionId = null;
  }
  async request(message, timeoutMs = REQUEST_TIMEOUT_MS) {
    const local = this.spec.transport === 'local_http';
    const remote = local ? null : await validateRemoteUrl(this.spec.url);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.protocol) headers['MCP-Protocol-Version'] = this.protocol;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.spec.authEnv && process.env[this.spec.authEnv])
      headers.Authorization = `Bearer ${process.env[this.spec.authEnv]}`;
    if (local) headers['x-sky-local-secret'] = this.spec.secret;
    const response = await (local ? postLocal(this.spec,
      headers,
      JSON.stringify(message),
      timeoutMs,
    ) : postHttps(
      remote,
      headers,
      JSON.stringify(message),
      timeoutMs,
    ));
    if (response.status >= 300 && response.status < 400)
      fail('遠隔MCPのredirectは許可されていません。', 502, 'redirect_denied');
    if (response.status === 401 || response.status === 403)
      fail(
        'このMCPは認証が必要です。Connectorの環境変数を設定してください。',
        401,
        'authorization_required',
      );
    if (
      (response.status < 200 || response.status >= 300) &&
      response.status !== 202
    )
      fail('遠隔MCPへ接続できませんでした。', 502, 'upstream_failed');
    const session = response.headers['mcp-session-id'];
    if (typeof session === 'string') this.sessionId = session;
    if (response.status === 202 || !('id' in message)) return null;
    const text = response.text;
    const type = response.headers['content-type'] ?? '';
    const payload = type.includes('text/event-stream')
      ? text
          .split(/\r?\n/)
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim()
      : text;
    if (!payload) fail('MCP応答が空です。', 502, 'invalid_upstream');
    try {
      return JSON.parse(payload);
    } catch {
      fail('MCP応答を解釈できません。', 502, 'invalid_upstream');
    }
  }
}

export class McpHub {
  constructor(specs) {
    this.entries = new Map(
      specs.map((spec) => [
        spec.id,
        {
          spec,
          transport:
            spec.transport === 'stdio'
              ? new StdioTransport(spec)
              : new HttpTransport(spec),
          passport: null,
          state: 'available',
        },
      ]),
    );
    this.approvals = new Map();
    this.approvalSecret = randomBytes(32);
    this.nextId = 1;
    this.localIds = new Set();
  }
  syncLocal(specs) {
    const next = new Set(specs.map((spec) => spec.id));
    for (const id of this.localIds) {
      if (!next.has(id)) {
        this.entries.delete(id);
        this.approvals.clear();
      }
    }
    for (const spec of specs) {
      const current = this.entries.get(spec.id);
      if (current && current.spec.transport !== 'local_http') continue;
      if (current && current.spec.url === spec.url && current.spec.secret === spec.secret) continue;
      this.entries.set(spec.id, {
        spec,
        transport: new HttpTransport(spec),
        passport: null,
        state: 'available',
      });
      this.approvals.clear();
    }
    this.localIds = next;
  }
  list() {
    return [...this.entries.values()].map(({ spec, passport, state }) => ({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      transport: spec.transport,
      state,
      toolCount: passport?.tools.length ?? null,
      passport,
    }));
  }
  close() {
    for (const entry of this.entries.values())
      if (entry.transport instanceof StdioTransport && entry.transport.process)
        entry.transport.process.kill('SIGTERM');
  }
  entry(id) {
    const entry = this.entries.get(id);
    if (!entry) fail('MCP接続先が見つかりません。', 404, 'server_not_found');
    return entry;
  }
  async rpc(id, method, params = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const response = await this.entry(id).transport.request(
      { jsonrpc: '2.0', id: this.nextId++, method, params },
      timeoutMs,
    );
    if (
      !response ||
      response.jsonrpc !== '2.0' ||
      response.error ||
      !('result' in response)
    )
      fail(
        response?.error?.message ?? 'MCP応答を確認できません。',
        502,
        'mcp_error',
      );
    return response.result;
  }
  async connect(id) {
    const entry = this.entry(id);
    entry.state = 'connecting';
    entry.transport.reset();
    try {
      const initialized = await this.rpc(id, 'initialize', {
        protocolVersion: PROTOCOL_VERSIONS[0],
        capabilities: {},
        clientInfo: { name: 'rockstaros-sky-connector', version: '1.0.0' },
      });
      if (!PROTOCOL_VERSIONS.includes(initialized.protocolVersion))
        fail(
          '対応するMCP protocol versionではありません。',
          409,
          'protocol_mismatch',
        );
      entry.transport.protocol = initialized.protocolVersion;
      await entry.transport.request({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      const tools = [];
      let cursor;
      do {
        const listed = await this.rpc(
          id,
          'tools/list',
          cursor ? { cursor } : {},
        );
        if (!Array.isArray(listed.tools))
          fail('tools/listの応答が不正です。', 502, 'invalid_tools');
        tools.push(...listed.tools);
        cursor = listed.nextCursor;
        if (tools.length > MAX_TOOLS)
          fail('MCPの機能数が上限を超えています。', 409, 'too_many_tools');
      } while (cursor);
      const safeTools = tools.map((tool) => ({
        name: cleanText(tool?.name, 'tool名', 128),
        title: typeof tool.title === 'string' ? tool.title.slice(0, 160) : null,
        description:
          typeof tool.description === 'string'
            ? tool.description.slice(0, 500)
            : '',
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : { type: 'object' },
        approval: 'required',
      }));
      entry.passport = {
        server: {
          name: String(initialized.serverInfo?.name ?? entry.spec.name).slice(
            0,
            160,
          ),
          version: String(initialized.serverInfo?.version ?? 'unknown').slice(
            0,
            80,
          ),
        },
        protocolVersion: initialized.protocolVersion,
        capabilities: initialized.capabilities ?? {},
        tools: safeTools,
        toolDigest: digest(safeTools),
        connectedAt: new Date().toISOString(),
      };
      entry.state = 'connected';
      return entry.passport;
    } catch (error) {
      entry.state =
        error.code === 'authorization_required'
          ? 'needs_authorization'
          : 'error';
      throw error;
    }
  }
  disconnect(id) {
    const entry = this.entry(id);
    entry.transport.reset();
    entry.passport = null;
    entry.state = 'available';
    // A stopped server invalidates every outstanding one-time approval. This is
    // intentionally broader than one server so no stale approval survives a
    // control-plane change.
    this.approvals.clear();
    return { id, state: entry.state };
  }
  prepare(id, name, args) {
    const entry = this.entry(id);
    if (!entry.passport || entry.state !== 'connected')
      fail('先にMCPへ接続してください。', 409, 'not_connected');
    const tool = entry.passport.tools.find(
      (candidate) => candidate.name === name,
    );
    if (!tool)
      fail('接続時に確認した機能ではありません。', 404, 'tool_not_found');
    if (!args || typeof args !== 'object' || Array.isArray(args))
      fail('tool引数を確認してください。');
    const now = Date.now();
    for (const [nonce, approval] of this.approvals)
      if (approval.used || approval.expiresAt <= now)
        this.approvals.delete(nonce);
    if (this.approvals.size >= MAX_APPROVALS)
      fail(
        '承認待ちが上限です。期限後にやり直してください。',
        429,
        'approval_limit',
      );
    const payloadDigest = digest({
      id,
      name,
      args,
      toolDigest: entry.passport.toolDigest,
    });
    const nonce = randomUUID(),
      expiresAt = now + APPROVAL_TTL_MS;
    const signature = createHmac('sha256', this.approvalSecret)
      .update(`${nonce}:${payloadDigest}:${expiresAt}`)
      .digest('hex');
    const token = `${nonce}.${expiresAt}.${signature}`;
    this.approvals.set(nonce, { payloadDigest, expiresAt, used: false });
    return {
      approvalToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
      server: entry.spec.name,
      tool: tool.title || tool.name,
      toolId: tool.name,
      summary: `${entry.spec.name}の「${tool.title || tool.name}」を1回実行します。`,
      approvalRequired: true,
    };
  }
  async execute(id, name, args, token, confirmed) {
    if (confirmed !== true || typeof token !== 'string')
      fail('この操作には内容確認と承認が必要です。', 403, 'approval_required');
    const [nonce, expires, supplied] = token.split('.');
    const approval = this.approvals.get(nonce);
    const expected = createHmac('sha256', this.approvalSecret)
      .update(`${nonce}:${approval?.payloadDigest ?? ''}:${expires}`)
      .digest('hex');
    if (
      !approval ||
      approval.used ||
      Number(expires) !== approval.expiresAt ||
      Date.now() > approval.expiresAt ||
      !supplied ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      fail('承認が無効または期限切れです。', 403, 'invalid_approval');
    const entry = this.entry(id);
    const payloadDigest = digest({
      id,
      name,
      args,
      toolDigest: entry.passport?.toolDigest,
    });
    if (payloadDigest !== approval.payloadDigest)
      fail('承認後に操作内容が変わりました。', 409, 'approval_mismatch');
    approval.used = true;
    try {
      return await this.rpc(
        id,
        'tools/call',
        { name, arguments: args },
        CALL_TIMEOUT_MS,
      );
    } catch (error) {
      if (error.name === 'TimeoutError' || error.message === 'MCP timeout') {
        const unknown = new Error(
          '送信後の結果を確認できません。自動再実行せず、同じ操作の状態を照合してください。',
        );
        unknown.status = 504;
        unknown.code = 'outcome_unknown';
        throw unknown;
      }
      throw error;
    }
  }
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) fail('requestが大きすぎます。', 413);
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('JSONを確認してください。');
  }
}

function send(response, status, data, origin) {
  const encoded = Buffer.from(data === undefined ? '' : JSON.stringify(data));
  response.writeHead(status, {
    ...(origin
      ? {
          'Access-Control-Allow-Origin': origin,
          Vary: 'Origin',
          'Access-Control-Allow-Private-Network': 'true',
        }
      : {}),
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, MCP-Protocol-Version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': encoded.length,
  });
  response.end(encoded);
}

export async function createConnector({
  registryPath = resolve(here, 'registry.json'),
  port = DEFAULT_PORT,
  localToolDirectory = process.env.SKY_LOCAL_TOOL_DIR ?? join(homedir(), '.sky', 'mcp-tools'),
} = {}) {
  const specs = validateRegistry(
    JSON.parse(await readFile(registryPath, 'utf8')),
    registryPath,
  );
  for (const spec of specs.filter(
    (item) => item.transport === 'streamable_http',
  ))
    await validateRemoteUrl(spec.url);
  const hub = new McpHub(specs),
    tokens = new Map();
  let boundPort = port;
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed =
      ORIGINS.has(origin) && request.headers.host === `127.0.0.1:${boundPort}`;
    if (!allowed) return send(response, 403, { error: 'Origin denied' });
    if (request.method === 'OPTIONS')
      return send(response, 204, undefined, origin);
    try {
      if (request.method === 'POST' && request.url === '/connect') {
        if (canonical(await body(request)) !== '{}')
          fail('接続requestを確認してください。');
        const token =
          tokens.get(origin) ?? randomBytes(32).toString('base64url');
        tokens.set(origin, token);
        return send(
          response,
          200,
          { token, connector: 'rockstaros-sky-mcp', serverCount: specs.length },
          origin,
        );
      }
      const authorization = request.headers.authorization ?? '';
      const expected = tokens.get(origin) ? `Bearer ${tokens.get(origin)}` : '';
      if (
        !expected ||
        authorization.length !== expected.length ||
        !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
      )
        return send(response, 401, { error: 'Unauthorized' }, origin);
      hub.syncLocal(await discoverLocalTools(localToolDirectory));
      if (request.method === 'GET' && request.url === '/servers')
        return send(response, 200, { servers: hub.list() }, origin);
      const match = request.url?.match(
        /^\/servers\/([a-z0-9][a-z0-9-]{0,63})\/(connect|disconnect|mcp|prepare|execute)$/,
      );
      if (request.method === 'POST' && match) {
        const [, id, action] = match,
          input = await body(request);
        if (action === 'connect')
          return send(
            response,
            200,
            { passport: await hub.connect(id) },
            origin,
          );
        if (action === 'disconnect') {
          if (canonical(input) !== '{}') fail('停止requestを確認してください。');
          return send(response, 200, hub.disconnect(id), origin);
        }
        if (action === 'prepare')
          return send(
            response,
            200,
            hub.prepare(id, input.name, input.arguments ?? {}),
            origin,
          );
        if (action === 'execute')
          return send(
            response,
            200,
            {
              result: await hub.execute(
                id,
                input.name,
                input.arguments ?? {},
                input.approvalToken,
                input.confirmed,
              ),
            },
            origin,
          );
        if (input.method === 'tools/call')
          fail(
            'tools/callはprepare→確認→executeの順で実行してください。',
            403,
            'approval_required',
          );
        const result = await hub.rpc(id, input.method, input.params ?? {});
        return send(
          response,
          200,
          { jsonrpc: '2.0', id: input.id ?? null, result },
          origin,
        );
      }
      if (request.method === 'POST' && request.url === '/mcp') {
        const input = await body(request),
          result = await hub
            .entry('rock-star-mr')
            .transport.request(
              input,
              input.method === 'tools/call'
                ? CALL_TIMEOUT_MS
                : REQUEST_TIMEOUT_MS,
            );
        return send(response, result === null ? 202 : 200, result, origin);
      }
      return send(response, 404, { error: 'Not found' }, origin);
    } catch (error) {
      return send(
        response,
        error.status ?? 500,
        {
          error: error.code ?? 'connector_error',
          message: error.status
            ? error.message
            : 'Connectorで処理できませんでした。',
        },
        origin,
      );
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolvePromise);
  });
  boundPort = server.address().port;
  server.on('close', () => hub.close());
  return { server, hub, port: boundPort };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const registryIndex = process.argv.indexOf('--registry');
  const portIndex = process.argv.indexOf('--port');
  const registryPath =
    registryIndex >= 0
      ? isAbsolute(process.argv[registryIndex + 1])
        ? process.argv[registryIndex + 1]
        : resolve(process.cwd(), process.argv[registryIndex + 1])
      : resolve(here, 'registry.json');
  const port =
    portIndex >= 0 ? Number(process.argv[portIndex + 1]) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    fail('portを確認してください。');
  const { server } = await createConnector({ registryPath, port });
  console.error(
    `Sky MCP Connector: http://127.0.0.1:${port} (${registryPath})`,
  );
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
