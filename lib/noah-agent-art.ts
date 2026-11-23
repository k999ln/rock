/** Artwork describes the catalog entry. It is never used to decide how to run an Agent. */
export type NoahAgentArtScene = 'intake' | 'manual' | 'memory' | 'car-search' | 'photo' | 'evidence' |
  'capital' | 'ledger' | 'journey' | 'files' | 'clock' | 'reasoning' | 'campaign' | 'status' | 'call' |
  'site' | 'verify' | 'api' | 'film' | 'translate' | 'signature';

type Edition = { scene: NoahAgentArtScene; identity: string };
const editions = new Map<string, Edition>();

function key(value: string) {
  return value.normalize('NFKC').trim().toLowerCase();
}

// Catalog, registered and installed views may use different IDs for the same named work.
function edition(scene: NoahAgentArtScene, name: string, ...aliases: string[]) {
  const identity = key(name);
  const art = { scene, identity };
  for (const alias of [name, ...aliases]) editions.set(key(alias), art);
}

edition('intake', '法人のsi導入準備', 'business-si', 'project-777248dbd7e37423d0bae088fc9201cfec479dd305b7d94a544cd22face444ad');
edition('manual', 'Cerebrium Docs', 'mcp-registry:ai.cerebrium/docs');
edition('verify', 'CertifiKit COI tools', 'mcp-registry:ai.certifikit/coi-tools');
edition('ledger', 'CFO+', 'mcp-registry:ai.cfoplus/cfo');
edition('car-search', 'Carfinity car marketplace', 'mcp-registry:ai.carfinity/marketplace');
edition('photo', 'Car Background AI', 'mcp-registry:ai.carbackground/carbackground');
edition('evidence', 'Catalyst evidence graph', 'mcp-registry:ai.catalystproject/evidence-graph');
edition('evidence', '出典整理Agent', 'sky-citation-agent');
edition('capital', 'Capital Company', 'mcp-registry:ai.capitalcompany/capital-company');
edition('journey', 'Capxule', 'mcp-registry:ai.capxule/capxule');
edition('manual', 'ai.byteask/embedded-docs', 'mcp-registry:ai.byteask/embedded-docs');
edition('memory', 'Memory', 'project-fe39bc2610e52b2b6f77059f22f0a485bc356e083bfcc5ff20263ae6713fe10b');
edition('files', 'filesystem', 'project-021f6749196cac636aed6a0a1249245eba463296b00241edcbf7eaa85d420eb9');
edition('clock', 'time', 'project-0b8dcb5ee61c85e2a26f470d3f2547ad5f2c3eec25016f1ecb3f6d48ee71e836');
edition('reasoning', 'sequentialthinking', 'sequential thinking', 'project-53ee717477af6c1f7917f9cb21d5e1318589b00131a478fda6f2a31f605927d1');
edition('status', 'Can I Vibe? — AI coding provider status', 'mcp-registry:ai.canivibe/status');
edition('call', 'CallMCP — Phone Call MCP Server', 'mcp-registry:ai.callmcp/server');
edition('campaign', 'Campaign Pack', 'mcp-registry:ai.campaignpack/campaignpack');
edition('site', 'Cactal', 'mcp-registry:ai.cactal/cactal');
edition('verify', 'BUMIT', 'mcp-registry:ai.bumit/verify-business');
edition('api', 'Orbit', 'mcp-registry:ai.buildwithorbit/orbit');
edition('film', 'ArcReel');
edition('film', 'autoclip');
edition('film', 'openmotion');
edition('translate', 'LinguaGacha');

// Match concrete operations in a listing. A generic description gets an abstract signature.
const capabilities: ReadonlyArray<readonly [NoahAgentArtScene, RegExp]> = [
  ['translate', /\b(translat(?:e|es|ion)|localiz(?:e|ation))\b|翻訳|翻译/u],
  ['film', /\b(storyboards?|video (?:edit(?:or|ing)|clipping|production)|film styles|motion graphics)\b|動画編集/u],
  ['photo', /(?:replace|remove|edit).{0,30}(?:background|photo)|背景(?:を)?(?:消|削除|置換)/u],
  ['clock', /time ?zone conversion|時差計算|時間帯.{0,6}変換/u],
  ['files', /\b(file ?system|organize files|file manager)\b|ファイル(?:を|の)?(?:整理|管理)/u],
  ['memory', /knowledge graph|persistent memory|メモの中の関係/u],
  ['manual', /search.{0,30}(?:documentation|docs)|page-cited retrieval|ドキュメント検索/u],
  ['status', /health checks?|service status|稼働状況/u],
  ['verify', /certificate of insurance|business verification|証明書.{0,5}(?:確認|照合)/u],
  ['api', /integrate public apis|api discovery/u],
  ['call', /phone calls?|電話(?:を)?(?:かけ|発信)/u],
];

export function resolveNoahAgentArt(id: string, name: string, summary = '') {
  const title = key(name);
  const sourceId = key(id).replace(/@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u, '');
  const art = editions.get(sourceId) ?? editions.get(title);
  const identity = art?.identity ?? (sourceId || title);
  const scene = art?.scene ?? capabilities.find(([, match]) => match.test(title + ' ' + key(summary)))?.[0] ?? 'signature';
  let seed = 2166136261;
  for (const character of identity) seed = Math.imul(seed ^ character.codePointAt(0)!, 16777619) >>> 0;
  return { scene, seed, signature: seed.toString(16).padStart(8, '0') };
}
