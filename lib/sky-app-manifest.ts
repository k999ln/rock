import type { MetadataRoute } from 'next';

export function skyAppManifest(os: MetadataRoute.Manifest): MetadataRoute.Manifest {
  return {
    ...os,
    id: '/os/sky',
    name: 'Sky',
    short_name: 'Sky',
    description: 'ツールやAIを探し、接続して使うマーケットプレイス。',
    start_url: '/os/sky/marketplace',
    scope: '/os/sky/',
    orientation: 'any',
  };
}
