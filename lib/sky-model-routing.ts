import { isLoopbackLlmEndpoint, type LlmRuntimeEnv, type TextModelProviderId } from './llm-providers.ts';

export type ModelCandidate = { provider: TextModelProviderId; model: string; cloud?: boolean };

/** A transparent heuristic, not a benchmark or a grant of execution permission. */
export function chooseSkyModel(prompt: string, candidates: ModelCandidate[]) {
  const coding = /コード|実装|デバッグ|プログラ|\b(code|coding|debug|typescript|python|javascript)\b/i.test(prompt);
  const ranked = candidates.map((candidate, index) => ({ candidate, index,
    score: /coder|codestral|starcoder/i.test(candidate.model) === coding ? 1 : 0,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  if (!ranked.length) return null;
  return { ...ranked[0].candidate,
    reason: `${coding ? 'コード作業向け' : '一般対話向け'}候補を優先。${ranked[0].candidate.cloud ? '無料Cloud' : 'ローカル'}のモデル一覧から選択。`,
    policy: 'verified-free-cloud-and-local' as const,
  };
}

/** Read-only discovery; never generates tokens, downloads models, or follows redirects. */
export async function discoverSkyLocalModels(runtime: LlmRuntimeEnv, fetcher: typeof fetch = fetch): Promise<ModelCandidate[]> {
  const endpoints: { provider: TextModelProviderId; base?: string; key?: string }[] = [
    { provider: 'local-model', base: runtime.SKY_LOCAL_LLM_BASE_URL, key: runtime.SKY_LOCAL_LLM_API_KEY },
    { provider: 'ollama', base: runtime.SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434' },
    { provider: 'openai-compatible', base: runtime.SKY_LLM_COMPATIBLE_BASE_URL, key: runtime.SKY_LLM_COMPATIBLE_API_KEY },
  ];
  const results = await Promise.all(endpoints.map(async ({ provider, base, key }) => {
    if (!base || !isLoopbackLlmEndpoint(base)) return [];
    const root = base.replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/v1$/, '');
    try {
      const response = await fetcher(`${root}${provider === 'ollama' ? '/api/tags' : '/v1/models'}`, {
        redirect: 'manual', signal: AbortSignal.timeout(2500),
        headers: key ? { Authorization: `Bearer ${key}` } : {},
      });
      if (!response.ok) return [];
      const payload = await response.json() as { models?: { name?: unknown }[]; data?: { id?: unknown }[] };
      const rows = provider === 'ollama' ? payload.models : payload.data;
      if (!Array.isArray(rows)) return [];
      return rows.slice(0, 100).flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const model = provider === 'ollama' ? (row as { name?: unknown }).name : (row as { id?: unknown }).id;
        return typeof model === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model) ? [{ provider, model }] : [];
      });
    } catch { return []; }
  }));
  return results.flat();
}
