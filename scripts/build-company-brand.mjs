import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import sharp from 'sharp';

// Asset compilation only: retain the supplied pixels and aspect, with no redraw.
const root=process.cwd(),brand=JSON.parse(await readFile(resolve(root,'data/company-brand.json'),'utf8'));
const source=await readFile(resolve(root,brand.source));
if(createHash('sha256').update(source).digest('hex')!==brand.sourceSha256)throw Error('Company logo source hash mismatch.');
const meta=await sharp(source).metadata();
if(meta.width!==1920||meta.height!==1080)throw Error('Unexpected company logo canvas.');
const icon=await sharp(source).extract({left:420,top:0,width:1080,height:1080}).resize(512,512).png().toBuffer();
const small=await sharp(icon).resize(192,192).png().toBuffer();
const href='data:image/png;base64,'+icon.toString('base64');
const svg=size=>`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><image width="512" height="512" href="${href}"/></svg>\n`;
const outputs=new Map([
 ['public/company-mark.png',icon],['public/rock-icon-512.png',icon],['public/rock-icon-192.png',small],
 ['public/favicon.svg',svg(512)],['public/company-mark-192.svg',svg(192)],
 ['public/rock-icon-maskable.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="white"/><image x="128" y="128" width="768" height="768" href="${href}"/></svg>\n`],
]);
// Existing native/product entry points keep their compatible resource names.
for(const path of ['android/shell/src/main/res/drawable-nodpi/company_mark.png','android/x-session/src/main/res/drawable/company_mark.png','sites/avocado-mini/public/images/avokado-metallic-mark.png']){
 try{await access(resolve(root,dirname(path)));outputs.set(path,icon);}catch{/* This checkout may contain only the Web product. */}
}
const hashes={};
for(const [path,bytes] of outputs){await mkdir(resolve(root,dirname(path)),{recursive:true});await writeFile(resolve(root,path),bytes);hashes[path]=createHash('sha256').update(bytes).digest('hex');}
await writeFile(resolve(root,'data/company-brand-assets.json'),JSON.stringify({schema:'rockstaros.company-brand-assets/1',source:brand.source,sourceSha256:brand.sourceSha256,
 derivation:'centered 1080x1080 crop of the supplied 1920x1080 canvas; original mark geometry and colors retained; 512/192 raster sizes and compatible SVG containers',files:hashes,publicDeployed:false,pixelInstalled:false},null,2)+'\n');
process.stdout.write(JSON.stringify({sourceSha256:brand.sourceSha256,assets:Object.keys(hashes).length,redrawn:false,publicDeployed:false,pixelInstalled:false})+'\n');
