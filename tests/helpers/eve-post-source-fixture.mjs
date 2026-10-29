import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { communityKeyHash } from '../../lib/community-access.ts';
import { skyAgentLibraryStore } from '../../lib/sky-agent-library-store.ts';
import { eveSourceContext } from '../../lib/eve-source-context-store.ts';
import { makeEveAgentOrigin } from '../../lib/eve-agent-origin.ts';
import { defaultSkyAgentSettings } from '../../lib/sky-agent-library.ts';
export async function postSourceFixture(t) {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!f.startsWith('._')).sort()) sqlite.exec(readFileSync(new URL(`../../drizzle/${file}`,import.meta.url),'utf8'));
  const db={beforeFirst:null,beforeRun:null,prepare(sql){return {bind(...args){return {
    async first(){db.beforeFirst?.(sql,args);return sqlite.prepare(sql).get(...args)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...args)};},
    async run(){db.beforeRun?.(sql,args);return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},
  };}};}};
  const owner='post-fixture-reader',author='post-fixture-author',profileId=randomUUID(),authorId=randomUUID(),communityId=randomUUID(),postId=randomUUID(),parentId=randomUUID(),key='a'.repeat(64);
  for(const [id,o] of [[profileId,owner],[authorId,author]]) sqlite.prepare('INSERT INTO sky_social_profiles(id,owner_id,name,created_at) VALUES(?,?,?,1)').run(id,o,o);
  sqlite.prepare('INSERT INTO sky_communities(id,owner_id,name,description,rules,visibility,created_at) VALUES(?,?,?,?,?,?,1)').run(communityId,author,'Private fixture','private','rules','members');
  sqlite.prepare('INSERT INTO sky_community_members(community_id,profile_id,joined_at) VALUES(?,?,1)').run(communityId,profileId);
  sqlite.prepare('INSERT INTO sky_community_keys(community_id,profile_id,key_hash,created_at) VALUES(?,?,?,1)').run(communityId,profileId,await communityKeyHash(key));
  const keys={[communityId]:key};
  const insert=(id,{community=null,replyTo=null,content='Selected fixture text',attachment=null}={})=>sqlite.prepare('INSERT INTO sky_social_posts(id,author_id,community_id,content,attachment,created_at,reply_to) VALUES(?,?,?,?,?,1,?)').run(id,authorId,community,content,attachment?JSON.stringify(attachment):null,replyTo);
  insert(parentId,{community:communityId,content:'Unselected private parent'});insert(postId,{community:communityId,replyTo:parentId,attachment:{kind:'dataset',resource:'fixture/selected'}});
  const context=()=>eveSourceContext(db,owner,`post:${postId}`,keys);
  const settings=async()=>({...defaultSkyAgentSettings('Post fixture role','User editable role'),origin:await makeEveAgentOrigin('fixture-thread','fixture-reply','Synthetic reply',(await context()).source)});
  return {sqlite,db,owner,author,profileId,authorId,communityId,postId,parentId,key,keys,insert,context,settings,store:()=>skyAgentLibraryStore(db,owner,keys),count:()=>Number(sqlite.prepare('SELECT COUNT(*) n FROM sky_agent_settings').get().n)};
}
