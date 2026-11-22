import { createServer as memory } from '@modelcontextprotocol/server-memory/dist/index.js';
import { createServer as thinking } from '@modelcontextprotocol/server-sequential-thinking/dist/index.js';
import { createServer as filesystem } from '@modelcontextprotocol/server-filesystem/dist/server.js';
import { Client } from '@modelcontextprotocol/client';
import { promises as fs } from 'node:fs';
import { NOAH_CLOUD_PROFILES, NOAH_CLOUD_LIMITS as limits, NOAH_FREE_CLOUD_PROFILES, noahCloudDigest } from '../../lib/noah-cloud-contract.ts';

const workspace = '/tmp/workspace';
const filesystemTools = new Set(['read_text_file', 'write_file', 'append_file', 'edit_file', 'create_directory', 'list_directory', 'directory_tree', 'get_file_info', 'list_allowed_directories']);
// An MCP transport within the request. No subprocess, network, host mount or credentials.
function pair() {
  let closed = false;
  const close = async () => { if (closed) return; closed = true; a.onclose?.(); b.onclose?.(); };
  const a = { start: async () => {}, close, async send(message) { if (closed) throw Error('closed'); queueMicrotask(() => { if (!closed) b.onmessage?.(structuredClone(message)); }); } };
  const b = { start: async () => {}, close, async send(message) { if (closed) throw Error('closed'); queueMicrotask(() => { if (!closed) a.onmessage?.(structuredClone(message)); }); } };
  return [a, b];
}
// Remove prose only; required fields, enums and validation constraints remain official.
function compactSchema(value) {
  if (Array.isArray(value)) return value.map(compactSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['description', 'examples', '$schema'].includes(key)).map(([key, val]) => [key, compactSchema(val)]));
}
export async function officialSession(profile) {
  if (!NOAH_FREE_CLOUD_PROFILES.includes(profile)) throw Error('unsupported_profile');
  await fs.mkdir(workspace, { recursive: true });
  const server = profile === 'memory' ? memory(`${workspace}/memory.jsonl`, 'legacy', undefined, { maxEntities: 100, maxRelations: 200, maxFileBytes: limits.fileBytes }) : profile === 'thinking' ? thinking() : filesystem([workspace]);
  const client = new Client({ name: 'noah-free-cloud', version: '1.0.0' });
  const [a, b] = pair();
  try {
    await server.connect(a); await client.connect(b);
    if (client.getServerVersion()?.version !== NOAH_CLOUD_PROFILES[profile].version) throw Error('official_version_mismatch');
    const listing = await client.listTools();
    const tools = listing.tools.filter(t => profile !== 'filesystem' || filesystemTools.has(t.name));
    if (!tools.length) throw Error('official_tools_missing');
    return {
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: (t.description ?? t.name).slice(0, 300), parameters: compactSchema(t.inputSchema) } })),
      async call(name, args) {
        if (!tools.some(t => t.name === name) || new TextEncoder().encode(JSON.stringify(args)).length > 16384) throw Error('tool_input_limit');
        return client.callTool({ name, arguments: args }, { timeout: 10000 });
      },
      async files() {
        const files = []; let total = 0;
        const visit = async (directory, prefix = '') => {
          for (const item of await fs.readdir(directory, { withFileTypes: true })) {
            const name = prefix + item.name, path = `${directory}/${item.name}`;
            if (item.isSymbolicLink()) throw Error('成果にリンクを含めることはできません。');
            if (name.split('/').length > 8) throw Error('成果のフォルダが深すぎます。');
            if (item.isDirectory()) { await visit(path, `${name}/`); continue; }
            if (!item.isFile()) throw Error('通常ファイルだけ保存できます。');
            const stat = await fs.stat(path); total += stat.size;
            if (stat.size > limits.fileBytes || total > limits.totalFileBytes || files.length >= limits.files - 1) throw Error('成果ファイルの容量が上限を超えました。');
            const bytes = await fs.readFile(path);
            files.push({ name, base64: bytes.toString('base64'), bytes: bytes.length, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('') });
          }
        };
        await visit(workspace); return files;
      },
      close: async () => { await client.close(); await server.close(); },
    };
  } catch (error) { await client.close(); await server.close(); throw error; }
}
export async function executionFile(profile, operations) {
  const text = JSON.stringify({ profile, version: NOAH_CLOUD_PROFILES[profile].version, distribution: NOAH_CLOUD_PROFILES[profile].sha256, runtime: 'official-mcp-workers', operations });
  return { name: 'noah-execution.json', base64: Buffer.from(text).toString('base64'), bytes: new TextEncoder().encode(text).length, sha256: await noahCloudDigest(text) };
}
