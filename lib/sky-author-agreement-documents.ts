import { parseAuthorRemunerationTerms } from './sky-author-remuneration-terms.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { verifyAuthorUsageAgreement, type AuthorUsageAgreement } from './sky-author-usage-agreement.ts';
import type { CapturedAgentUsageSource } from './sky-agent-usage-provenance.ts';
import { WorkError } from './workflow.ts';
type Database=Pick<D1Database,'prepare'>;
export type AuthorAgreementDocument={platformId:string;publisherId:string;agreementId:string;version:string;agreementSha256:string;termsSha256:string;agreementJson:string;termsText:string;createdAt:number;revokedAt:number|null;revokedBy:string|null};
const columns='platform_id AS platformId,publisher_id AS publisherId,agreement_id AS agreementId,version,agreement_sha256 AS agreementSha256,terms_sha256 AS termsSha256,agreement_json AS agreementJson,terms_text AS termsText,created_at AS createdAt,revoked_at AS revokedAt,revoked_by AS revokedBy';
export function authorAgreementDocuments(db:Database) {
 const get=(a:Pick<AuthorUsageAgreement,'platformId'|'publisherId'|'id'|'version'>)=>db.prepare(`SELECT ${columns} FROM sky_author_agreement_documents WHERE platform_id=? AND publisher_id=? AND agreement_id=? AND version=?`).bind(a.platformId,a.publisherId,a.id,a.version).first<AuthorAgreementDocument>();
 return {get,
  async list(source:CapturedAgentUsageSource) {
   const p=source.provenance;if(!p.package)return [];
   const rows=await db.prepare(`SELECT ${columns} FROM sky_author_agreement_documents WHERE publisher_id=? AND json_extract(agreement_json,'$.packageKey')=? AND json_extract(agreement_json,'$.manifestSha256')=? AND json_extract(agreement_json,'$.providerId')=? AND json_extract(agreement_json,'$.pricingVersion')=? AND json_extract(agreement_json,'$.currency')=? ORDER BY created_at DESC,agreement_id,version LIMIT 10`).bind(p.package.registeredPublisherId,p.package.packageKey,p.package.manifestSha256,p.providerId,p.pricingVersion,p.currency).all<AuthorAgreementDocument>();
   const verified=[];for(const row of rows.results)if(await sha256Hex(row.termsText)===row.termsSha256)verified.push(row);return verified;
  },
  async register(raw:unknown,text:unknown,source:CapturedAgentUsageSource,keys?:string) {
   if(typeof text!=='string' || !text.trim() || new TextEncoder().encode(text).length>8000 || Array.from(text).some(c=>{const n=c.codePointAt(0)!;return (n<32 && ![9,10,13].includes(n)) || n===127 || (n>=0xd800 && n<=0xdfff);})) throw new WorkError('契約本文は有効なテキスト8 KB以内にしてください。',400);
   parseAuthorRemunerationTerms(text);
   const verified=await verifyAuthorUsageAgreement(raw,source,keys),a=verified.agreement;
   if(await sha256Hex(text)!==a.termsSha256) throw new WorkError('契約本文と双方が署名した本文hashが一致しません。',409);
   await db.prepare(`INSERT OR IGNORE INTO sky_author_agreement_documents(platform_id,publisher_id,agreement_id,version,agreement_sha256,terms_sha256,agreement_json,terms_text,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(a.platformId,a.publisherId,a.id,a.version,verified.agreementSha256,a.termsSha256,JSON.stringify(a),text,Date.now()).run();
   const row=await get(a);
   if(!row || row.agreementSha256!==verified.agreementSha256 || row.termsSha256!==a.termsSha256 || row.termsText!==text) throw new WorkError('同じ契約版を別の内容へ置き換えられません。',409);
   if(row.revokedAt!==null) throw new WorkError('この契約版は失効しています。',409);
   return row;
  },
  async valid(a:AuthorUsageAgreement,digest:string,includeRevoked=false) {
   const row=await get(a);
   return row && (includeRevoked || row.revokedAt===null) && row.agreementSha256===digest && row.termsSha256===a.termsSha256 && await sha256Hex(row.termsText)===a.termsSha256 ? row : null;
  },
  async revoke(a:Pick<AuthorUsageAgreement,'platformId'|'publisherId'|'id'|'version'>,actor:string) {
   if(actor!==a.platformId && actor!==a.publisherId) throw new WorkError('この契約の当事者だけが失効できます。',403);
   const row=await get(a);if(!row) throw new WorkError('契約本文が見つかりません。',404);
   if(row.revokedAt!==null)return row;
   await db.prepare('UPDATE sky_author_agreement_documents SET revoked_at=?,revoked_by=? WHERE platform_id=? AND publisher_id=? AND agreement_id=? AND version=? AND revoked_at IS NULL').bind(Date.now(),actor,a.platformId,a.publisherId,a.id,a.version).run();
   return (await get(a))!;
  }
 };
}
