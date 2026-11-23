import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from './noah-public-origin';

const title = 'Noah — Agentストア';
const description = 'Agentを見つけ、仕事を任せ、成果を受け取る。自分のAgentも公開できる、あなたとAgentのワークスペース。';
const image = {
  url: `${NOAH_PUBLIC_ORIGIN}/brand/noah-social-card-orange.png`,
  width: 1200,
  height: 630,
  alt: 'Noah — Agentを見つける。仕事を任せる。成果を受け取る。',
};

/** Public entry pages expose card metadata in HTML, without client execution. */
export function noahShareMetadata(path: '/' | '/noah'): Metadata {
  const url = `${NOAH_PUBLIC_ORIGIN}${path}`;
  return {
    metadataBase: new URL(NOAH_PUBLIC_ORIGIN),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ja_JP',
      siteName: 'Noah',
      url,
      title,
      description,
      images: [{ ...image, type: 'image/png' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
