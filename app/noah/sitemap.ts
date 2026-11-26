import type { MetadataRoute } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
import { MAIN_DISCOVERY_PATHS } from '@/services/sky-web/main-page-policy.mjs';
export default function sitemap(): MetadataRoute.Sitemap {
  return MAIN_DISCOVERY_PATHS.map(path => ({ url: NOAH_PUBLIC_ORIGIN + path }));
}
