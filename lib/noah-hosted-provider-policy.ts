/** Reviewed shared demos need a private deployment/owner-authorized integration before use from Noah. */
const heldSpaces = new Set([
  'americo/agente_analista',
  'mma666/agentic_dealii_assistant',
  'krishna260262/agentic-rag-assistant',
  'agents-mcp-hackathon/application-assistant',
  'agentxortron/hermes_agent',
  'lazyhuman/laya-browser-mcp',
  'akashmj22122002/deep_research-personal',
  'miguelbayansoares/research_agent',
  'kaushikpaul/ai-agentic-coder',
  'agents-mcp-hackathon/opensorus',
  'oshawoetta/pokemon_agents',
]);
export function noahHostedProviderHeld(repository: string) {
  return heldSpaces.has(repository.toLowerCase());
}
