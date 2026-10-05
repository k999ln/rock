import {
  localModelPresets,
  textModelProviders,
  type TextModelProviderDefinition,
} from './llm-providers.ts';

export type SkyAiMarketplaceEntry = TextModelProviderDefinition & {
  marketplaceId: string;
  category: 'LLM';
  mcpRoute: string;
  defaultModelLabel: string;
  connectionLabel: string;
};

const presetLabel = new Map<string, string>(
  localModelPresets.map((preset) => [preset.value, preset.label]),
);

/** LLMs are first-class Sky Market entries; Sky Broker is their MCP route. */
export const skyAiMarketplaceEntries: readonly SkyAiMarketplaceEntry[] =
  textModelProviders.map((provider) => ({
    ...provider,
    marketplaceId: `llm-${provider.id}`,
    category: 'LLM',
    mcpRoute: 'Sky Broker → MCP tools',
    defaultModelLabel: presetLabel.get(provider.defaultModel) ?? provider.defaultModel,
    connectionLabel:
      provider.locality === 'local'
        ? '端末内・ローカル接続'
        : 'Provider接続・Sky Broker経由',
  }));

export function skyAiMarketplaceEntry(providerId: string) {
  return skyAiMarketplaceEntries.find((entry) => entry.id === providerId) ?? null;
}
