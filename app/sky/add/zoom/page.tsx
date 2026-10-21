import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import SkyAddZoomPrototype from '@/components/sky-add-zoom-prototype';
import { inspectZoomHomeLaunch } from '@/lib/sky-add-zoom-launch.server';

export const metadata: Metadata = {
  title: 'Sky Add — Zoom Appなしで始める試作',
  description: 'Zoom Appの追加なしにSkyからAgentを探す導線と、手入力の成果表示を試す画面。',
};

export default async function SkyAddZoomPage() {
  const requestHeaders = await headers();
  const secret = (env as unknown as { ZOOM_ADD_APP_CLIENT_SECRET?: string }).ZOOM_ADD_APP_CLIENT_SECRET;
  const launch = await inspectZoomHomeLaunch(requestHeaders.get('x-zoom-app-context'), secret);
  return <SkyAddZoomPrototype launch={launch} />;
}
