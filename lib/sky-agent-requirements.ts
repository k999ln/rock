import type { SkyToolPackage } from './sky-tool-package.ts';
import type { McpConnection } from './mcp-hub.ts';
import { SKY_PERMISSIONS, type SkyPermission } from './sky-submission.ts';
import { compatibleLocalPackageRuntimes } from './sky-package-runtime.ts';

/** A user's requested connection, not an execution grant or a claim of capability. */
export type SkyAgentRequirements = {
  contract?: SkyAgentToolExpectation;
  inputFields: string[];
  outputFields: string[];
  packageKey: string;
  executionTarget: '' | 'device_local' | 'pc' | 'cloud';
};

const hasControl = (value: string) => {
  for (let i = 0; i < value.length; i++) { const n = value.charCodeAt(i); if (n < 32 || n === 127) return true; }
  return false;
};

export function parseSkyAgentRequirements(value: unknown): SkyAgentRequirements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('必要な入力と成果の形式を確認してください。');
  const row = value as Record<string, unknown>;
  const keys = ['inputFields', 'outputFields', 'packageKey', 'executionTarget'];
  if (![4,5].includes(Object.keys(row).length) || Object.keys(row).some(k => ![...keys,'contract'].includes(k)) || keys.some(k => !Object.hasOwn(row, k)))
    throw new Error('必要な入力と成果の項目を確認してください。');
  const fields = (input: unknown) => {
    if (!Array.isArray(input) || input.length > 16 || input.some(v => typeof v !== 'string' || !v.trim() || v.length > 80 || hasControl(v)))
      throw new Error('入力と成果の項目を確認してください。');
    const result = (input as string[]).map(v => v.trim());
    if (new Set(result).size !== result.length) throw new Error('入力と成果の項目が重複しています。');
    return result;
  };
  if (typeof row.packageKey !== 'string' || row.packageKey.length > 200 || hasControl(row.packageKey) ||
      typeof row.executionTarget !== 'string' || !['', 'device_local', 'pc', 'cloud'].includes(row.executionTarget))
    throw new Error('Toolと実行先を確認してください。');
  return { inputFields: fields(row.inputFields), outputFields: fields(row.outputFields), packageKey: row.packageKey,
    executionTarget: row.executionTarget as SkyAgentRequirements['executionTarget'],
    ...(Object.hasOwn(row,'contract') ? { contract: parseSkyAgentToolExpectation(row.contract) } : {}) };
}

export type RequirementsPackage = { packageKey: string; manifest: SkyToolPackage; status: string; installable: boolean };
export type RequirementsReview = {
  state: 'needs_selection' | 'unavailable' | 'missing' | 'unconfirmed' | 'candidate';
  issues: string[];
  candidates: Array<{ serverId: string; serverName: string; toolName: string }>;
};

