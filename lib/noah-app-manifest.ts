import type { MetadataRoute } from 'next';
import { webManifestIcons } from './web-brand.ts';

export function noahAppManifest(): MetadataRoute.Manifest {
  return {
    id: '/noah',
    name: 'Noah',
    short_name: 'Noah',
    description: 'Agentを見つけ、接続し、自分の用途に合わせて管理する。',
    start_url: '/noah/agents',
    scope: '/noah/',
    display: 'standalone',
    lang: 'ja',
    dir: 'ltr',
    background_color: '#000000',
    theme_color: '#000000',
    categories: ['productivity', 'utilities'],
    prefer_related_applications: false,
    icons: webManifestIcons,
  };
}
