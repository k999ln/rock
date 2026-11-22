export const researchKindLabels = {
  agent: 'Agent本体候補', candidate: '分類確認待ち', framework: '開発基盤・SDK',
  tool: 'Tool・MCP', template: 'Skill・テンプレート', resource: '教材・一覧・規約',
  other: 'ゲーム・ロボット等', model: 'モデル', dataset: 'データセット',
} as const;
export type ResearchKind = keyof typeof researchKindLabels;
export type ResearchSummary = {
  id: string; name: string; kind: ResearchKind; level: 'primary' | 'discovered';
  summary: string; author: string; tags: string[]; detailPath: string; reason?: string;
};
export type ResearchDetail = Omit<ResearchSummary, 'detailPath'> & {
  asOf: string; identity: 'name_group' | 'distribution';
  connection: 'existing_anicca' | 'not_tested'; price: string; license: string;
  sources: { url: string; label: string; type: 'directory' | 'primary' | 'citation' }[];
  references: { dataset: string; ref: string }[]; notes: string[];
};
export type ResearchPage = {
  ownerScope?: string | null;
  entries: ResearchSummary[]; total: number; nextCursor: string | null;
  revision: string; asOf: string;
  stats: { total: number; kinds: Record<ResearchKind, number>; primaryReviewed: number; nameGroups: number };
};
