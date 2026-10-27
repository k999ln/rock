import { redirect } from 'next/navigation';

/** Compatibility for existing product-page and sitemap links to /install. */
export default function InstallPage() {
  // Fixed destination: drop queries and prevent old URL fragments being inherited.
  redirect('/connect#');
}
