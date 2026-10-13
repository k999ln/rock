import type { CampusId } from './campus.ts';

// Curate existing catalog tools; this does not change tool readiness or access.
export const SKY_CAMPUS_RECOMMENDATIONS: Record<CampusId, readonly string[]> = {
  nyu: ['mr-free-article', 'mr-citations', 'rockstar-patent-assistant'],
  fit: ['fashion-brand-ops', 'mr-free-article', 'mr-citations'],
  columbia: ['mr-citations', 'rockstar-patent-assistant', 'mr-free-article'],
  fordham: ['coconala', 'mr-free-article', 'mr-citations'],
  johnjay: ['mr-citations', 'rockstar-legal-intake', 'mr-free-article'],
};
