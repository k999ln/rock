import type { CapturedAgentUsageSource } from './sky-agent-usage-provenance.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { WorkError } from './workflow.ts';

export type AuthorUsageAgreement = {
  schema: 'sky.author-usage-agreement/1'; id: string; version: string;
  publisherId: string; platformId: string; providerId: string;
  packageKey: string; manifestSha256: string; pricingVersion: string;
  termsSha256: string; currency: string; issuedAt: number; expiresAt: number;
  authorKeyId: string; platformKeyId: string; authorSignature: string; platformSignature: string;
};
const fields = ['schema','id','version','publisherId','platformId','providerId','packageKey','manifestSha256','pricingVersion','termsSha256','currency','issuedAt','expiresAt','authorKeyId','platformKeyId'] as const;
const domain = 'sky.author-usage-agreement-signature/1\0';
export function authorUsageAgreementSigningBytes(a: AuthorUsageAgreement) {
  return new TextEncoder().encode(domain + JSON.stringify(Object.fromEntries(fields.map(f => [f,a[f]]))));
}
export type BoundAuthorUsageAgreement = {
  agreement: AuthorUsageAgreement; agreementSha256: string; boundAt: string;
  receiptSha256: string; status: 'agreement_bound_pending_collection'; amountMinor: null;
};
function invalid(): never { throw new WorkError('作者・運営の署名、契約版、利用元と有効期限を照合できません。',409); }
/** Only server-configured, role-scoped public keys are trusted. This binds
 * attribution terms; it neither confirms collection nor allocates or pays money. */
export async function verifyAuthorUsageAgreement(raw: unknown, source: CapturedAgentUsageSource, configuration?: string, now=Date.now()): Promise<BoundAuthorUsageAgreement> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  let a: AuthorUsageAgreement;
  try { a=JSON.parse(JSON.stringify(raw)) as AuthorUsageAgreement; } catch { invalid(); }
  if (Object.keys(a).length !== fields.length+2 || Object.keys(a).some(k => ![...fields,'authorSignature','platformSignature'].includes(k as typeof fields[number])) ||
      a.schema !== 'sky.author-usage-agreement/1' || typeof a.currency !== 'string' || !/^[A-Z]{3}$/.test(a.currency)) invalid();
  for (const f of ['id','version','publisherId','platformId','providerId','packageKey','pricingVersion','authorKeyId','platformKeyId'] as const)
    if (typeof a[f] !== 'string' || !/^[A-Za-z0-9._:@/-]{1,256}$/.test(a[f])) invalid();
  if (![a.manifestSha256,a.termsSha256].every(x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)) ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(a.issuedAt) || !Number.isSafeInteger(a.expiresAt) ||
      a.issuedAt < 0 || a.issuedAt > now || a.expiresAt <= now || a.expiresAt <= a.issuedAt) invalid();
  const p=source.provenance;
  if (p.currency !== a.currency || !Number.isSafeInteger(p.receiptIssuedAt) || p.receiptIssuedAt < a.issuedAt || p.receiptIssuedAt >= a.expiresAt ||
      !p.package || p.status !== 'package_attributed' || p.package.runtimeBindingStatus !== 'active' ||
      p.package.packageKey !== a.packageKey || p.package.manifestSha256 !== a.manifestSha256 ||
      p.package.registeredPublisherId !== a.publisherId || p.providerId !== a.providerId || p.pricingVersion !== a.pricingVersion) invalid();
  let keys: unknown;
  try { keys=JSON.parse(configuration ?? 'null'); } catch { invalid(); }
  if (!Array.isArray(keys) || keys.length > 64) invalid();
  const bytes=authorUsageAgreementSigningBytes(a);
  const usedKeys = new Set<string>();
  for (const role of ['author','platform'] as const) {
    const principalId=role === 'author' ? a.publisherId : a.platformId;
    const keyId=role === 'author' ? a.authorKeyId : a.platformKeyId;
    const matches=keys.filter(k=>k && typeof k==='object' && k.role===role && k.principalId===principalId && k.keyId===keyId);
    if (matches.length !== 1) invalid();
    const k=matches[0];
    if(k.status!=='active' || typeof k.publicKeyHex!=='string' || !/^[a-f0-9]{64}$/.test(k.publicKeyHex) ||
      !Array.isArray(k.packagePins) || !k.packagePins.some((pin: {packageKey?:unknown;manifestSha256?:unknown})=>pin && pin.packageKey===a.packageKey && pin.manifestSha256===a.manifestSha256)) invalid();
    if(usedKeys.has(k.publicKeyHex)) invalid();
    usedKeys.add(k.publicKeyHex);
    const signature=role==='author'?a.authorSignature:a.platformSignature;
    if(typeof signature!=='string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) invalid();
    try {
      const key=await crypto.subtle.importKey('raw',Uint8Array.from(k.publicKeyHex.match(/../g)!, (s:string)=>parseInt(s,16)),{name:'Ed25519'},false,['verify']);
      const sig=Uint8Array.from(atob(signature.replaceAll('-','+').replaceAll('_','/')+'=='),c=>c.charCodeAt(0));
      if(btoa(String.fromCharCode(...sig)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')!==signature) invalid();
      if(!await crypto.subtle.verify({name:'Ed25519'},key,sig,bytes)) invalid();
    } catch { invalid(); }
  }
  return {agreement:a,agreementSha256:await sha256Hex(new TextDecoder().decode(bytes)),boundAt:new Date(now).toISOString(),receiptSha256:p.receiptSha256,status:'agreement_bound_pending_collection',amountMinor:null};
}
