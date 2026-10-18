import { catalog } from './catalog.ts';
import { checkCoconala, formatCitations, makeFreeArticle } from './mr-tools.ts';
import { routeSkyRequest } from './sky-routing.ts';
import { skyToolExecutionScope } from './sky-tool-execution-scope.ts';

export const SKY_MCP_VERSION = '2026-07-28';
const EXECUTABLE_IDS = new Set(['mr-citations', 'coconala', 'mr-free-article']);
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const skyMcpTools = [
  {
    name: 'sky_find_tools', title: 'Find Sky tools',
    description: 'Use this to find a Sky capability for a task. Returns catalog entries and clearly marks which tools this bridge can actually execute; searching does not run a tool.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['request'], additionalProperties: false },
    annotations,
  },
  {
    name: 'sky_route_request', title: 'Route a request in Sky',
    description: 'Use this to identify Sky’s existing role for a request. It is a rule-based suggestion, not tool execution or a claim that a connector is online.',
    inputSchema: { type: 'object', properties: { request: { type: 'string', minLength: 1, maxLength: 8000 } }, required: ['request'], additionalProperties: false },
    annotations,
  },
  {
    name: 'sky_format_citations', title: 'Organize citations',
    description: 'Use this to organize source links already present in supplied Markdown with Sky’s local citation formatter. No source is fetched or fact-checked, and nothing is published.',
    inputSchema: { type: 'object', properties: { markdown: { type: 'string', minLength: 1, maxLength: 8000 }, language: { type: 'string', enum: ['ja', 'en'] } }, required: ['markdown', 'language'], additionalProperties: false },
    annotations,
  },
  {
    name: 'sky_check_coconala', title: 'Check a Coconala proposal',
    description: 'Use this for Sky’s bounded pre-application rule check of a Coconala brief and proposal. It does not apply, send a message, verify platform terms, or guarantee acceptance.',
    inputSchema: { type: 'object', properties: { brief: { type: 'string', minLength: 1, maxLength: 8000 }, proposal: { type: 'string', minLength: 1, maxLength: 8000 }, bucket: { type: 'string', enum: ['single', 'retainer'] }, orderRate: { type: ['number', 'null'], minimum: 0, maximum: 100 } }, required: ['brief', 'proposal', 'bucket', 'orderRate'], additionalProperties: false },
    annotations,
  },
  {
    name: 'sky_make_free_article', title: 'Make a free article excerpt',
    description: 'Use this to transform a user-supplied complete article into a free excerpt using Sky’s deterministic article tool. It does not write new claims, upload, publish, or charge for anything.',
    inputSchema: { type: 'object', properties: { markdown: { type: 'string', minLength: 1, maxLength: 8000 }, afterChars: { type: 'integer', minimum: 1, maximum: 8000 }, summary: { type: 'string', minLength: 1, maxLength: 2000 }, price: { type: 'integer', minimum: 1, maximum: 1000000 }, paidContents: { type: 'string', minLength: 1, maxLength: 1000 }, noteUrl: { type: 'string', minLength: 1, maxLength: 500 } }, required: ['markdown', 'afterChars', 'summary', 'price', 'paidContents', 'noteUrl'], additionalProperties: false },
    annotations,
  },
] as const;

type RpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type RpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, names: string[]) {
  return Object.keys(value).every((key) => names.includes(key));
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum;
}

function toolResult(value: unknown) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], structuredContent: typeof value === 'string' ? { text: value } : value };
}

