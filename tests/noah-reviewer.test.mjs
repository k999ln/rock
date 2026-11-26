import test from 'node:test';
import assert from 'node:assert/strict';
import { noahReviewerAccess } from '../lib/noah-reviewer.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

void test('all review pages require authenticated reviewer access before returning children', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const ts = (await import('typescript')).default;
  const source = ts.transpileModule(readFileSync(new URL('../app/noah/review/layout.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const owner of ['approved-owner', 'other-owner', null, 'service-down']) {
    const modules = {
      'next/headers': { headers: async () => new Headers({ cookie: 'session-fixture' }) },
      'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
      '@/lib/noah-intake-server': { noahIntakeDependencies: () => {
        if (owner === 'service-down') throw Error('service unavailable');
        return noahReviewerAccess(async request => {
          assert.equal(request.headers.get('cookie'), 'session-fixture');
          if (!owner) throw Error('UNAUTHORIZED');
          return owner;
        }, 'approved-owner');
      } },
    };
    const exports = {};
    runInNewContext(source, { exports, Request, require: name => { assert.ok(name in modules, name); return modules[name]; } });
    if (owner === 'approved-owner') assert.equal(await exports.default({ children: 'operator-controls' }), 'operator-controls');
    else await assert.rejects(exports.default({ children: 'operator-controls' }), /NOT_FOUND/);
  }
});

void test('reviewer scope resolves only after authenticating the pinned owner, never from caller headers', async () => {
  const scope=await ownerScopeFor('approved-owner');
  let actual='other-owner';
  const access=noahReviewerAccess(async()=>actual,'legacy-reviewer',scope);
  const forged=new Request('https://avoado.si/api/noah/intake/import',{headers:{'X-Rock-Owner-Scope':scope}});
  assert.deepEqual(access.reviewers,['legacy-reviewer']);
  await access.authenticate(forged); assert.deepEqual(access.reviewers,['legacy-reviewer']);
  actual='approved-owner'; await access.authenticate(forged); await access.authenticate(forged);
  assert.deepEqual(access.reviewers,['legacy-reviewer','approved-owner']);
  actual='other-owner'; await access.authenticate(forged); assert.equal(access.reviewers.includes(actual),false);
});
void test('missing or malformed scope never grants a role; auth failures do not populate reviewers', async () => {
  for(const setting of ['', 'owner-v1:*', 'approved-owner', 'owner-v1:'+ 'x'.repeat(64)]) {
    const access=noahReviewerAccess(async()=> 'approved-owner','',setting);
    await access.authenticate(new Request('https://avoado.si')); assert.deepEqual(access.reviewers,[]);
  }
  const denied=noahReviewerAccess(async()=>{throw Error('UNAUTHORIZED');},'',await ownerScopeFor('approved-owner'));
  await assert.rejects(denied.authenticate(new Request('https://avoado.si')),/UNAUTHORIZED/);
  assert.deepEqual(denied.reviewers,[]);
  assert.deepEqual(noahReviewerAccess(async()=> 'approved-owner').reviewers,[]);
});

void test('the intake administration page exposes controls only to its authenticated reviewer', async () => {
  const {readFileSync}=await import('node:fs');
  const {runInNewContext}=await import('node:vm');
  const ts=(await import('typescript')).default;
  const jsx=(type,props)=>({type,props});
  const source=ts.transpileModule(readFileSync(new URL('../app/noah/review/intake/page.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const owner of ['approved-owner','other-owner',null]) {
    const deps=noahReviewerAccess(async request=>{assert.equal(request.headers.get('cookie'),'session-fixture');if(!owner)throw Error('UNAUTHORIZED');return owner;},'',await ownerScopeFor('approved-owner'));
    const modules={'react/jsx-runtime':{jsx,jsxs:jsx},'next/headers':{headers:async()=>new Headers({cookie:'session-fixture'})},'next/link':{default:'a'},'@/components/noah-intake-review':{default:'intake-controls'},'@/lib/noah-intake-server':{noahIntakeDependencies:()=>deps},'@/lib/owner-intent':{ownerScopeFor},'@/components/noah-service.module.css':{default:{}}};
    const exports={};runInNewContext(source,{exports,Request,require:name=>{assert.ok(name in modules,name);return modules[name];}});
    const tree=await exports.default(); const control=tree.props.children.find(node=>node?.type==='intake-controls');
    assert.equal(Boolean(control),owner==='approved-owner');
    if(control)assert.equal(control.props.ownerScope,await ownerScopeFor(owner));
  }
});
