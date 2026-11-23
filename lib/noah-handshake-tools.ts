/** A public, display-only projection of a provider's tools/list definition. */
export type NoahHandshakeField = { name: string; type: string | null };
export type NoahHandshakeSchema = { type: string | null; fields: NoahHandshakeField[] };
export type NoahHandshakeTool = {
  name: string;
  description: string;
  input: NoahHandshakeSchema;
  output: NoahHandshakeSchema | null;
};

export type NoahHandshakeToolSeries = {
  candidateId: string;
  toolsSha256: string;
  tools: NoahHandshakeTool[];
};

const JSON_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function schemaType(value: unknown): string | null {
  const types = (Array.isArray(value) ? value : [value]).filter(
    (type): type is string => typeof type === 'string' && JSON_TYPES.has(type),
  );
  return [...new Set(types)].join(' | ') || null;
}

function displayText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
}

function displaySchema(schema: unknown): NoahHandshakeSchema | null {
  const shape = record(schema);
  if (!shape) return null;
  // Keep the provider's field names and declared types. Drop defaults, enums,
  // examples, and other schema values from this public projection.
  const fields = Object.entries(record(shape.properties) ?? {}).map(([name, definition]) => ({
    name: displayText(name),
    type: schemaType(record(definition)?.type),
  })).filter(({ name }) => name !== '');
  return { type: schemaType(shape.type), fields };
}

export function noahHandshakeTool(tool: {
  name: string; description: string; inputSchema: unknown; outputSchema?: unknown;
}): NoahHandshakeTool {
  return {
    name: displayText(tool.name),
    description: displayText(tool.description),
    input: displaySchema(tool.inputSchema) ?? { type: null, fields: [] },
    output: displaySchema(tool.outputSchema),
  };
}

export function currentNoahHandshakeTools(
  series: NoahHandshakeToolSeries | undefined,
  candidateId: string,
  toolsSha256: string | null,
  toolCount: number | null,
): NoahHandshakeTool[] {
  return series && series.candidateId === candidateId && series.toolsSha256 === toolsSha256
    && series.tools.length === toolCount ? series.tools : [];
}
