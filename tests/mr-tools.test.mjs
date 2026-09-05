import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatCitations, makeFreeArticle, checkCoconala } from '../lib/mr-tools.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixtures=resolve(root,'toolkits/mr/examples');
function cli(args){const r=spawnSync('python3',[resolve(root,'toolkits/mr/loop_tools.py'),...args],{encoding:'utf8',cwd:root});return r;}
const article={markdown:readFileSync(join(fixtures,'article.md'),'utf8'),afterChars:40,summary:readFileSync(join(fixtures,'summary.md'),'utf8'),price:500,paidContents:'実践手順と記録方法',noteUrl:'https://note.com/your_account/n/your_article'};

test('citation URLs deduplicate and merge before the next section',()=>{
 const out=formatCitations('本文。（出典: [A](https://a.test)）。\n\n## 出典\n- [B](https://b.test)\n\n## おわり\n終わり。（出典: [A2](https://a.test)）');
 assert.equal((out.match(/https:\/\/a.test/g)||[]).length,1);assert.equal((out.match(/^## 出典$/gm)||[]).length,1);assert.ok(out.indexOf('https://a.test')<out.indexOf('## おわり'));assert.ok(!out.includes('。。'));
});
test('citation formatting preserves fenced code, inline code and non-link sources',()=>{
 const code='```python\nif True:\n    print("（出典: [code](https://code.test)）")\n```';
 const out=formatCitations(code+'\n\n`（出典: [inline](https://inline.test)）`\n\n参考。（出典: 社内メモ）\n説明。（出典: [A](https://a.test)）');
 assert.ok(out.includes(code));assert.ok(out.includes('`（出典: [inline](https://inline.test)）`'));assert.ok(out.includes('（出典: 社内メモ）'));assert.equal((out.match(/https:\/\/code.test/g)||[]).length,1);
});
test('free edition retains sources and leaves substantive paid content',()=>{
 const out=makeFreeArticle(article);assert.ok(out.startsWith('# 仕事を小さく自動化する'));assert.ok(out.includes('## 出典'));assert.ok(out.includes('https://docs.python.org/3/'));assert.ok(!out.includes('記録を残すと'));assert.ok(out.trimEnd().endsWith(article.noteUrl));
});
test('source section before paid text remains complete exactly once',()=>{
 const out=makeFreeArticle({...article,markdown:'# Title\n\n最初の文です。\n\n## 出典\n- [A](https://a.test)\n\n## 実践\n有料の手順を説明します。詳しい内容をここに残します。',afterChars:4});assert.equal((out.match(/^## 出典$/gm)||[]).length,1);assert.ok(out.includes('- [A](https://a.test)'));assert.ok(!out.includes('詳しい内容'));
});
test('source code fences do not truncate the source section',()=>{
 const out=makeFreeArticle({...article,markdown:'# Title\n\n最初の説明です。続きに詳しい手順を書きます。さらに手順があります。\n\n## 出典\n```text\n# sample\n- example\n```\n- [A](https://a.test)',afterChars:4});assert.ok(out.includes('```text\n# sample\n- example\n```'));assert.ok(out.includes('https://a.test'));
});
test('sources alone cannot count as paid remainder',()=>{
 assert.throws(()=>makeFreeArticle({...article,markdown:'# Title\n\n全文です。\n\n## 出典\n- [A](https://a.test)',afterChars:5}),/短く/);
});
test('article input rejects open code, invalid price, summary and URL',()=>{
 for(const patch of [{markdown:'# Title\n```python\nprint(1)'},{price:0},{summary:'- one'},{noteUrl:'javascript:alert(1)'},{afterChars:NaN},{noteUrl:'https://note.com.evil.test/a/n/b'}])assert.throws(()=>makeFreeArticle({...article,...patch}));
});
test('coconala rules distinguish optional calls, missing evidence and required presence',()=>{
 const base={brief:'記事を作成してください。Zoom面談は不要です。チャットで完結します。',proposal:'原稿を作成して納品します。',bucket:'single',orderRate:50};
 assert.equal(checkCoconala(base).allowed,true);assert.equal(checkCoconala({...base,brief:'Zoomで面談を行います。'}).allowed,false);assert.equal(checkCoconala({...base,bucket:'retainer'}).allowed,false);assert.equal(checkCoconala({...base,orderRate:null}).allowed,false);assert.equal(checkCoconala({...base,orderRate:0}).allowed,true);assert.throws(()=>checkCoconala({...base,orderRate:101}));
});
test('browser matches the original eligibility module on a standalone example',()=>{
 const input=JSON.parse(readFileSync(join(fixtures,'coconala.json'),'utf8'));const r=cli(['coconala-check','--input',join(fixtures,'coconala.json')]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).allowed,checkCoconala(input).allowed);
});
test('Python free-edition adapter agrees with browser result and does not log article excerpts',()=>{
 const r=cli(['free-article','--input',join(fixtures,'article.md'),'--summary',join(fixtures,'summary.md'),'--after-chars','40','--price','500','--paid-contents',article.paidContents,'--note-url',article.noteUrl]);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.equal(r.stdout,makeFreeArticle(article));
});
test('standalone citation adapter agrees with browser and cannot overwrite input',()=>{
 const r=cli(['citations','--input',join(fixtures,'article.md')]);assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,formatCitations(article.markdown));
 const denied=cli(['citations','--input',join(fixtures,'article.md'),'--output',join(fixtures,'article.md')]);assert.equal(denied.status,2);assert.equal(readFileSync(join(fixtures,'article.md'),'utf8'),article.markdown);
});
test('delivery evidence passes, self-review is blocked, changed artifacts are blocked',()=>{
 mkdirSync(join(root,'work'),{recursive:true});const tmp=mkdtempSync(join(root,'work/mr-test-'));try{
  cpSync(join(fixtures,'delivery'),join(tmp,'delivery'),{recursive:true});const review=JSON.parse(readFileSync(join(fixtures,'delivery-review.json'),'utf8'));const input=join(tmp,'review.json');writeFileSync(input,JSON.stringify(review));const args=['verify-delivery','--workspace',join(tmp,'delivery'),'--input',input];
  const ok=cli(args);assert.equal(ok.status,0,ok.stderr);assert.equal(JSON.parse(ok.stdout).status,'PASS');
  review.reviewer_context_id=review.execution_receipt.execution_id;writeFileSync(input,JSON.stringify(review));assert.equal(JSON.parse(cli(args).stdout).status,'BLOCKED');
  review.reviewer_context_id='independent-review';writeFileSync(input,JSON.stringify(review));writeFileSync(join(tmp,'delivery/draft.md'),'changed content');assert.equal(JSON.parse(cli(args).stdout).status,'BLOCKED');
  review.execution_receipt.revision_sha256='../../outside';writeFileSync(input,JSON.stringify(review));assert.equal(cli(args).status,2);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
