import { build } from 'esbuild';
import { createRequire } from 'node:module';
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  readdir,
  open,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
  process.argv[process.argv.indexOf('--out') + 1] || 'work/noah-mac-package',
);
if (!process.argv.includes('--out') || output === root)
  throw new Error('Use --out with a new output directory.');
await mkdir(output, { recursive: true });
const app = path.join(output, 'Noah.app');
await mkdir(app); // Refuse stale or symlinked application bundles.
const resources = path.join(app, 'Contents/Resources');
const stage = path.join(resources, 'payload');
await mkdir(stage, { recursive: true });
await build({
  entryPoints: ['noah-mac-runner', 'noah-mac-onboarding'].map((name) =>
    path.join(root, `scripts/${name}.mjs`),
  ),
  outdir: path.join(stage, 'scripts'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: {
    js: "import { createRequire as noahCreateRequire } from 'node:module'; const require=noahCreateRequire(import.meta.url); const __filename=import.meta.filename; const __dirname=import.meta.dirname;",
  },
  legalComments: 'eof',
});
await cp(
  path.join(root, 'scripts/noah-agent-runtime'),
  path.join(stage, 'scripts/noah-agent-runtime'),
  {
    recursive: true,
    filter: (p) => !p.includes('node_modules') && !p.includes('__pycache__'),
  },
);
const tsdir = path.dirname(
  createRequire(import.meta.url).resolve('typescript'),
);
for (const file of await readdir(tsdir))
  if (/^lib.*\.d\.ts$/.test(file))
    await cp(path.join(tsdir, file), path.join(stage, 'scripts', file));
await cp(
  path.join(path.dirname(tsdir), 'LICENSE.txt'),
  path.join(stage, 'TypeScript-LICENSE.txt'),
);
await cp(
  path.join(root, 'scripts/noah-mac-install.mjs'),
  path.join(stage, 'install.mjs'),
);
const files = {};
async function walk(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const p = path.join(dir, name),
      handle = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await handle.stat();
      if (s.isDirectory()) await walk(p);
      else if (s.isFile())
        files[path.relative(stage, p)] = createHash('sha256')
          .update(await handle.readFile())
          .digest('hex');
      else throw new Error('Regular distribution files required');
    } finally {
      await handle.close();
    }
  }
}
await walk(stage);
await writeFile(
  path.join(stage, 'manifest.json'),
  JSON.stringify(
    { schema: 'noah-mac-distribution/1', platform: 'darwin-arm64', files },
    null,
    2,
  ) + '\n',
);
await cp(
  path.join(root, 'scripts/noah-mac-app/runtime.json'),
  path.join(resources, 'runtime.json'),
);
await cp(
  path.join(root, 'public/company-mark.png'),
  path.join(resources, 'company-mark.png'),
);
await mkdir(path.join(app, 'Contents/MacOS'));
execFileSync(
  '/usr/bin/xcrun',
  [
    'swiftc',
    '-parse-as-library',
    '-target',
    'arm64-apple-macos15.0',
    '-O',
    path.join(root, 'scripts/noah-mac-app/NoahApp.swift'),
    path.join(root, 'scripts/noah-mac-app/NoahLinks.swift'),
    '-o',
    path.join(app, 'Contents/MacOS/Noah'),
  ],
  { stdio: 'inherit' },
);
await writeFile(
  path.join(app, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>si.avoado.noah.mac</string>
<key>CFBundleName</key><string>Noah</string>
<key>CFBundleExecutable</key><string>Noah</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>LSMinimumSystemVersion</key><string>15.0</string>
<key>LSMultipleInstancesProhibited</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundleURLTypes</key><array><dict>
<key>CFBundleURLName</key><string>si.avoado.noah.connect</string>
<key>CFBundleURLSchemes</key><array><string>noah</string></array>
</dict></array>
</dict></plist>
`,
);
// Local preview only: ad-hoc signature, no signing keys or notarization claim.
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], {
  stdio: 'inherit',
});
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {
  stdio: 'inherit',
});
const archive = path.join(output, 'Noah-Mac.zip');
execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, archive]);
const sha256 = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(archive + '.sha256', sha256 + '  Noah-Mac.zip\n');
console.log(
  JSON.stringify({
    archive,
    sha256,
    files: Object.keys(files).length,
    notarized: false,
  }),
);
