import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin });

input.on('line', (line) => {
  const message = JSON.parse(line);
  if (!Object.hasOwn(message, 'id')) return;

  let result;
  if (message.method === 'initialize') {
    result = {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'legacy-mcp-fixture', version: '1.0.0' },
    };
  } else if (message.method === 'tools/list') {
    result = {
      tools: [
        {
          name: 'legacy_echo',
          description: 'Returns a fixture value.',
          inputSchema: { type: 'object', additionalProperties: false },
        },
      ],
    };
  } else if (message.method === 'tools/call') {
    result = { content: [{ type: 'text', text: 'legacy-ok' }] };
  } else {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      })}\n`,
    );
    return;
  }

  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`,
  );
});
