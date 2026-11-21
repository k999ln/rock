// 合成の MCP サーバー（Streamable HTTP）。通信はしない。options で相手の振る舞いを変え、受け取った要求を log に残す。
// docs/design-validation/noah/noah-mouth.test.mjs の合成のサーバーと同じ作り（握手・巡回・接続の試験で使う）。
export const sse = (...messages) => new Response(messages.map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
export const json = (message, headers = {}) => Response.json(message, { headers });
/** 道具の定義。readOnly が null なら、読み取りだけの宣言を付けない。 */
export const tool = (name, readOnly = true, extra = {}) => ({ name, description: `${name} の説明`, inputSchema: { type: 'object', properties: {} }, ...(readOnly === null ? {} : { annotations: { readOnlyHint: readOnly } }), ...extra });

export function mcpServer(options = {}) {
  const log = [];
  const state = { tools: options.tools ?? [tool('read_thing'), tool('write_thing', false)] };
  const handler = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ url: String(url), method: init.method, rpc: body?.method, headers: Object.fromEntries(headers), body });
    await options.before?.(body, init);
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const status = typeof options.status === 'function' ? options.status(body) : options.status;
    if (status) return new Response('', { status, headers: options.statusHeaders ?? {} });
    if (options.needsToken && headers.get('authorization') !== `Bearer ${options.needsToken}`)
      return new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", scope="things:read"' } });
    const reply = (result) => (options.sse ? sse(...(options.noise ? [{ jsonrpc: '2.0', method: 'notifications/progress', params: {} }] : []), { jsonrpc: '2.0', id: body.id, result }) : json({ jsonrpc: '2.0', id: body.id, result }, options.session && body.method === 'initialize' ? { 'mcp-session-id': options.session } : {}));
    if (body.method === 'initialize') {
      if (options.rejects?.includes(body.params.protocolVersion)) return json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Unsupported protocol version' } });
      return reply({ protocolVersion: options.answers ?? body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic' } });
    }
    if (options.session && headers.get('mcp-session-id') !== options.session) return new Response('', { status: 400 });
    if (body.method === 'notifications/initialized') return new Response(null, { status: options.notifyStatus ?? 202 });
    if (body.method === 'tools/list') {
      const size = options.pageSize ?? state.tools.length;
      const start = Number(body.params.cursor ?? 0);
      const page = state.tools.slice(start, start + size);
      return reply({ tools: page, ...(start + size < state.tools.length ? { nextCursor: String(start + size) } : {}) });
    }
    if (body.method === 'tools/call') return reply(options.call?.(body.params) ?? { content: [{ type: 'text', text: `${body.params.name} ok` }] });
    return new Response('', { status: 404 });
  };
  return { fetch: handler, log, state, options };
}

/**
 * host ごとに振り分ける fetch。routes は { 'host.example.com': (url, init) => Response }。
 * 知らない host は「つながらない」。受けた host を、順に hosts に残す（送っていない事を確かめるのに使う）。
 */
export function network(routes) {
  const hosts = [];
  const fetch = async (url, init) => {
    const { hostname } = new URL(String(url));
    hosts.push(hostname);
    const route = routes[hostname];
    if (!route) throw new TypeError('fetch failed');
    return route(url, init);
  };
  return { fetch, hosts, routes };
}
