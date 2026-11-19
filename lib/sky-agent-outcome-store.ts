import { communityKeyHash, requireCommunityKey, type CommunityKeys } from './community-access.ts';
import { skyAgentShareStore } from './sky-agent-share-store.ts';
import { eveToolWorkStore, verifyEveCitationOutput } from './eve-tool-work.ts';
import { socialId, socialObject, SkySocialError } from './sky-social.ts';
import { shareDigest, shareVersion } from './sky-agent-share.ts';
import { outcomeResource, type AgentOutcomeDraft, type AgentOutcomeSummary } from './sky-agent-outcomes.ts';

type DB=Pick<D1Database,'prepare'|'batch'>;
type Post={id:string;author_id:string;community_id:string|null;content:string;attachment:string|null;created_at:number;reply_to:string|null};
const fingerprint=(p:Post|null)=>p?communityKeyHash(JSON.stringify(p)):Promise.resolve(null);
export function skyAgentOutcomeStore(db:DB,owner:string,keys:CommunityKeys={}) {
  const shares=skyAgentShareStore(db,owner,keys);
  const readPost=(id:string)=>db.prepare('SELECT id,author_id,community_id,content,attachment,created_at,reply_to FROM sky_social_posts WHERE id=?').bind(socialId(id)).first<Post>();
  async function profile(){const p=await db.prepare('SELECT id FROM sky_social_profiles WHERE owner_id=?').bind(owner).first<{id:string}>();if(!p)throw new SkySocialError('ホームで公開プロフィールを作成してください。',409);return p;}
  async function acl(community:string|null){
    if(!community)return {sql:'1',args:[] as string[]};
    await requireCommunityKey(db,owner,community,keys);
    return {sql:"EXISTS(SELECT 1 FROM sky_communities c JOIN sky_community_members m ON m.community_id=c.id JOIN sky_community_keys k ON k.community_id=c.id AND k.profile_id=m.profile_id WHERE c.id=? AND c.archived_at=0 AND m.profile_id=? AND k.key_hash=? AND k.revoked_at=0 AND (c.post_mode='members' OR c.owner_id=?))",args:[community,(await profile()).id,await communityKeyHash(keys[community]),owner]};
  }
  async function preview(jobId:string,revision:unknown,helpful:unknown){
    if(typeof helpful!=='boolean')throw new SkySocialError('役立ったかを本人が選んでください。');
    const job=await eveToolWorkStore(db,owner).get(socialId(jobId)),binding=job.eveTool!.agentBinding,ref=binding?.shared;
    if(!ref||job.revision!==revision||job.status!=='completed'||!job.eveTool!.verification?.checks.length||!job.eveTool!.verification.checks.every(c=>c.passed))throw new SkySocialError('共有担当を使い、検査と本人確認を完了した仕事を選んでください。',409);
    const output=job.composition!.artifacts[job.eveTool!.outputStepId??'s1'];
    if(!output||output.status!=='passed'||typeof job.composition!.source!=='string'||await communityKeyHash(job.composition!.source)!==job.eveTool!.sourceSha256||await communityKeyHash(output.text)!==job.eveTool!.verification.outputSha256||!verifyEveCitationOutput(job.composition!.source,output.text).every(c=>c.passed))throw new SkySocialError('保存済みの原稿・成果と検査を確認できません。',409);
    const live=await db.prepare('SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at=0').bind(owner,job.eveTool!.threadId).first();
    if(!live)throw new SkySocialError('会話が削除されています。新しい利用結果を公開しません。',410);
    const share=await shares.read(ref.id,ref.version);if(share.withdrawn||share.digest!==ref.digest)throw new SkySocialError('共有元の版を確認できません。',409);
    const p=await profile(),h=await communityKeyHash(JSON.stringify(['agent-outcome/1',owner,ref.id,ref.version]));
    const postId=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
    const modified=binding.instructions!==share.manifest.agent.instructions||binding.provider!==share.manifest.agent.provider||binding.model!==share.manifest.agent.model;
    const attachment={kind:'agent-outcome' as const,resource:outcomeResource({...ref,helpful,modified})};
    const content=`「${share.manifest.agent.name}」v${ref.version}の利用結果\n本人の回答：${helpful?'役立った':'まだ役立たなかった'}\n確認済みの処理：引用Tool・出典URL集合の保持。内容の真偽確認ではありません。\nToolの手順：${job.eveTool!.planner==='validated-llm-candidate/1'?'検査した計画候補を本人が採用':'固定手順'}。\n設定：${modified?'役割または基盤モデルを変更して利用':'共有時の役割・基盤モデル設定で利用'}。`;
    const prior=await readPost(postId);if(prior&&prior.author_id!==p.id)throw new SkySocialError('利用結果の保存先を確認できません。',409);
    if(prior&&(prior.community_id!==share.manifest.communityId||prior.reply_to!==null||(prior.content&&(!prior.attachment||JSON.parse(prior.attachment).kind!=='agent-outcome'))))throw new SkySocialError('このIDは別の投稿に使われています。',409);
    const expected=await fingerprint(prior);
    const material={postId,expected,content,communityId:share.manifest.communityId,attachment};
    const draft:AgentOutcomeDraft={...material,digest:await communityKeyHash(JSON.stringify({jobId:job.id,revision:job.revision,...material}))};
    return {draft,job,profileId:p.id};
  }
  async function summary(id:string,version:number):Promise<AgentOutcomeSummary>{
    const share=await shares.read(socialId(id),shareVersion(version));
    const prefix=`${share.manifest.id}:${share.manifest.version}:${share.digest}:`;
    const r=await db.prepare("SELECT COUNT(DISTINCT CASE WHEN json_extract(attachment,'$.resource')=? THEN author_id END) ho,COUNT(DISTINCT CASE WHEN json_extract(attachment,'$.resource')=? THEN author_id END) no,COUNT(DISTINCT CASE WHEN json_extract(attachment,'$.resource')=? THEN author_id END) hm,COUNT(DISTINCT CASE WHEN json_extract(attachment,'$.resource')=? THEN author_id END) nm FROM sky_social_posts WHERE content<>'' AND json_extract(attachment,'$.kind')='agent-outcome' AND author_id<>? AND community_id IS ?")
      .bind(prefix+'h:o',prefix+'n:o',prefix+'h:m',prefix+'n:m',share.manifest.author,share.manifest.communityId).first<{ho:number;no:number;hm:number;nm:number}>();
    return {original:{helpful:r?.ho??0,notHelpful:r?.no??0},modified:{helpful:r?.hm??0,notHelpful:r?.nm??0}};
  }
  async function mutate(raw:unknown){
    const v=socialObject(raw,['action','jobId','jobRevision','helpful','digest','expected','approve','postId']);
    if(v.action==='status'){
      socialObject(raw,['action','postId']);const p=await profile(),post=await readPost(socialId(v.postId));
      if(!post||post.author_id!==p.id)throw new SkySocialError('自分の利用結果が見つかりません。',404);
      if(post.community_id)await requireCommunityKey(db,owner,post.community_id,keys);
      return {postId:post.id,withdrawn:post.content==='',content:post.content,attachment:post.attachment?JSON.parse(post.attachment):null,digest:await fingerprint(post)};
    }
    if(v.action==='withdraw'){
      socialObject(raw,['action','postId','digest','approve']);if(v.approve!==true)throw new SkySocialError('利用結果の公開停止を確認してください。');
      const p=await profile(),post=await readPost(socialId(v.postId));if(!post||post.author_id!==p.id)throw new SkySocialError('自分の利用結果が見つかりません。',404);
      if(await fingerprint(post)!==shareDigest(v.digest))throw new SkySocialError('利用結果が更新されています。',409);
      if(post.content&&(!post.attachment||JSON.parse(post.attachment).kind!=='agent-outcome'))throw new SkySocialError('利用結果の投稿を選んでください。',400);
      // An author may remove their own opt-in report after leaving a community.
      const args=[post.id,p.id,post.content,post.attachment,post.created_at];
      const match='id=? AND author_id=? AND content=? AND attachment IS ? AND created_at=?';
      const results=await db.batch([
        db.prepare(`DELETE FROM sky_social_reactions WHERE post_id=? AND EXISTS(SELECT 1 FROM sky_social_posts WHERE ${match})`).bind(post.id,...args),
        db.prepare(`UPDATE sky_social_posts SET content='',attachment=NULL,created_at=? WHERE ${match}`).bind(Math.max(Date.now(),post.created_at+1),...args),
      ]),result=results[1];
      if(!result.meta.changes)throw new SkySocialError('投稿または参加状態が変わりました。',409);
      return {withdrawn:true,postId:post.id};
    }
    if(!['preview','publish'].includes(String(v.action)))throw new SkySocialError('操作を確認してください。');
    socialObject(raw,v.action==='preview'?['action','jobId','jobRevision','helpful']:['action','jobId','jobRevision','helpful','digest','expected','approve']);
    const {draft,job,profileId}=await preview(socialId(v.jobId),v.jobRevision,v.helpful);
    if(v.action==='preview')return draft;
    if(v.approve!==true||v.expected!==draft.expected||shareDigest(v.digest)!==draft.digest)throw new SkySocialError('公開する内容が変わりました。もう一度確認してください。',409);
    const gate=await acl(draft.communityId),encoded=JSON.stringify(draft.attachment),prior=await readPost(draft.postId),now=Math.max(Date.now(),(prior?.created_at??0)+1);
    if(await fingerprint(prior)!==draft.expected)throw new SkySocialError('利用結果が同時に更新されました。',409);
    if(prior?.content===draft.content&&prior.attachment===encoded)return {published:true,postId:draft.postId,replayed:true};
    const fence="EXISTS(SELECT 1 FROM work_jobs WHERE user_id=? AND id=? AND revision=? AND json_extract(payload,'$.status')='completed') AND EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at=0) AND EXISTS(SELECT 1 FROM sky_agent_shares WHERE id=? AND version=? AND digest=? AND withdrawn_at=0)";
    const ref=job.eveTool!.agentBinding!.shared!,args=[owner,job.id,job.revision,owner,job.eveTool!.threadId,ref.id,ref.version,ref.digest];
    const match='id=? AND author_id=? AND content=? AND attachment IS ? AND created_at=?',old=prior?[draft.postId,profileId,prior.content,prior.attachment,prior.created_at]:[];
    const result=prior?(await db.batch([
      db.prepare(`DELETE FROM sky_social_reactions WHERE post_id=? AND EXISTS(SELECT 1 FROM sky_social_posts WHERE ${match}) AND ${fence} AND ${gate.sql}`).bind(draft.postId,...old,...args,...gate.args),
      db.prepare(`UPDATE sky_social_posts SET content=?,attachment=?,created_at=? WHERE ${match} AND ${fence} AND ${gate.sql}`).bind(draft.content,encoded,now,...old,...args,...gate.args),
    ]))[1]:await db.prepare(`INSERT INTO sky_social_posts(id,author_id,community_id,content,attachment,created_at,reply_to) SELECT ?,?,?,?,?,?,NULL WHERE ${fence} AND ${gate.sql} AND (SELECT COUNT(*) FROM sky_social_posts WHERE author_id=? AND created_at>?)<100 ON CONFLICT DO NOTHING`).bind(draft.postId,profileId,draft.communityId,draft.content,encoded,now,...args,...gate.args,profileId,now-86400000).run();
    if(result.meta.changes!==1)throw new SkySocialError('仕事・共有版・投稿・参加状態が変わりました。保存状態を確認してください。',409);
    return {published:true,postId:draft.postId};
  }
  return {preview,summary,mutate};
}
