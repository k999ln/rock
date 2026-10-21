import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ColumbiaFeed from '@/app/sky/campus/[campusId]/columbia-feed';
import HomeScreen from '@/components/home-screen';
import { campusForHost } from '@/lib/campus-host';

const homeMetadata: Metadata = {
  title: 'RockstarOS — 自分のSI環境を、どこからでも',
  description:
    '会員登録・ログインしてSkyの能力を追加し、Eveの会話・仕事・成果を同じアカウントで引き継ぐWebOS。',
};

const columbiaMetadata: Metadata = {
  title: 'Sky for Columbia — Avocado',
  description:
    'A curated Sky feed connecting Columbia students to research, planning, and invention tools.',
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
  return <HomeScreen />;
}
