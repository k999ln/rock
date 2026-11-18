// Server-only catalog index. The browser receives at most 50 summaries per page.
// Keep 80k records as data, not an enormous inferred TS/object-literal module.
import source from '../data/noah-research-index.json?raw';
import { createResearchCatalog, type ResearchIndex } from './noah-research-query.ts';
export const noahResearchCatalog = createResearchCatalog(JSON.parse(source) as ResearchIndex);