/** Review declarations only; dispatch must repeat the existing server-side authority checks. */
export function reviewSkyAgentRequirements(requirements: SkyAgentRequirements, packages: readonly RequirementsPackage[],
  servers: readonly McpConnection[] | null): RequirementsReview {
  const r = parseSkyAgentRequirements(requirements);
  if (!r.packageKey || !r.executionTarget) return { state: 'needs_selection', issues: ['Toolと実行先を選んでください。'], candidates: [] };
  const pkg = packages.find(item => item.packageKey === r.packageKey);
  if (!pkg) return { state: 'unavailable', issues: ['選択したToolを本人の一覧で確認できません。'], candidates: [] };
  if (pkg.status !== 'verified' || pkg.installable !== true)
    return { state: 'unavailable', issues: ['Toolの審査状態を確認してください。'], candidates: [] };
  if (!pkg.manifest.capabilities.executionTargets.includes(r.executionTarget))
    return { state: 'missing', issues: ['選んだ実行先はToolの宣言にありません。'], candidates: [] };
  const issues: string[] = [];
  const unconfirmed: string[] = [];
  const fields = (schema: Record<string, unknown>, desired: string[], label: string) => {
    const props = schema.properties;
    if (schema.type !== 'object' || !props || typeof props !== 'object' || Array.isArray(props)) {
      unconfirmed.push(`${label}の宣言を確認できません。`);
      return;
    }
    for (const key of desired) if (!Object.hasOwn(props, key)) issues.push(`${label}「${key}」は宣言で確認できません。`);
  };
  fields(pkg.manifest.io.inputSchema, r.inputFields, '入力');
  fields(pkg.manifest.io.outputSchema, r.outputFields, '成果');
  const requiredInput = pkg.manifest.io.inputSchema.required;
  if (Array.isArray(requiredInput)) {
    for (const key of requiredInput) {
      if (typeof key === 'string' && !r.inputFields.includes(key))
        issues.push(`Toolの必須入力「${key}」が担当の必要な入力にありません。`);
    }
  }
  if (issues.length) return { state: 'missing', issues, candidates: [] };
  if (unconfirmed.length) return { state: 'unconfirmed', issues: unconfirmed, candidates: [] };
  const declared = reviewSkyAgentPackageContract(r, pkg.manifest);
  if (declared.state !== 'candidate') return { ...declared, candidates: [] };
  if (r.executionTarget !== 'pc') return { state: 'unconfirmed', issues: ['この実行先の接続・権限・費用は実行時に確認してください。'], candidates: [] };
  if (!servers) return { state: 'unconfirmed', issues: ['PCの接続状態を確認できません。'], candidates: [] };
  const selected = r.contract!.runtime!;
  const server = servers.find(item => item.id === selected.serverId);
  if (!server || server.state !== 'connected' || !server.passport)
    return { state:'unconfirmed',issues:['選択した実Toolの接続を読み直してください。'],candidates:[] };
  const tool = server.passport.tools.find(item => item.name === selected.toolName);
  if (!tool) return {state:'missing',issues:['選択した実Toolが現在の接続にありません。'],candidates:[]};
  const actual = readSkyToolCapabilityDeclaration(tool.inputSchema);
  if (!actual) return {state:'unconfirmed',issues:['実Toolの処理能力・permission・scope宣言が未確認です。'],candidates:[]};
  const actualCheck = checkDeclaration(r.contract!, actual, '実Tool');
  if (actualCheck.state !== 'candidate') return {...actualCheck,candidates:[]};
  const pkgDeclaration = readSkyToolCapabilityDeclaration(pkg.manifest.io.inputSchema)!;
  if (declarationKey(actual) !== declarationKey(pkgDeclaration))
    return {state:'missing',issues:['Packageと実Toolの処理能力・permission・scope宣言が一致しません。'],candidates:[]};
  const matches = compatibleLocalPackageRuntimes(pkg.manifest,[server]).filter(item => item.tool.name === selected.toolName);
  if (!matches.length) return {state:'missing',issues:['Packageと選択した実Toolのschema・実行先・無料申告が一致しません。'],candidates:[]};
  return {state:'candidate',issues:['本人が指定した型・処理能力・permission・scopeと選択実Toolの宣言条件が一致しました。提供者申告の照合であり、実権限・安全性・確定料金・処理成功の証明ではありません。'],
    candidates:matches.map(({server,tool})=>({serverId:server.id,serverName:server.name,toolName:tool.name}))};
}

