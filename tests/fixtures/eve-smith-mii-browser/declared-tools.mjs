import { createSkyToolApp } from '../../../toolkits/sky-tool-sdk/src/index.mjs';

export const fixturePermissions = [
  {permission:'read_user_input',scopes:['job:owner-input']},
  {permission:'write_results',scopes:['job:owner-result']},
  {permission:'network',scopes:['loopback:fixture-tool']},
];
/** Explicit provider declarations for finite tests, not OS permissions. */
export function createDeclaredFixtureTools(options){
 const app=createSkyToolApp({developer:{id:'example-developer',name:'Example Developer',supportUrl:'https://example.invalid/support'},
 app:{id:'com.example.line-counter',name:'Example Line Counter',version:'1.0.0',sourceUrl:'https://example.invalid/source',license:'MIT',publicMcpUrl:options.publicMcpUrl},registration:false,autoPublish:false,...options});
 for(const spec of [
  {name:'count_lines',title:'行数を数える',capability:'fixture.count-lines',input:{text:{type:'string'}},output:{lines:{type:'integer'}},handler:({text})=>({lines:text.length?text.split(/\r\n|\r|\n/u).length:0})},
  {name:'add_integers',title:'二つの整数を足す',capability:'fixture.add-integers',input:{left:{type:'integer'},right:{type:'integer'}},output:{sum:{type:'integer'}},handler:({left,right})=>{const sum=left+right;if(![left,right,sum].every(Number.isSafeInteger))throw new Error('unsafe fixture input');return {sum};}},
 ])app.tool({name:spec.name,title:spec.title,description:'明示した型と処理能力とpermissionを持つ非推論の合成fixtureです。',
 inputSchema:{type:'object',properties:spec.input,required:Object.keys(spec.input),additionalProperties:false,
 'x-rockstaros-tool-contract':{schema:'rockstaros.tool-capability/1',capabilityIds:[spec.capability],permissions:fixturePermissions}},
 outputSchema:{type:'object',properties:spec.output,required:Object.keys(spec.output),additionalProperties:false},sideEffects:['none'],price:{model:'free',note:'端末内のサンプル処理です。'},handler:spec.handler});
 return app;
}
