import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'LOOP — 自動化ハブ', description: '無料の自動化ツールを見つけ、導入と収益・コストの試算をまとめる。LOOPの初期版。' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ja"><body>{children}</body></html>; }
