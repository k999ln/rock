/**
 * Eve が作った部品のうち、LLM を使う物の共通の形（task 130、2026-11-24）。
 *
 * 部品は LLM を直接は知らない。呼び出し役（EveLlm）を受け取り、温度 0 で 1 回だけ呼ぶ。呼び直さない。
 * 開発の手元では scripts/eve-local-llm.py の Qwen（本人の決定「本人の許可までは手元の Qwen」）。
 * 本番で別のモデルを使う時は、版の hash が変わるので、同じ見本で確かめ直すまで工程に当てない（eve-combination の規則 8）。
 */

export type EveLlmMessage = { role: 'system' | 'user'; content: string };
export type EveLlm = (request: { messages: readonly EveLlmMessage[]; maxTokens: number; temperature: 0 }) => Promise<{ text: string; model: string }>;

/** scripts/eve-local-llm.py の呼び出し役。127.0.0.1 だけ。 */
export function eveLocalLlm(origin = 'http://127.0.0.1:8787', fetcher: typeof fetch = fetch): EveLlm {
  const url = new URL('/chat', origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('手元の LLM だけを呼びます。');
  return async (request) => {
    const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(900_000) });
    if (!response.ok) throw new Error(`手元の LLM が ${response.status} を返しました。`);
    const data = (await response.json()) as { text?: unknown; model?: unknown; modelSha256?: unknown };
    if (typeof data.text !== 'string') throw new Error('手元の LLM の返事が読めません。');
    return { text: data.text, model: `${String(data.model)}#${String(data.modelSha256)}` };
  };
}

/** 文字数（書記素で数える）。 */
export const eveGraphemes = (text: string) => Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)).length;

/** モデルの返事から、前後の飾り（``` の囲み・見出しの #・前置き）を外す。 */
export function eveCleanLlmText(text: string) {
  return text
    .replace(/^```[a-z]*\n?|```$/gimu, '')
    .split('\n')
    .map((l) => l.replace(/^#{1,6}\s*/u, '').trimEnd())
    .join('\n')
    .trim();
}
