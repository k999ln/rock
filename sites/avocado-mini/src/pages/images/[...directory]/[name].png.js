import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// These legacy URLs are static endpoints. Only the listed originals are published.
export function getStaticPaths() {
  const drawings = [
    'R5-E01-power-safety.png',
    'R5-M01-envelope.png',
    'R5-M02-functional-stack.png',
    'R5-O01-services.png',
    'R5-O02-consent.png',
    'R5-S01-scaling.png',
    'R5-U01-startup.png',
    'R5-V01-camera-geometry.png',
  ];
  const aliases = [
    [undefined, 'avocado-mini-kit', 'public/rockstaros/avocado-mini-kit-p0.png'],
    [undefined, 'tower-concept', 'public/rockstaros/avocado-mini-tower-concept.png'],
    ['r5', 'avocado-mini-r5-concept', 'sites/avocado-mini/public/images/avocadomini-r5-slim-form-reference.png'],
    ...drawings.map(name => ['r5', name.slice(0, -4), 'docs/avocado-mini-r5/package/drawings/' + name]),
  ];
  return aliases.map(([directory, name, source]) => ({ params: { directory, name }, props: { source } }));
}

export async function GET({ props }) {
  const bytes = await readFile(resolve(import.meta.env.MII_IMAGE_SOURCE_ROOT, props.source));
  return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
}
