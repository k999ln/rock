type McpContent = { type?: unknown; text?: unknown };

export function describeMcpToolResult(value: unknown): {
  ok: boolean;
  text: string;
} {
  const missing = { ok: false, text: 'MCPは成果本文を返しませんでした。' };
  if (typeof value === 'string')
    return value.trim() ? { ok: true, text: value } : missing;
  if (!value || typeof value !== 'object')
    return value === null || value === undefined
      ? missing
      : { ok: true, text: JSON.stringify(value) };

  const result = value as {
    isError?: unknown;
    content?: unknown;
    structuredContent?: unknown;
  };
  const failed = result.isError === true;
  const content = Array.isArray(result.content)
    ? (result.content as McpContent[])
        .filter((item) => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text as string)
        .join('\n')
    : '';
  const structured = result.structuredContent;
  const output =
    structured && typeof structured === 'object'
      ? (structured as { output?: unknown }).output
      : undefined;
  const text = failed
    ? content || 'MCPからエラーが返りました。'
    : typeof output === 'string' && output.trim()
      ? output
      : content.trim()
        ? content
        : structured && typeof structured === 'object' && Object.keys(structured).length > 0
          ? JSON.stringify(structured, null, 2)
          : '';

  return text ? { ok: !failed, text } : missing;
}
