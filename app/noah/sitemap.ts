import type { MetadataRoute } from 'next';
import { COWAGENT_GUIDE_PATH, NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-guide';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/noah/agents', '/noah/mac', COWAGENT_GUIDE_PATH].map((path) => ({
    url: NOAH_PUBLIC_ORIGIN + path,
  }));
}
