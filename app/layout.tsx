import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
export const metadata: Metadata = {
  title: 'RockstarOS — 自動化Hub',
  description:
    '自分の仕事に合うツールを選び、実行して、結果を確かめる。RockstarOSの自動化HubとDeveloper Preview。',
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
