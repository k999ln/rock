import { communityKeyHash, communitySecret, type CommunityKeys } from './community-access.ts';
import { evePostSourcePin, sameEveSource, type EvePostSnapshot, type EvePostSourcePin } from './eve-source-context.ts';
import { SkySocialError, socialId, socialAttachment } from './sky-social.ts';
type DB=Pick<D1Database,'prepare'>;
type PostRow={id:string;author_id:string;community_id:string|null;content:string;attachment:string|null;created_at:number;reply_to:string|null};
// Re-evaluate owner/profile/member/key/archive and parent integrity inside the
// same SELECT or INSERT statement. A previously allowed community list is not authority.
const visible=`EXISTS(SELECT 1 FROM sky_social_profiles author WHERE author.id=s.author_id) AND
  (s.reply_to IS NULL OR EXISTS(SELECT 1 FROM sky_social_posts parent WHERE parent.id=s.reply_to AND parent.community_id IS s.community_id)) AND
  (s.community_id IS NULL OR EXISTS(SELECT 1 FROM sky_communities c JOIN sky_community_members m ON m.community_id=c.id
    JOIN sky_community_keys k ON k.community_id=c.id AND k.profile_id=m.profile_id
    JOIN json_each(?) supplied ON supplied.key=c.id AND supplied.value=k.key_hash
    WHERE c.id=s.community_id AND c.archived_at=0 AND m.profile_id=viewer.id AND k.revoked_at=0))`;
async function hashes(keys:CommunityKeys) {
  const entries=Object.entries(keys);
  if(entries.length>100) throw new SkySocialError('専用鍵の形式を確認してください。');
  return JSON.stringify(Object.fromEntries(await Promise.all(entries.map(async([id,key])=>[socialId(id),await communityKeyHash(communitySecret(key))]))));
}
const unavailable=()=>new SkySocialError('投稿が見つからないか、現在の閲覧権限がありません。',409);
export async function evePostSourceContext(db:DB,owner:string,key:string,keys:CommunityKeys={}) {
  if(!key.startsWith('post:')) throw unavailable();
  const id=socialId(key.slice(5)), supplied=await hashes(keys);
  const row=await db.prepare(`SELECT s.id,s.author_id,s.community_id,s.content,s.attachment,s.created_at,s.reply_to
    FROM sky_social_posts s JOIN sky_social_profiles viewer ON viewer.owner_id=? WHERE s.id=? AND ${visible}`)
    .bind(owner,id,supplied).first<PostRow>();
  if(!row) throw unavailable();
  const post:EvePostSnapshot={id:row.id,authorId:row.author_id,communityId:row.community_id,replyTo:row.reply_to,
    createdAt:row.created_at,content:row.content,attachment:row.attachment?socialAttachment(JSON.parse(row.attachment)):null};
  return {source:await evePostSourcePin(post),post};
}
export async function evePostCreatePredicate(db:DB,owner:string,source:EvePostSourcePin,keys:CommunityKeys) {
  const current=await evePostSourceContext(db,owner,source.key,keys);
  if(!sameEveSource(source,current.source)) throw unavailable();
  const p=current.post, supplied=await hashes(keys);
  // Compare the two typed attachment fields, not JSON key order or whitespace.
  // Extra fields are rejected just like the source parser.
  return {sql:`EXISTS(SELECT 1 FROM sky_social_posts s JOIN sky_social_profiles viewer ON viewer.owner_id=?
    WHERE s.id=? AND s.author_id=? AND s.community_id IS ? AND s.reply_to IS ? AND s.created_at=? AND s.content=?
    AND ((s.attachment IS NULL AND ? IS NULL) OR (json_type(s.attachment)='object' AND (SELECT COUNT(*) FROM json_each(s.attachment))=2 AND json_extract(s.attachment,'$.kind') IS ? AND json_extract(s.attachment,'$.resource') IS ?)) AND ${visible})`,
    args:[owner,p.id,p.authorId,p.communityId,p.replyTo,p.createdAt,p.content,p.attachment?.kind??null,p.attachment?.kind??null,p.attachment?.resource??null,supplied]};
}