export const SKY_TOOL_CONTRACT_ANNOTATION = 'x-rockstaros-tool-contract';
export type SkyFieldType = 'string'|'number'|'integer'|'boolean'|'object'|'array'|'null';
export type SkyPermissionScope = { permission: SkyPermission; scopes: string[] };
export type SkyAgentToolExpectation = {
  schema:'rockstaros.agent-tool-expectation/1';
  inputTypes?: Record<string,SkyFieldType>;
  outputTypes?: Record<string,SkyFieldType>;
  capabilityIds?: string[];
  allowedPermissions?: SkyPermissionScope[];
  runtime?: {serverId:string;toolName:string};
};
export type SkyToolCapabilityDeclaration = {
  schema:'rockstaros.tool-capability/1'; capabilityIds:string[]; permissions:SkyPermissionScope[];
};
const exact = (v:unknown, allowed:string[]) => {
  if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!allowed.includes(k)))
    throw new Error('型・処理能力・permission・scopeの形式を確認してください。');
  return v as Record<string,unknown>;
};
const identifiers = (v:unknown):string[] => {
  if(!Array.isArray(v)||v.length>32||v.some(x=>typeof x!=='string'||!x||x.length>240||hasControl(x)||x.trim()!==x||x.includes('*'))||new Set(v).size!==v.length)
    throw new Error('宣言IDは重複のない完全一致の文字列で指定してください。');
  return [...v];
};
const permissionScopes = (v:unknown):SkyPermissionScope[] => {
  if(!Array.isArray(v)||v.length>SKY_PERMISSIONS.length)throw new Error('permissionとscopeを確認してください。');
  const rows=v.map(item=>{const row=exact(item,['permission','scopes']);
    if(Object.keys(row).length!==2||typeof row.permission!=='string'||!SKY_PERMISSIONS.includes(row.permission as SkyPermission))
      throw new Error('権限なしは空配列、権限ありはpermissionとscopeを明示してください。');
    return {permission:row.permission as SkyPermission,scopes:identifiers(row.scopes)};});
  if(new Set(rows.map(row=>row.permission)).size!==rows.length)throw new Error('permissionを重複なく指定してください。');
  return rows;
};
const fieldTypes = (v:unknown):Record<string,SkyFieldType> => {
  const row=exact(v,Object.keys(v && typeof v==='object' ? v : {}));
  if(Object.keys(row).length>16)throw new Error('型の項目数を確認してください。');
  for(const [key,type] of Object.entries(row))if(!key||key.length>80||hasControl(key)||key.trim()!==key||
    (typeof type!=='string'||!['string','number','integer','boolean','object','array','null'].includes(type)))throw new Error('各項目のJSON型を明示してください。');
  return {...row} as Record<string,SkyFieldType>;
};
export function parseSkyAgentToolExpectation(value:unknown):SkyAgentToolExpectation {
  const v=exact(value,['schema','inputTypes','outputTypes','capabilityIds','allowedPermissions','runtime']);
  if(v.schema!=='rockstaros.agent-tool-expectation/1')throw new Error('未対応の能力条件版です。旧形式として扱いません。');
  let runtime:SkyAgentToolExpectation['runtime'];
  if(Object.hasOwn(v,'runtime')){const x=exact(v.runtime,['serverId','toolName']);
    if(Object.keys(x).length!==2||![x.serverId,x.toolName].every(x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x)))throw new Error('選択した実Toolを確認してください。');
    runtime={serverId:x.serverId as string,toolName:x.toolName as string};}
  return {schema:'rockstaros.agent-tool-expectation/1',
    ...(Object.hasOwn(v,'inputTypes')?{inputTypes:fieldTypes(v.inputTypes)}:{}),
    ...(Object.hasOwn(v,'outputTypes')?{outputTypes:fieldTypes(v.outputTypes)}:{}),
    ...(Object.hasOwn(v,'capabilityIds')?{capabilityIds:identifiers(v.capabilityIds)}:{}),
    ...(Object.hasOwn(v,'allowedPermissions')?{allowedPermissions:permissionScopes(v.allowedPermissions)}:{}),...(runtime?{runtime}:{})};
}
export function readSkyToolCapabilityDeclaration(schema:Record<string,unknown>):SkyToolCapabilityDeclaration|null {
  try{const v=exact(schema[SKY_TOOL_CONTRACT_ANNOTATION],['schema','capabilityIds','permissions']);
    if(v.schema!=='rockstaros.tool-capability/1'||Object.keys(v).length!==3)return null;
    return {schema:'rockstaros.tool-capability/1',capabilityIds:identifiers(v.capabilityIds),permissions:permissionScopes(v.permissions)};
  }catch{return null;}
}
const declarationKey=(v:SkyToolCapabilityDeclaration)=>JSON.stringify({capabilityIds:[...v.capabilityIds].sort((a,b)=>a<b?-1:a>b?1:0),
  permissions:v.permissions.map(p=>({permission:p.permission,scopes:[...p.scopes].sort((a,b)=>a<b?-1:a>b?1:0)})).sort((a,b)=>a.permission<b.permission?-1:a.permission>b.permission?1:0)});
