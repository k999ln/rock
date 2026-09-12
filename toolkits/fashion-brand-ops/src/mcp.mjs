import { TOOL_DEFINITIONS } from './tools.mjs';
import { publicError } from './util.mjs';

export const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18'];

export class McpProtocol {
  constructor(callTool) {
    this.callTool = callTool;
  }
  async handle(message) {
    if (
      !message ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string'
    )
      return this.error(message?.id ?? null, -32600, 'Invalid Request');
    if (message.method.startsWith('notifications/')) return null;
    if (message.method === 'initialize') {
      const requested = message.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOLS[0];
      return this.result(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fashion-brand-ops-mcp', version: '0.3.0' },
        instructions:
          'Planning and drafts may run locally. Posting, advertising, messaging, billing, refunds, and notifications require an exact signed approval.',
      });
    }
    if (message.method === 'ping') return this.result(message.id, {});
    if (message.method === 'tools/list')
      return this.result(message.id, { tools: TOOL_DEFINITIONS });
    if (message.method === 'tools/call') {
      try {
        const output = await this.callTool(
          message.params?.name,
          message.params?.arguments || {},
        );
        return this.result(message.id, {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        });
      } catch (error) {
        const text = publicError(error);
        return this.result(message.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: text }) }],
          structuredContent: { error: text },
          isError: true,
        });
      }
    }
    return this.error(message.id, -32601, 'Method not found');
  }
  result(id, result) {
    return { jsonrpc: '2.0', id, result };
  }
  error(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}
