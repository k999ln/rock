import type { Metadata } from 'next';
import HomeScreen from '@/components/home-screen';

export const metadata: Metadata = {
  title: 'RockstarOS — 自分のSI環境を、どこからでも',
  description:
    '会員登録・ログインしてSmithの能力を追加し、Eveの会話・仕事・成果を同じアカウントで引き継ぐWebOS。',
};

export default function Home() {
  return <HomeScreen />;
}
