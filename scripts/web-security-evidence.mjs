import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const WEB_SECURITY_EVIDENCE_PATH = 'data/web-security-response-current.json';
export const WEB_SECURITY_INPUTS = [
  'services/sky-web/asset-responses.mjs', 'scripts/stage-secure-assets.mjs',
  'services/sky-web/noah-page-routes.mjs',
  'services/sky-web/domain-router.mjs', 'scripts/stage-sky-domain-router.mjs',
  'data/web-security-policy.json', 'public/_headers', 'next.config.ts',
  'scripts/check-web-security-response.mjs', 'scripts/web-security-evidence.mjs',
  'public/sw.js', 'app/web-app-manifests.ts', 'app/manifest.webmanifest/route.ts',
  'app/layout.tsx', 'app/connect/eve.webmanifest/route.ts', 'app/connect/done/page.tsx', 'app/os/eve/page.tsx',
  'app/page.tsx', 'lib/os-entry.ts',
  'app/noah/page.tsx', 'components/noah-shell.tsx', 'components/noah-timeline.tsx',
  'public/brand/noah-icon-v2.png', 'public/rock-icon-192.png', 'public/rock-icon-512.png', 'public/rock-icon-maskable.svg',
];
export const securityInputHashes = root => Object.fromEntries(WEB_SECURITY_INPUTS.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
