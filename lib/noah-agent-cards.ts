import type { NoahCollectionItem } from './noah-collection.ts';
import type { NoahPinTopic } from './noah-pins.ts';
export type NoahAgentSource = Pick<NoahCollectionItem, 'source' | 'sourceUrl' | 'author' | 'metrics' | 'observedAt' | 'createdAt'>;
export type NoahAgentCard = {
  id: string; name: string; provider: string; summary: string; host: string | null; users: number; oneTap: boolean;
  topic: NoahPinTopic; shape: 0 | 1 | 2; savedIn: string[];
  feedbackId?: string; href?: string; external?: boolean; sources?: NoahAgentSource[]; run?: NoahCollectionItem['run'];
};
