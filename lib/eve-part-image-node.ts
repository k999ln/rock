/**
 * 見出し画像を PNG にする（Node の端末で動かす。task 130、2026-11-25）。
 * satori で文字を線（path）にした SVG を作り、resvg（WebAssembly）で描く。どちらもリポジトリの字形だけを使い、端末の字形は読まない。
 * どの端末でも同じ画像になる（Noah の共有画像 app/api/noah/share-image と同じ字形・同じ作り）。
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { EVE_IMAGE_SIZE, type EveRasterize } from './eve-part-image.ts';

export const EVE_IMAGE_FONT = new URL('../public/fonts/noah-noto-sans-jp-regular.ttf', import.meta.url);

let ready: Promise<Buffer> | null = null;

export function eveNodeRasterizer(): EveRasterize {
  ready ??= (async () => {
    await initWasm(await readFile(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')));
    return readFile(EVE_IMAGE_FONT);
  })();
  return async (element) => {
    const font = await ready!;
    const svg = await satori(element as Parameters<typeof satori>[0], { ...EVE_IMAGE_SIZE, fonts: [{ name: 'Noto Sans JP', data: font, weight: 400, style: 'normal' }] });
    const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
    const png = resvg.render().asPng();
    resvg.free();
    return png;
  };
}
