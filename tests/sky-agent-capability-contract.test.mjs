import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY_TOOL_CONTRACT_ANNOTATION as annotation, parseSkyAgentRequirements,
  parseSkyAgentToolExpectation, readSkyToolCapabilityDeclaration, reviewSkyAgentPackageContract,
  reviewSkyAgentRequirements } from '../lib/sky-agent-requirements.ts';
import { createSkyToolPackageDraft, parseSkyToolPackage, skyToolPackageKey } from '../lib/sky-tool-package.ts';

function fixture() {
  const manifest = createSkyToolPackageDraft({sourceKind:'github',sourceUrl:'https://fixture.invalid/source',developerName:'Fixture',developerId:'fixture',license:'MIT'});
  manifest.capabilities={...manifest.capabilities,connectivity:'offline',permissions:['read_user_input','write_results']};
  const declaration = {schema:'rockstaros.tool-capability/1',capabilityIds:['fixture.count-lines'],permissions:[
    {permission:'read_user_input',scopes:[]},{permission:'write_results',scopes:[]}]};
  manifest.io={inputSchema:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string'}},[annotation]:declaration},
    outputSchema:{type:'object',additionalProperties:false,required:['lines'],properties:{lines:{type:'integer'}}}};
  const pkg={packageKey:skyToolPackageKey(manifest),manifest:parseSkyToolPackage(manifest),status:'verified',installable:true};
  const tool={name:'count_lines',title:'Count lines',description:'Non-inference declaration fixture',inputSchema:structuredClone(manifest.io.inputSchema),outputSchema:structuredClone(manifest.io.outputSchema),pricing:{model:'free',note:'fixture'},approval:'required'};
  const server={id:'fixture-local',name:'Fixture local',description:'',transport:'stdio',state:'connected',toolCount:1,passport:{observationId:crypto.randomUUID(),observedAt:Date.now(),observationExpiresAt:Date.now()+29_000,server:{name:'fixture',version:'1'},protocolVersion:'2025-11-25',capabilities:{tools:{}},tools:[tool],toolDigest:'a'.repeat(64),connectedAt:'2026-10-29T00:00:00Z'}};
  const requirements={inputFields:['text'],outputFields:['lines'],packageKey:pkg.packageKey,executionTarget:'pc',contract:{
    schema:'rockstaros.agent-tool-expectation/1',inputTypes:{text:'string'},outputTypes:{lines:'integer'},capabilityIds:['fixture.count-lines'],
    allowedPermissions:structuredClone(declaration.permissions),runtime:{serverId:server.id,toolName:tool.name}}};
  return {manifest:pkg.manifest,pkg,server,tool,requirements};
}
function review(f) {return reviewSkyAgentRequirements(f.requirements,[f.pkg],[f.server]);}
function syncSchemas(f) {f.tool.inputSchema=structuredClone(f.manifest.io.inputSchema);f.tool.outputSchema=structuredClone(f.manifest.io.outputSchema);}
const expectState=(result,state)=>{assert.equal(result.state,state,JSON.stringify(result));if(state!=='candidate')assert.equal(result.candidates?.length??0,0);};
function freeze(value) {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

void test('finite declaration agreement selects the exact saved runtime; it remains provider-declared',()=>{
  const f=fixture(),result=review(f);expectState(result,'candidate');
  assert.deepEqual(result.candidates,[{serverId:f.server.id,serverName:f.server.name,toolName:f.tool.name}]);
  assert.match(result.issues.join(' '),/宣言|提供者/);
});
void test('input and output field types are compared, not merely the names',()=>{
  for(const side of ['inputTypes','outputTypes']) {
    const f=fixture(),key=side==='inputTypes'?'text':'lines';f.requirements.contract[side][key]='number';expectState(review(f),'missing');
  }
});
void test('required input must exist in the requested fields and type contract',()=>{
  const f=fixture();f.requirements.inputFields=[];f.requirements.contract.inputTypes={};expectState(review(f),'missing');
  const g=fixture();g.manifest.io.inputSchema.required.push('secret');g.manifest.io.inputSchema.properties.secret={type:'string'};syncSchemas(g);expectState(review(g),'missing');
});
void test('missing or unsupported provider types are unknown, not proven by field presence',()=>{
  for(const type of [undefined,['string','null'],'unsupported']) {
    const f=fixture();if(type===undefined)delete f.manifest.io.inputSchema.properties.text.type;else f.manifest.io.inputSchema.properties.text.type=type;
    syncSchemas(f);expectState(review(f),'unconfirmed');
  }
});
void test('types for unrequested fields and missing expected types are not silently ignored',()=>{
  const f=fixture();f.requirements.contract.inputTypes.extra='string';expectState(review(f),'missing');
  const g=fixture();g.requirements.contract.inputTypes={};expectState(review(g),'missing');
});
void test('same schemas cannot substitute an unselected Tool or connection',()=>{
  const f=fixture();f.tool.name='publish_secrets';expectState(review(f),'missing');
  const g=fixture();g.server.id='another-connection';expectState(review(g),'unconfirmed');
  const h=fixture();h.server.passport.tools.push({...structuredClone(h.tool),name:'unrelated_same_schema'});
  expectState(review(h),'candidate');assert.equal(review(h).candidates.length,1);assert.equal(review(h).candidates[0].toolName,'count_lines');
});
void test('same I/O shape with a different processing capability cannot satisfy the role',()=>{
  const f=fixture();f.manifest.io.inputSchema[annotation].capabilityIds=['fixture.publish'];syncSchemas(f);expectState(review(f),'missing');
  const g=fixture();g.tool.inputSchema[annotation].capabilityIds=['fixture.publish'];expectState(review(g),'missing');
});
void test('Package and Tool capability declarations must agree even if both satisfy requested subset',()=>{
  const f=fixture();f.tool.inputSchema[annotation].capabilityIds.push('fixture.extra');expectState(review(f),'missing');
});
void test('network permission cannot be introduced by either declaration beyond owner allowance',()=>{
  const f=fixture();f.tool.inputSchema[annotation].permissions.push({permission:'network',scopes:['origin:https://fixture.invalid']});expectState(review(f),'missing');
  const g=fixture();g.manifest.capabilities.connectivity='online';g.manifest.capabilities.permissions.push('network');g.manifest.io.inputSchema[annotation].permissions.push({permission:'network',scopes:['origin:https://fixture.invalid']});syncSchemas(g);expectState(review(g),'missing');
});
void test('top-level Package permissions must agree with its schema annotation',()=>{
  const f=fixture();f.manifest.io.inputSchema[annotation].permissions.pop();syncSchemas(f);expectState(review(f),'missing');
});
void test('scope allowance uses complete opaque IDs, with no prefix or path expansion',()=>{
  const f=fixture();f.manifest.capabilities.permissions.push('selected_files');f.manifest.io.inputSchema[annotation].permissions.push({permission:'selected_files',scopes:['file:owner-picked']});
  f.requirements.contract.allowedPermissions.push({permission:'selected_files',scopes:['file:owner-picked']});syncSchemas(f);expectState(review(f),'candidate');
  for(const scope of ['file:owner-picked/child','file:owner-picked-other','file:owner-picked/../other','FILE:owner-picked']) {
    const g=structuredClone(f);g.manifest.io.inputSchema[annotation].permissions.at(-1).scopes=[scope];syncSchemas(g);expectState(review(g),'missing');
  }
});
void test('wildcard requirements and wildcard or missing provider scopes are never silently expanded',()=>{
  const f=fixture();assert.throws(()=>parseSkyAgentToolExpectation({...f.requirements.contract,allowedPermissions:[{permission:'network',scopes:['*']}]}));
  for(const scopes of [undefined,['*'],null]) {
    const g=fixture();const permission=g.tool.inputSchema[annotation].permissions[0];if(scopes===undefined)delete permission.scopes;else permission.scopes=scopes;
    expectState(review(g),'unconfirmed');
  }
});
void test('one-sided and two-sided missing declarations stay unconfirmed',()=>{
  for(const side of ['package','tool','both']) {
    const f=fixture();if(side!=='tool')delete f.manifest.io.inputSchema[annotation];if(side!=='package')delete f.tool.inputSchema[annotation];expectState(review(f),'unconfirmed');
  }
});
void test('unknown, null or malformed provider annotation never falls back to a legacy candidate',()=>{
  for(const declaration of [null,{schema:'future/2',capabilityIds:[],permissions:[]},{schema:'rockstaros.tool-capability/1',capabilityIds:[]},
    {schema:'rockstaros.tool-capability/1',capabilityIds:[],permissions:[],grant:true}]) {
    for(const side of ['package','tool']) {
      const f=fixture();(side==='package'?f.manifest.io.inputSchema:f.tool.inputSchema)[annotation]=declaration;
      expectState(review(f),'unconfirmed');assert.equal(readSkyToolCapabilityDeclaration({[annotation]:declaration}),null);
    }
  }
});
void test('unspecified owner contract properties differ from explicitly empty sets',()=>{
  for(const key of ['inputTypes','outputTypes','capabilityIds','allowedPermissions','runtime']) {
    const f=fixture();delete f.requirements.contract[key];expectState(review(f),'unconfirmed');
  }
  const f=fixture();f.requirements.contract.capabilityIds=[];expectState(review(f),'candidate');
  const g=fixture();g.requirements.contract.allowedPermissions=[];expectState(review(g),'missing');
  const h=fixture();h.requirements.inputFields=[];h.requirements.outputFields=[];h.requirements.contract.inputTypes={};h.requirements.contract.outputTypes={};h.manifest.io.inputSchema.required=[];syncSchemas(h);expectState(review(h),'candidate');
});
void test('legacy owner requirements stay readable but cannot claim complete capability agreement',()=>{
  const f=fixture();delete f.requirements.contract;
  assert.equal(Object.hasOwn(parseSkyAgentRequirements(f.requirements),'contract'),false);expectState(review(f),'unconfirmed');
});
void test('unknown expectation versions, null and malformed supplied fields are rejected',()=>{
  const f=fixture();for(const contract of [null,{schema:'future/2'},{...f.requirements.contract,runtime:null},{...f.requirements.contract,inputTypes:null},
    {...f.requirements.contract,capabilityIds:null},{...f.requirements.contract,allowedPermissions:null},{...f.requirements.contract,authority:true}])
    assert.throws(()=>parseSkyAgentRequirements({...f.requirements,contract}));
});
void test('duplicate capability IDs, permissions and scopes are not collapsed into an accepted declaration',()=>{
  for(const patch of [
    {capabilityIds:['fixture.count-lines','fixture.count-lines']},
    {permissions:[{permission:'read_user_input',scopes:[]},{permission:'read_user_input',scopes:[]}]},
    {permissions:[{permission:'selected_files',scopes:['file:one','file:one']}]},
  ]) {const f=fixture();f.tool.inputSchema[annotation]={...f.tool.inputSchema[annotation],...patch};expectState(review(f),'unconfirmed');}
});
void test('review leaves frozen requirements, manifest and runtime inputs unchanged',()=>{
  const f=fixture(),snapshot=structuredClone(f);freeze(f);
  expectState(review(f),'candidate');assert.deepEqual(f,snapshot);
  assert.equal(reviewSkyAgentPackageContract(f.requirements,f.manifest).state,'candidate');assert.deepEqual(f,snapshot);
});
void test('Package admission requires explicit object properties even for empty requested fields',()=>{
  for (const side of ['inputSchema','outputSchema']) {
    const f=fixture();
    f.requirements.inputFields=[]; f.requirements.outputFields=[];
    f.requirements.contract.inputTypes={}; f.requirements.contract.outputTypes={};
    f.manifest.io.inputSchema.properties={}; f.manifest.io.inputSchema.required=[];
    f.manifest.io.outputSchema.properties={}; f.manifest.io.outputSchema.required=[];
    assert.equal(reviewSkyAgentPackageContract(f.requirements,f.manifest).state,'candidate');
    delete f.manifest.io[side].properties;
    assert.equal(reviewSkyAgentPackageContract(f.requirements,parseSkyToolPackage(f.manifest)).state,'unconfirmed');
  }
});
void test('resource-bearing permissions with no declared target scope stay unconfirmed',()=>{
  for (const permission of ['network','external_account','selected_files','financial_action']) {
    const f=fixture();
    f.manifest.capabilities.permissions.push(permission);
    if(permission==='network') f.manifest.capabilities.connectivity='online';
    f.manifest.io.inputSchema[annotation].permissions.push({permission,scopes:[]});
    f.requirements.contract.allowedPermissions.push({permission,scopes:[]});
    syncSchemas(f);
    assert.equal(reviewSkyAgentPackageContract(f.requirements,parseSkyToolPackage(f.manifest)).state,'unconfirmed');
    expectState(review(f),'unconfirmed');
  }
});
void test('parsed expectations and declarations do not alias their input arrays or scopes',()=>{
  const f=fixture(),expected=structuredClone(f.requirements),declared=structuredClone(f.tool.inputSchema[annotation]);
  const r=parseSkyAgentRequirements(f.requirements);r.contract.capabilityIds.push('another');r.contract.allowedPermissions[0].scopes.push('changed');
  const d=readSkyToolCapabilityDeclaration(f.tool.inputSchema);d.capabilityIds.push('another');d.permissions[0].scopes.push('changed');
  assert.deepEqual(f.requirements,expected);assert.deepEqual(f.tool.inputSchema[annotation],declared);
});
void test('remote, disconnected and paid runtimes cannot become execution candidates via matching annotations',()=>{
  const f=fixture();f.server.transport='streamable_http';expectState(review(f),'missing');
  const g=fixture();g.server.state='available';expectState(review(g),'unconfirmed');
  const h=fixture();h.tool.pricing.model='usage';expectState(review(h),'missing');
});

// These two assertions deliberately cover malformed JSON representations that
// can reach the settings/Package JSON APIs. They must not be silently accepted.
void test('malformed provider required declarations cannot produce a confirmed contract',()=>{
  for(const side of ['inputSchema','outputSchema']) for(const required of [null,'text',{},[42],['text','text']]) {
    const f=fixture();f.manifest.io[side].required=required;syncSchemas(f);
    assert.notEqual(review(f).state,'candidate',JSON.stringify({side,required,result:review(f)}));
  }
  const f=fixture();delete f.manifest.io.inputSchema.required;syncSchemas(f);expectState(review(f),'candidate');
});
void test('expected field types must be primitive type names, not coercible JSON arrays',()=>{
  const f=fixture();for(const type of [['string'],['integer'],[],null,42,true]) {
    assert.throws(()=>parseSkyAgentToolExpectation({...f.requirements.contract,inputTypes:{text:type}}),JSON.stringify(type));
  }
});

void test('missing, expired and future Tool observation is unconfirmed, not a declaration mismatch', () => {
  for (const mode of ['missing', 'expired', 'future']) {
    const f = fixture(), now = Date.now();
    if (mode === 'missing') delete f.server.passport.observationId;
    if (mode === 'expired') { f.server.passport.observedAt = now - 31_000; f.server.passport.observationExpiresAt = now - 1; }
    if (mode === 'future') { f.server.passport.observedAt = now + 1_000; f.server.passport.observationExpiresAt = now + 2_000; }
    assert.equal(reviewSkyAgentRequirements(f.requirements, [f.pkg], [f.server]).state, 'unconfirmed');
  }
});