function findTools(request: string) {
  const query = request.trim().toLowerCase();
  const routed = routeSkyRequest(request)?.toolId;
  const terms = query.split(/\s+/).filter(Boolean);
  const matches = catalog.map((tool) => {
    const haystack = `${tool.id} ${tool.name} ${tool.category} ${tool.description}`.toLowerCase();
    const hits = terms.filter((term) => haystack.includes(term)).length;
    return { tool, score: hits + (tool.id === routed ? 5 : 0) };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(EXECUTABLE_IDS.has(b.tool.id)) - Number(EXECUTABLE_IDS.has(a.tool.id)))
    .slice(0, 8);
  return {
    query: request,
    tools: matches.map(({ tool }) => ({
      id: tool.id, name: tool.name, category: tool.category,
      description: tool.description, catalogStatus: tool.status,
      executionScope: skyToolExecutionScope(tool),
      bridgeStatus: EXECUTABLE_IDS.has(tool.id) ? 'callable_here' : 'catalog_only',
      cost: tool.cost,
    })),
    note: 'catalog_only means this MCP bridge does not execute that tool. Sky may require a separate connection, approval, or payment.',
  };
}

function runTool(name: string, args: unknown): unknown {
  if (!record(args)) throw new Error('Input must be an object.');
  if (name === 'sky_find_tools') {
    if (!exact(args, ['request']) || !bounded(args.request, 200)) throw new Error('Provide a request of 1–200 characters.');
    return findTools(args.request);
  }
  if (name === 'sky_route_request') {
    if (!exact(args, ['request']) || !bounded(args.request, 8000)) throw new Error('Provide a request of 1–8000 characters.');
    const role = routeSkyRequest(args.request);
    return role ? { matched: true, ...role, executed: false } : { matched: false, executed: false };
  }
  if (name === 'sky_format_citations') {
    if (!exact(args, ['markdown', 'language']) || !bounded(args.markdown, 8000) || (args.language !== 'ja' && args.language !== 'en')) throw new Error('Provide Markdown and language ja or en.');
    return { markdown: formatCitations(args.markdown, args.language), factChecked: false, published: false };
  }
  if (name === 'sky_check_coconala') {
    if (!exact(args, ['brief', 'proposal', 'bucket', 'orderRate']) ||
      !bounded(args.brief, 8000) || !bounded(args.proposal, 8000) ||
      (args.bucket !== 'single' && args.bucket !== 'retainer') ||
      !(args.orderRate === null || (typeof args.orderRate === 'number' && Number.isFinite(args.orderRate) && args.orderRate >= 0 && args.orderRate <= 100))) throw new Error('Provide a valid brief, proposal, bucket, and orderRate.');
    return { ...checkCoconala({ brief: args.brief, proposal: args.proposal, bucket: args.bucket, orderRate: args.orderRate }), submitted: false };
  }
  if (name === 'sky_make_free_article') {
    if (!exact(args, ['markdown', 'afterChars', 'summary', 'price', 'paidContents', 'noteUrl']) ||
      !bounded(args.markdown, 8000) || !Number.isInteger(args.afterChars) || Number(args.afterChars) < 1 || Number(args.afterChars) > 8000 ||
      !bounded(args.summary, 2000) || !Number.isInteger(args.price) || Number(args.price) < 1 || Number(args.price) > 1000000 ||
      !bounded(args.paidContents, 1000) || !bounded(args.noteUrl, 500)) throw new Error('Provide valid article text, excerpt length, summary, price, paid-content description, and note URL.');
    return { markdown: makeFreeArticle({ markdown: args.markdown, afterChars: Number(args.afterChars), summary: args.summary, price: Number(args.price), paidContents: args.paidContents, noteUrl: args.noteUrl }), published: false };
  }
  throw new Error('Tool is not exposed by this bridge.');
}

export function handleSkyMcpMessage(input: unknown, authenticated: boolean): RpcResponse | null {
  if (!record(input)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request.' } };
  const request = input as RpcRequest;
  const id = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null;
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request.' } };
  if (request.method === 'notifications/initialized') return null;
  if (id === null) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request id is required.' } };
  if (request.method === 'server/discover') return { jsonrpc: '2.0', id, result: { supportedVersions: [SKY_MCP_VERSION], capabilities: { tools: {} } } };
  if (request.method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: SKY_MCP_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'sky-codex-bridge', version: '1.0.0' }, instructions: 'Sky is the tool foundation. Find a capability first; only callable_here tools can execute in this bridge. All exposed actions are deterministic, read-only, and 0-yen. Catalog-only tools require a separate connection and approval.' } };
  if (request.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (request.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: skyMcpTools } };
  if (request.method !== 'tools/call') return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found.' } };
  if (!authenticated) return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Sign in to Sky before calling tools.' } };
  const params = request.params;
  if (!record(params) || typeof params.name !== 'string' || !skyMcpTools.some((tool) => tool.name === params.name)) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool.' } };
  try {
    return { jsonrpc: '2.0', id, result: toolResult(runTool(params.name, params.arguments)) };
  } catch (error) {
    return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message.slice(0, 300) : 'Tool failed.' }] } };
  }
}
