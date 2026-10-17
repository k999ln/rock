import AvocadoProgress from '@/components/sky-avocado-progress';
import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'avocadoの4年間 · Sky',
  description: '建築とavocadoの4年間をSkyで確認する所有者専用の進捗画面。',
};

export default async function AvocadoSkyPage() {
  const requestHeaders = await headers();
  if (!requestHeaders.get('oai-authenticated-user-id')) {
    redirect('/signin-with-chatgpt?return_to=%2Fsky%2Favocado');
  }
  const ownerEmail = (env as unknown as { SKY_AVOCADO_OWNER_EMAIL?: string }).SKY_AVOCADO_OWNER_EMAIL;
  if (!ownerEmail || requestHeaders.get('oai-authenticated-user-email')?.trim().toLowerCase() !== ownerEmail.trim().toLowerCase()) {
    notFound();
  }
  return <AvocadoProgress />;
}
