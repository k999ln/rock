import type { MetadataRoute } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
export default function sitemap():MetadataRoute.Sitemap{return ['/noah','/noah/explore','/noah/help'].map(path=>({url:NOAH_PUBLIC_ORIGIN+path}));}
