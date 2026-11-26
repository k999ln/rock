import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function buildNoahOffline() {
  const { outputFiles } = await build({
    absWorkingDir: resolve(import.meta.dirname, '..'),
    entryPoints: ['scripts/noah-offline-entry.tsx'],
    outfile: 'noah-offline.js',
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['/fonts/noah-dotgothic16-subset.woff2'],
    minify: true,
    write: false,
  });
  const js = outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = outputFiles.find(file => file.path.endsWith('.css')).text;
  const font = await readFile(new URL('../public/fonts/noah-dotgothic16-subset.woff2', import.meta.url));
  const inlineCss = css.replace('/fonts/noah-dotgothic16-subset.woff2', 'data:font/woff2;base64,' + font.toString('base64'));
  return `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Noah</title>
<style>body{margin:0;font-family:system-ui,sans-serif}${inlineCss}</style>
<div id="noah-offline">Noah · オフライン</div>
<script>${js.replace(/<\/script/giu, '<\\/script')}</script>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = await buildNoahOffline();
  const worker = await readFile(new URL('./noah-offline-worker.js', import.meta.url), 'utf8');
  const revision = createHash('sha256').update(html).digest('hex').slice(0, 16);
  await writeFile(new URL('../public/noah-offline.html', import.meta.url), html);
  await writeFile(new URL('../public/noah-sw.js', import.meta.url), worker.replace('__OFFLINE_REVISION__', revision));
}
