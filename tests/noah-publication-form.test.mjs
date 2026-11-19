import test from 'node:test';
import assert from 'node:assert/strict';
import { packageFromPublicationForm, publicationFieldsSchema } from '../lib/noah-publication-form.ts';
const form={id:'dev.test.my-agent',version:'1.0.0',name:'My test agent',summary:'入力を受け取り、検証可能な成果を返す試験用のAgentです。',developerName:'Test Author',developerId:'test-author',license:'MIT',sourceKind:'inline_code',sourceUrl:'',fileName:'agent.mjs',connectionType:'mcp_stdio',endpointUrl:'',connectivity:'online',targets:['pc'],permissions:['read_user_input','write_results','network'],sideEffects:[],pricing:'external_contract',priceNote:'買い切り。実行時の外部費用は販売条件で確認。',timeoutSeconds:30,input:[{name:'question',label:'依頼する内容',type:'string',required:true},{name:'limit',label:'件数の上限',type:'integer',required:false}],output:[{name:'result',label:'処理結果',type:'string',required:true}],successCondition:'依頼した内容に合う結果が文字列で返ること。',validTest:'通常の入力で期待する結果を返す',invalidTest:'空の依頼は受け付けない'};
void test('author form preserves declared I/O, pricing and version without inventing verification or source pins',()=>{
  const p=packageFromPublicationForm(form);
  assert.equal(p.id,form.id);assert.equal(p.version,form.version);assert.equal(p.pricing.model,'external_contract');
  assert.deepEqual(p.io.inputSchema.required,['question']);assert.equal(p.io.inputSchema.properties.limit.type,'integer');
  assert.equal(p.execution.confirmation,'per_run');assert.equal(p.execution.maxAttempts,1);
  assert.equal(p.source.artifact,undefined);assert.equal(p.generation.generatedBy,'rock-studio/1');
  assert.deepEqual(p.tests.map(x=>x.name),[form.validTest,form.invalidTest]);assert.equal(p.installable,undefined);
});
void test('form rejects ambiguous fields, undeclared network/financial permission and missing author declarations',()=>{
  for(const fields of [[...form.input,form.input[0]],[{...form.input[0],name:'constructor'}],[{...form.input[0],type:'unknown'}]])assert.throws(()=>publicationFieldsSchema(fields));
  for(const patch of [{license:''},{version:'1'},{connectionType:''},{permissions:['read_user_input']},{sideEffects:['financial']},{successCondition:''},{invalidTest:''}])assert.throws(()=>packageFromPublicationForm({...form,...patch}));
  const p=packageFromPublicationForm({...form,permissions:[...form.permissions,'financial_action'],sideEffects:['financial']});
  assert.equal(p.execution.confirmation,'per_run');
});
