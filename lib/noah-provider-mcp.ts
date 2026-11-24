import { NoahAgentError } from './noah-agent-upload.ts';
import { noahFormArgs, noahToolForm, noahToolSha256, noahResultText } from './noah-form.ts';
import { createNoahGuardedFetch, noahMcpHandshake, noahMcpClose, noahMcpCall, NoahMouthError, type NoahMouthContext } from './noah-mouth-mcp-remote.ts';
import type { ProviderEndpoint, ProviderField } from './noah-gradio.ts';
const secretName = /password|api_?key|access_?token|secret|credential|authorization/i;
export function providerMcpContext(fetcher: typeof fetch, check?: (url: URL) => Promise<void>): NoahMouthContext {
  return { fetch: createNoahGuardedFetch(fetcher, { redirects: 0, sameHost: true, check }) };
}
export function providerMcpError(error: unknown): never {
  if (error instanceof NoahMouthError) {
    const message = error.code === 'auth_required' ? '提供元のログイン・利用許可が必要です。公開接続だけでは実行できません。'
      : error.code === 'payment_required' ? '提供元で支払いが必要です。自動では支払いません。'
      : error.code === 'rate_limited' ? '提供元が混み合っています。時間をおいて再確認してください。'
      : '提供元の接続先を確認できませんでした。停止中、または接続方式が変わっている可能性があります。';
    throw new NoahAgentError(message, 422);
  }
  throw error;
}
export async function prepareProviderMcp(url: string, fetcher: typeof fetch, check?: (url: URL) => Promise<void>) {
  const ctx = providerMcpContext(fetcher, check);
  try {
    const handshake = await noahMcpHandshake(url, { ...ctx, signal: AbortSignal.timeout(8000) });
    try {
      const endpoints: ProviderEndpoint[] = [];
      for (const tool of handshake.tools.slice(0, 100)) {
        const form = noahToolForm(tool);
        if (!form.usable || form.fields.some(f => secretName.test(f.name)) || Object.keys(form.fixed).some(n => secretName.test(n))) continue;
        const fields: ProviderField[] = form.fields.map(f => ({ name: f.name, label: f.label, kind: f.kind, optional: !f.required, value: f.default, choices: f.choices, minimum: f.min, maximum: f.max, integer: f.integer, itemKind: f.itemKind }));
        const toolDigest = await noahToolSha256(tool);
        endpoints.push({ name: tool.name, label: tool.name, description: tool.description.slice(0, 500), fields, form, digest: toolDigest, toolDigest });
      }
      if (!endpoints.length) throw new NoahAgentError('この提供元にはNoahから入力できる操作がありません。専用入力や本人認証への対応が必要です。', 422);
      return { protocol: 'mcp' as const, host: url, prefix: '' as const, endpoints };
    } finally { await noahMcpClose(handshake.session, ctx); }
  } catch (error) { return providerMcpError(error); }
}
export function providerMcpInput(endpoint: ProviderEndpoint, input: Record<string, unknown>) {
  if (!endpoint.form) throw new NoahAgentError('入力定義を読み直してください。', 409);
  const parsed = noahFormArgs(endpoint.form, input);
  if (!parsed.ok) throw new NoahAgentError(parsed.message, 400);
  return parsed.args;
}
/** A fresh handshake and identical tool definition are required immediately before the single call. */
export async function callProviderMcp(url: string, endpoint: ProviderEndpoint, args: unknown, fetcher: typeof fetch, check: ((url: URL) => Promise<void>) | undefined, beforeSend: () => Promise<boolean>, onSend: () => void, revenue?: Parameters<typeof noahMcpCall>[5]) {
  const ctx = providerMcpContext(fetcher, check);
  const handshake = await noahMcpHandshake(url, { ...ctx, signal: AbortSignal.timeout(8000) });
  try {
    const tool = handshake.tools.find(t => t.name === endpoint.name);
    // The raw tool digest is carried inside the freshly generated form plan by the caller.
    if (!tool || !endpoint.form || await noahToolSha256(tool) !== endpoint.toolDigest) throw new NoahAgentError('操作の入力定義が変わりました。接続し直してください。', 409);
    if (!await beforeSend()) return null;
    onSend();
    const result = await noahMcpCall(handshake.session, endpoint.name, args, ctx, 60000, revenue);
    if (!result.ok) throw new NoahAgentError('提供元が処理エラーを返しました。入力内容を確認してください。', 422);
    return noahResultText(result);
  } finally { await noahMcpClose(handshake.session, ctx); }
}
