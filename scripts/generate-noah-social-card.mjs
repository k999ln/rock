import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const asset = name => fileURLToPath(new URL('public/brand/' + name, root));
const silhouette = await sharp(asset('noah-icon-transparent.svg')).resize(512, 512).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#d34e06' } })
  .composite([{ input: silhouette, blend: 'dest-in' }]).png().toFile(asset('noah-orange-icon.png'));
const logo = await sharp(asset('noah-orange-icon.png')).resize(144, 144).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="1" y="1" width="1198" height="628" rx="20" fill="none" stroke="#e9dcd1" stroke-width="2"/>
  <g font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif" fill="#241812">
    <text x="64" y="132" font-family="Arial, sans-serif" font-size="70" font-weight="700">Noah</text>
    <text x="66" y="179" font-size="23" fill="#76472f">Agentストア</text>
    <text x="64" y="290" font-size="58" font-weight="600">Agentを見つける。</text>
    <text x="64" y="373" font-size="58" font-weight="600">仕事を任せる。成果を受け取る。</text>
    <text x="66" y="449" font-size="26" fill="#76472f">自分のAgentも、ここから公開。</text>
    <path d="M64 502H1136" stroke="#e9dcd1"/>
    <text x="66" y="565" font-family="Arial, sans-serif" font-size="25" fill="#76472f">avoado.si/noah</text>
    <text x="1134" y="565" text-anchor="end" font-family="Arial, sans-serif" font-size="20" fill="#76472f">Agent Store</text>
  </g>
</svg>`;
await sharp(Buffer.from(svg)).composite([{ input: logo, left: 992, top: 60 }])
  .png().toFile(asset('noah-social-card-orange.png'));