type ContractCheck = Pick<RequirementsReview,'state'|'issues'>;
function checkDeclaration(r:SkyAgentToolExpectation,d:SkyToolCapabilityDeclaration,label:string):ContractCheck {
  const issues:string[]=[],unknown:string[]=[];
  if(!Object.hasOwn(r,'capabilityIds'))unknown.push('本人の必要な処理能力IDが未指定です。');
  else for(const id of r.capabilityIds!)if(!d.capabilityIds.includes(id))issues.push(`${label}に処理能力ID「${id}」がありません。`);
  if(!Object.hasOwn(r,'allowedPermissions'))unknown.push('本人の許容permission・scopeが未指定です。');
  else for(const p of d.permissions){const allowed=r.allowedPermissions!.find(x=>x.permission===p.permission);
    if(!allowed)issues.push(`${label}のpermission「${p.permission}」は許容されていません。`);
    else {
      if (['network','external_account','selected_files','financial_action'].includes(p.permission) && p.scopes.length === 0)
        unknown.push(`${label}のpermission「${p.permission}」の対象scopeが未確認です。`);
      for(const scope of p.scopes)if(!allowed.scopes.includes(scope))issues.push(`${label}のscope「${scope}」は許容されていません。`);
    }}
  return issues.length?{state:'missing',issues}:unknown.length?{state:'unconfirmed',issues:unknown}:{state:'candidate',issues:[]};
}
/** Package-only admission check. Actual Tool declarations must additionally match
 * via the existing Connector schema digests at claim; this never invents them. */
export function reviewSkyAgentPackageContract(requirements:SkyAgentRequirements,manifest:SkyToolPackage):ContractCheck {
  const r=parseSkyAgentRequirements(requirements),c=r.contract,issues:string[]=[],unknown:string[]=[];
  if(!c)return {state:'unconfirmed',issues:['型・処理能力・permission・scope・実Toolが未指定です。旧形式を確認済みにはしません。']};
  if(!manifest.capabilities.executionTargets.includes(r.executionTarget as 'pc'))issues.push('Packageの実行先が一致しません。');
  for(const [label,schema] of [['入力',manifest.io.inputSchema],['成果',manifest.io.outputSchema]] as const) {
    const props = schema.properties;
    if (schema.type !== 'object' || !props || typeof props !== 'object' || Array.isArray(props))
      unknown.push(`${label}の宣言を確認できません。`);
    if(Object.hasOwn(schema,'required') && (!Array.isArray(schema.required) || schema.required.some(x=>typeof x!=='string') || new Set(schema.required).size!==schema.required.length))
      unknown.push(`${label}のrequired宣言が不正または未確認です。`);
  }
  const required=manifest.io.inputSchema.required;
  if(Array.isArray(required))for(const key of required)if(typeof key==='string'&&!r.inputFields.includes(key))issues.push(`必須入力「${key}」が希望にありません。`);
  for(const [label,names,types,schema] of [['入力',r.inputFields,c.inputTypes,manifest.io.inputSchema],['成果',r.outputFields,c.outputTypes,manifest.io.outputSchema]] as const){
    if(!types){unknown.push(`${label}の期待する型が未指定です。`);continue;}
    const props=schema.properties;
    for(const key of names){
      if(!Object.hasOwn(types,key)){issues.push(`${label}「${key}」の期待する型が明示されていません。`);continue;}
      const declared=props&&typeof props==='object'&&!Array.isArray(props)?(props as Record<string,unknown>)[key]:undefined;
      if(!declared||typeof declared!=='object'||Array.isArray(declared)||!Object.hasOwn(declared,'type'))unknown.push(`${label}「${key}」の型宣言が未確認です。`);
      else {const type=(declared as Record<string,unknown>).type;
        if(typeof type!=='string'||!['string','number','integer','boolean','object','array','null'].includes(type))unknown.push(`${label}「${key}」はこの有限照合で未対応の型です。`);
        else if(type!==types[key])issues.push(`${label}「${key}」の型が一致しません。`);}
    }
    for(const key of Object.keys(types))if(!names.includes(key))issues.push(`${label}の型「${key}」に対応する希望項目がありません。`);
  }
  if(!c.runtime)unknown.push('使用する実Toolが未指定です。');
  const declaration=readSkyToolCapabilityDeclaration(manifest.io.inputSchema);
  if(!declaration)unknown.push('Packageの処理能力・permission・scope宣言が未確認です。');
  else {
    const top=[...manifest.capabilities.permissions].sort((a,b)=>a<b?-1:a>b?1:0);
    const declared=declaration.permissions.map(p=>p.permission).sort((a,b)=>a<b?-1:a>b?1:0);
    if(JSON.stringify(top)!==JSON.stringify(declared))issues.push('Packageのpermission宣言と共通契約が一致しません。');
    const checked=checkDeclaration(c,declaration,'Package');
    (checked.state==='missing'?issues:unknown).push(...checked.issues);
  }
  return issues.length?{state:'missing',issues}:unknown.length?{state:'unconfirmed',issues:unknown}:{state:'candidate',issues:[]};
}
