import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const logo = await sharp(fileURLToPath(new URL('public/brand/noah-icon-transparent.svg', root)))
  .resize(144, 144).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="1" y="1" width="1198" height="628" rx="20" fill="none" stroke="#dce2e8" stroke-width="2"/>
  <g font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif" fill="#17212b">
    <text x="64" y="132" font-family="Arial, sans-serif" font-size="70" font-weight="700">Noah</text>
    <text x="66" y="179" font-size="23" fill="#52606d">あなたのAgentワークスペース</text>
    <text x="64" y="290" font-size="58" font-weight="600">Agentを見つける。</text>
    <text x="64" y="373" font-size="58" font-weight="600">仕事を任せる。成果を受け取る。</text>
    <text x="66" y="449" font-size="26" fill="#52606d">自分のAgentも、ここから公開。</text>
    <path d="M64 502H1136" stroke="#dce2e8"/>
    <text x="66" y="565" font-family="Arial, sans-serif" font-size="25" fill="#52606d">avoado.si/noah</text>
    <text x="1134" y="565" text-anchor="end" font-family="Arial, sans-serif" font-size="20" fill="#52606d">Agent workspace</text>
  </g>
</svg>`;
await sharp(Buffer.from(svg)).composite([{ input: logo, left: 992, top: 60 }])
  .png().toFile(fileURLToPath(new URL('public/brand/noah-social-card-v1.png', root)));
