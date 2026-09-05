import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Rock star — Fund Club',
  description:
    '選んで、動かして、みんなで育てる。自動化を詰めたファンドを選び、実行状況と分配プランを確認するRock star Fund Club。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
