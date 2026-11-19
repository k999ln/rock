import { existsSync, readFileSync, readdirSync } from 'node:fs';
/** Load only these existing tables and indexes from canonical SQL; no migration execution. */
export function smisStorageFixtureTables(sqlite,names=['sky_agent_settings','sky_connections','sky_hub_plugins']) {
 const sources=['../../drizzle/','../../drizzle-main/'].flatMap(dir=>{const url=new URL(dir,import.meta.url);return existsSync(url)?readdirSync(url).filter(f=>f.endsWith('.sql')).sort().map(file=>readFileSync(new URL(file,url),'utf8')):[];}).join('\n');
 for(const name of names){
  if(!/^sky_[a-z_]+$/.test(name))throw Error('unsupported fixture table');
  const create=sources.match(new RegExp('CREATE TABLE(?: IF NOT EXISTS)? [`"]?'+name+'[`"]?\\s*\\([\\s\\S]*?\\);'))?.[0];
  if(!create)throw Error('Missing canonical fixture SQL: '+name);
  sqlite.exec(create);
  const indexes=[...sources.matchAll(new RegExp('CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? [^;]+ ON [`"]?'+name+'[`"]?\\s*\\([^;]+;','g'))].map(m=>m[0]);
  const seen=new Set();for(const sql of indexes){const key=sql.match(/INDEX(?: IF NOT EXISTS)?\s+([^\s]+)/)?.[1];if(!seen.has(key)){seen.add(key);sqlite.exec(sql);}}
 }
}
