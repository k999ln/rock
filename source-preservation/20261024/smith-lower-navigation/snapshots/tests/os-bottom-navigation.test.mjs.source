import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as navigation from '../lib/os-navigation.ts';

const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
void test('the actual navigation renders exactly its destinations, visible labels and matching grid count',()=>{
 const exports={},jsx=(type,props)=>({type,props});
 const code=ts.transpileModule(text('components/os-app-navigation.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 runInNewContext(code,{exports,process:{env:{NODE_ENV:'production'}},require(name){
  if(name==='react')return {useEffect:()=>{},useState:()=>['#communities',()=>{}]};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='next/link')return {default:'a'};
  if(name==='next/navigation')return {usePathname:()=>'/'};
  if(name==='lucide-react')return {Radio:'radio',MessageCircle:'message',Users:'users'};
  if(name==='@/lib/os-navigation')return navigation;
  throw Error(name);
 }});
 const tree=exports.default({}),links=tree.props.children;
 assert.equal(tree.props.style['--os-navigation-count'],links.length);assert.equal(links.length,3);
 assert.deepEqual(Array.from(links,l=>l.props['data-os-destination']),['stream','eve','communities']);
 assert.deepEqual(Array.from(links,l=>l.props.children[1].props.children),['Smith','Eve','コミュニティー']);
 assert.equal(links[2].props['aria-current'],'page');assert.equal(links[1].props.href,'/os/eve');
});
void test('all bottom-navigation widths reserve Home space and use opaque, readable three-item layout',()=>{
 const css=text('app/os-shell.css');
 assert.match(css,/grid-template-columns:\s*repeat\(var\(--os-navigation-count,\s*3\),\s*minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/grid-template-columns:\s*repeat\(5/);
 assert.match(css,/\.rock-workspace\.rock-workspace,\s*\[data-sky-home\]\s*\{\s*padding-bottom:\s*calc\(var\(--os-shell-navigation-height\)/);
 const bottom=css.slice(css.indexOf('@media (max-width: 1279px)'));
 assert.match(bottom,/background:\s*var\(--os-shell-bg\)/);assert.doesNotMatch(bottom,/background:\s*rgba\(/);
 assert.match(bottom,/a span\s*\{\s*position:\s*static/);assert.match(bottom,/scroll-margin-bottom:/);
 assert.doesNotMatch(text('components/home-screen.module.css'),/padding-bottom:\s*calc\(62px/);
 assert.match(text('components/home-screen.module.css'),/\.home \.mobileNav\s*\{\s*background:\s*var\(--os-shell-bg/);
 assert.doesNotMatch(text('components/home-screen.module.css'),/\.home \.mobileNav\s*\{\s*background:\s*rgba\(/);
});
