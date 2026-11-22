import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ColumbiaFeed from '@/app/sky/campus/[campusId]/columbia-feed';
import OsHomeEntry from '@/components/os-home-entry';
import { campusForHost } from '@/lib/campus-host';
import { noahShareMetadata } from '@/lib/noah-share-metadata';

const homeMetadata: Metadata = noahShareMetadata('/');

const columbiaMetadata: Metadata = {
  title: 'smis for Columbia — Avocado',
  description:
    'A curated smis feed connecting Columbia students to research, planning, and invention tools.',
};

async function requestedCampus() {
  return campusForHost((await headers()).get('host'));
}

export async function generateMetadata(): Promise<Metadata> {
  return (await requestedCampus()) === 'columbia'
    ? columbiaMetadata
    : homeMetadata;
}

export default async function Home() {
  if ((await requestedCampus()) === 'columbia') return <ColumbiaFeed />;
  return <OsHomeEntry />;
}
