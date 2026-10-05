export type RemoteAiTextRequest = {
  model: string;
  prompt: string;
  system?: string;
  maxOutputTokens: number;
};

/** Shared browser/server digest for the exact text-only Responses request. */
export async function remoteAiTextRequestDigest(intent: RemoteAiTextRequest) {
  const value = {
    domain: 'rockstar-remote-ai-text-request/1',
    provider: 'openai',
    model: intent.model.trim(),
    input: [
      ...(intent.system ? [{ role: 'system', content: intent.system.trim() }] : []),
      { role: 'user', content: intent.prompt.trim() },
    ],
    max_output_tokens: intent.maxOutputTokens,
    service_tier: 'default',
    store: false,
  };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
