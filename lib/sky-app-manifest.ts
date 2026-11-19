import type { MetadataRoute } from 'next';
import { CAMPUSES, type CampusId } from './campus.ts';

export function skyAppManifest(os: MetadataRoute.Manifest): MetadataRoute.Manifest {
  return {
    ...os,
    id: '/sky',
    name: 'Smith',
    short_name: 'Smith',
    description: 'ツールやAIを探し、接続して使うマーケットプレイス。',
    start_url: '/sky/marketplace',
    scope: '/sky/',
    orientation: 'any',
  };
}

export function campusSkyAppManifest(
  os: MetadataRoute.Manifest,
  campusId: CampusId,
): MetadataRoute.Manifest {
  const base = skyAppManifest(os);
  const shortName = CAMPUSES[campusId].shortName;
  return {
    ...base,
    id: `/sky/campus/${campusId}`,
    name: `${shortName} Smith`,
    short_name: `${shortName} Smith`,
    description: `Smith and Eve for ${shortName} students.`,
    start_url: `/sky/campus/${campusId}/hub`,
    lang: 'en',
  };
}
