import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planMigrationAliases, reconcileLocalMigrationAliases, sqliteLogicalDigest } from '../scripts/sites-migration-lineage.mjs';

function fixture(t, mode = 'root') {
  const root = mkdtempSync(join(tmpdir(), 'rock-alias-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceDirectory = join(root, 'source'), targetDirectory = join(root, 'target');
  const pairs = [['0064_sky_linux_service','0030_sky_linux_service'],['0065_rockstar_service_setup','0031_rockstar_service_setup']];
  for (const [dir, index] of [[sourceDirectory,0],[targetDirectory,1]]) {
    mkdirSync(join(dir, 'meta'), { recursive: true });
    const entries = pairs.map((p, idx) => ({idx,tag:p[index],when:100+idx}));
    writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify({ entries }));
    for (const pair of pairs) writeFileSync(join(dir, pair[index]+'.sql'), readFileSync(new URL('../drizzle/'+pair[1]+'.sql',import.meta.url)));
  }
  const databasePath = join(root, 'copy.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  if (mode !== 'fresh') {
    for (const pair of pairs) {
      for (const sql of readFileSync(join(targetDirectory,pair[1]+'.sql'),'utf8').split('--> statement-breakpoint').filter(s=>s.trim())) db.exec(sql);
      db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(pair[mode === 'main' ? 1 : 0]+'.sql');
    }
    db.exec(`INSERT INTO sky_linux_service_documents VALUES ('pending','alice','workspace',7,'{"pending":true,"reservation":17,"stopIntent":"same-command","revokedEpoch":4,"receipts":["exact-receipt"],"deleted":true}',1);
      CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at INTEGER);
      INSERT INTO work_jobs VALUES('job','alice','{"status":"active","stopRequestedAt":1}',7,1);
      CREATE TABLE eve_conversations(owner_id TEXT,id TEXT,deleted_at INTEGER,revision INTEGER);
      INSERT INTO eve_conversations VALUES('alice','thread',1,9);
      CREATE TABLE __drizzle_migrations(id INTEGER,hash TEXT,created_at INTEGER);
      INSERT INTO __drizzle_migrations VALUES(1,'original-hash',4102444800000);`);
  }
  db.close();
  const options = {databasePath,sourceDirectory,targetDirectory};
  const open = () => new DatabaseSync(databasePath);
  const plan = () => { const d=open(); try{return planMigrationAliases(d,options);}finally{d.close();} };
  const apply = (p=plan(), n='backup.sqlite') => reconcileLocalMigrationAliases({...options,backupPath:join(root,n),expectedPlanDigest:p.digest});
  return {root,...options,open,plan,apply};
}
await test('fresh database never records an unapplied alias', async t => {
  const f=fixture(t,'fresh'); assert.equal(f.plan().aliases.length,0);
  const before=f.plan().inputDigest; const result=await f.apply();assert.equal(result.recorded,0);assert.equal(f.plan().inputDigest,before);
});
await test('Root history registers exact aliases and existing filename migrator skips CREATE replay', async t => {
  const f=fixture(t);assert.equal(f.plan().aliases.length,2); const result=await f.apply();assert.equal(result.recorded,2);assert.equal(result.backupVerified,true);
  const db=f.open();t.after(()=>db.close());
  for(const name of ['0030_sky_linux_service.sql','0031_rockstar_service_setup.sql']) assert.ok(db.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(name));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM d1_migrations').get().n,4);
  assert.throws(()=>db.exec(readFileSync(join(f.targetDirectory,'0030_sky_linux_service.sql'),'utf8').split('--> statement-breakpoint')[0]),/already exists/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM _rock_migration_aliases').get().n,2);
});
await test('main history is an unchanged no-op and does not fabricate Root history',async t=>{
  const f=fixture(t,'main'),before=f.plan().inputDigest;assert.equal((await f.apply()).recorded,0);assert.equal(f.plan().inputDigest,before);
});
await test('repeated reconciliation preserves original aliases, timestamps and append-only audit',async t=>{
  const f=fixture(t);await f.apply();const before=f.plan().inputDigest;assert.equal((await f.apply(f.plan(),'second.sqlite')).recorded,0);assert.equal(f.plan().inputDigest,before);
  const db=f.open();t.after(()=>db.close());assert.throws(()=>db.exec('DELETE FROM _rock_migration_aliases'),/immutable/);assert.throws(()=>db.exec("UPDATE _rock_migration_aliases SET sql_sha256='bad'"),/immutable/);
});
await test('mid-transaction SQLite failure rolls back history/audit and restores exact logical state',async t=>{
  const f=fixture(t),p=f.plan(),original=Reflect.get(DatabaseSync.prototype,'prepare');
  // Test-only SQLite API failure injection after the first alias/audit insert.
  // No production hook or allowance for unknown metadata triggers is added.
  DatabaseSync.prototype.prepare=function(sql){
    const statement=original.call(this,sql);
    if(sql.startsWith('INSERT INTO _rock_migration_aliases('))return{run(...args){if(args[0]==='0031_rockstar_service_setup.sql')throw new Error('injected SQLite interruption');return statement.run(...args);}};
    return statement;
  };
  try{await assert.rejects(f.apply(p),/injected SQLite interruption/);}finally{DatabaseSync.prototype.prepare=original;}
  assert.equal(f.plan().inputDigest,p.inputDigest);
  const restored=new DatabaseSync(join(f.root,'backup.sqlite'));assert.equal(sqliteLogicalDigest(restored),p.inputDigest);restored.close();
  assert.equal((await f.apply(f.plan(),'retry.sqlite')).recorded,2);
});
await test('stale state and missing explicit digest fail before writing or replacing a backup',async t=>{
  const f=fixture(t),p=f.plan();const db=f.open();db.exec("UPDATE work_jobs SET revision=8 WHERE id='job'");db.close();await assert.rejects(f.apply(p),/Stale/);
  await assert.rejects(reconcileLocalMigrationAliases({...f,backupPath:join(f.root,'x.sqlite')}),/Stale/);
});
await test('unknown source bytes and partial schema never gain canonical history',t=>{
  const f=fixture(t);writeFileSync(join(f.sourceDirectory,'0064_sky_linux_service.sql'),'CREATE TABLE forged(id);');assert.throws(()=>f.plan(),/Unverified/);
  const g=fixture(t);const db=g.open();db.exec('DROP INDEX idx_sky_linux_receipt_workspace');db.close();assert.throws(()=>g.plan(),/schema is incomplete/);
});
await test('local backup must be separate and never overwritten; remote flags cannot be inferred',async t=>{
  const f=fixture(t);const p=f.plan();await assert.rejects(reconcileLocalMigrationAliases({...f,backupPath:f.databasePath,expectedPlanDigest:p.digest}),/separate/);
  writeFileSync(join(f.root,'backup.sqlite'),'keep');await assert.rejects(f.apply(p),/unused/);assert.equal(readFileSync(join(f.root,'backup.sqlite'),'utf8'),'keep');
  await assert.rejects(reconcileLocalMigrationAliases({...f,databasePath:'https://example.test/db',backupPath:join(f.root,'unused'),expectedPlanDigest:p.digest}),/absolute local/);
});
await test('concurrent writer lock refuses alias mutation without partial rows',async t=>{
  const f=fixture(t),p=f.plan(),lock=f.open();lock.exec('BEGIN IMMEDIATE');try{await assert.rejects(f.apply(p),/locked|busy/);}finally{lock.exec('ROLLBACK');lock.close();}assert.equal(f.plan().inputDigest,p.inputDigest);
});
await test('receipt/pending/stop/revocation/deletion data and Drizzle high watermark survive restart; old-client invalid kind and stale CAS refuse',async t=>{
  const f=fixture(t);const db=f.open();const before=db.prepare('SELECT * FROM sky_linux_service_documents').all();const jobs=db.prepare('SELECT * FROM work_jobs').all();const tombstones=db.prepare('SELECT * FROM eve_conversations').all();const watermark=db.prepare('SELECT * FROM __drizzle_migrations').all();db.close();await f.apply();const after=f.open();t.after(()=>after.close());
  assert.deepEqual(after.prepare('SELECT * FROM sky_linux_service_documents').all(),before);assert.deepEqual(after.prepare('SELECT * FROM work_jobs').all(),jobs);assert.deepEqual(after.prepare('SELECT * FROM eve_conversations').all(),tombstones);assert.deepEqual(after.prepare('SELECT * FROM __drizzle_migrations').all(),watermark);
  assert.throws(()=>after.prepare("INSERT INTO sky_linux_service_documents VALUES ('old','alice','unknown-client-kind',0,'{}',1)").run(),/CHECK constraint/);
  assert.equal(after.prepare("UPDATE work_jobs SET revision=9 WHERE id='job' AND user_id='alice' AND revision=6").run().changes,0);assert.deepEqual(after.prepare('SELECT * FROM work_jobs').all(),jobs);
});
await test('journal/path changes and forged audit fail closed; symlink backup is never followed', async t => {
  const f=fixture(t);const db=f.open();db.exec("CREATE TABLE _rock_migration_aliases(canonical_name TEXT,alias_name TEXT,sql_sha256 TEXT,source_manifest_sha256 TEXT); INSERT INTO _rock_migration_aliases VALUES('0030_sky_linux_service.sql','0064_sky_linux_service.sql','wrong','wrong');");db.close();assert.throws(()=>f.plan(),/audit conflicts/);
  const g=fixture(t);const file=join(g.sourceDirectory,'meta/_journal.json');const journal=JSON.parse(readFileSync(file,'utf8'));journal.entries[0].tag='../escape';writeFileSync(file,JSON.stringify(journal));assert.throws(()=>g.plan(),/order\/tag/);
  const h=fixture(t),p=h.plan();const {symlinkSync}=await import('node:fs');symlinkSync(join(h.root,'nonexistent-victim'),join(h.root,'backup.sqlite'));await assert.rejects(h.apply(p),/EEXIST/);const {existsSync}=await import('node:fs');assert.equal(existsSync(join(h.root,'nonexistent-victim')),false);
});
await test('planning rejects every unreviewed SQL/journal addition before any source execution or file effect',t=>{
  const probes=["VACUUM /* comment */ INTO 'FILE'", "ATTACH /* comment */ DATABASE 'FILE' AS escaped", "PRAGMA /* comment */ temp_store_directory='FILE'", "PRAGMA writable_schema=ON", "PRAGMA journal_mode=WAL", "SELECT load_extension('FILE')", "SELECT writefile('FILE','secret')", "CREATE TABLE arbitrary_write(id)", "DELETE FROM eve_conversations"];
  for(const probe of probes){
    const f=fixture(t),target=join(f.root,'unexpected.sqlite'),db=f.open(),before=sqliteLogicalDigest(db);
    const path=join(f.sourceDirectory,'meta/_journal.json'),j=JSON.parse(readFileSync(path,'utf8'));j.entries.push({idx:2,tag:'9999_extra_reference',when:999});writeFileSync(path,JSON.stringify(j));writeFileSync(join(f.sourceDirectory,'9999_extra_reference.sql'),probe.replaceAll('FILE',target));
    assert.throws(()=>planMigrationAliases(db,f),/Unverified complete/);assert.equal(sqliteLogicalDigest(db),before);db.close();
    // The probe has not been parsed or executed, even for valid SQLite syntax.
    assert.equal(existsSync(target),false);
  }
});
await test('planning snapshots do not inherit host user-defined functions or execute generated-column effects',t=>{
  const f=fixture(t),db=f.open();let called=0;
  db.function('write_probe',{deterministic:true},raw=>{called++;writeFileSync(join(f.root,'function-effect'),'unexpected');return String(raw);});
  db.exec("CREATE TABLE projected(raw TEXT,derived TEXT GENERATED ALWAYS AS (write_probe(raw)) VIRTUAL); INSERT INTO projected(raw) VALUES('x')");
  rmSync(join(f.root,'function-effect'));called=0;
  assert.throws(()=>planMigrationAliases(db,f),/function|schema|authoriz|unsafe/i);assert.equal(called,0);assert.throws(()=>readFileSync(join(f.root,'function-effect')),/ENOENT/);db.close();
});
await test('unknown metadata insert triggers cannot delete tombstones, rewrite stop payloads, ignore or rewrite history',async t=>{
  for(const body of ["AFTER INSERT ON d1_migrations BEGIN DELETE FROM eve_conversations; UPDATE work_jobs SET payload='{}'; END", "BEFORE INSERT ON d1_migrations BEGIN SELECT RAISE(IGNORE); END", "AFTER INSERT ON d1_migrations BEGIN UPDATE d1_migrations SET name='rewritten' WHERE id=NEW.id; END"]){
    const f=fixture(t),db=f.open();db.exec('CREATE TRIGGER unexpected_metadata '+body);const before=sqliteLogicalDigest(db);db.close();
    assert.throws(()=>f.plan(),/Unknown migration metadata/);await assert.rejects(f.apply({digest:'untrusted'}),/Unknown migration metadata/);const current=f.open();assert.equal(sqliteLogicalDigest(current),before);current.close();
  }
  const f=fixture(t);await f.apply();const db=f.open();db.exec("CREATE TRIGGER unexpected_audit AFTER INSERT ON _rock_migration_aliases BEGIN DELETE FROM eve_conversations; END");const before=sqliteLogicalDigest(db);db.close();assert.throws(()=>f.plan(),/Unknown migration metadata/);const after=f.open();assert.equal(sqliteLogicalDigest(after),before);after.close();
});
await test('write authorizer rejects domain writes and independent postconditions roll back even an injected policy failure',async t=>{
  for(const disablePolicy of [false,true]){
    const f=fixture(t),p=f.plan(),original=Reflect.get(DatabaseSync.prototype,'prepare');let injected=false;
    DatabaseSync.prototype.prepare=function(sql){const statement=original.call(this,sql),connection=this;
      if(sql.startsWith('INSERT INTO _rock_migration_aliases('))return{run(...args){const result=statement.run(...args);if(!injected){injected=true;if(disablePolicy)connection.setAuthorizer(null);connection.exec("DELETE FROM eve_conversations; UPDATE work_jobs SET payload='{}'");}return result;}};
      return statement;
    };
    try{await assert.rejects(f.apply(p),disablePolicy?/Protected domain/:/authoriz/i);}finally{DatabaseSync.prototype.prepare=original;}
    assert.equal(f.plan().inputDigest,p.inputDigest);
  }
});
await test('independent history delta validation rolls back a silent injected metadata rewrite',async t=>{
  const f=fixture(t),p=f.plan(),original=Reflect.get(DatabaseSync.prototype,'prepare');let injected=false;
  DatabaseSync.prototype.prepare=function(sql){const statement=original.call(this,sql),connection=this;
    if(sql.startsWith('INSERT INTO _rock_migration_aliases('))return{run(...args){const result=statement.run(...args);if(!injected){injected=true;connection.setAuthorizer(null);connection.exec("UPDATE d1_migrations SET applied_at='tampered' WHERE name='0064_sky_linux_service.sql'");}return result;}};
    return statement;
  };
  try{await assert.rejects(f.apply(p),/Old migration history/);}finally{DatabaseSync.prototype.prepare=original;}
  assert.equal(f.plan().inputDigest,p.inputDigest);
});
await test('replay validates missing schema, immutable guards, provenance and audit-history completeness without repairs',async t=>{
  for(const change of ['index','source','journal','guard','provenance','audit-link','history-link']){
    const f=fixture(t);await f.apply();const db=f.open();
    if(change==='index')db.exec('DROP INDEX idx_sky_linux_receipt_workspace');
    if(change==='source')writeFileSync(join(f.sourceDirectory,'0064_sky_linux_service.sql'),'-- modified\n'+readFileSync(join(f.sourceDirectory,'0064_sky_linux_service.sql'),'utf8'));
    if(change==='journal'){const p=join(f.sourceDirectory,'meta/_journal.json');writeFileSync(p,readFileSync(p,'utf8')+'\n');}
    if(change==='guard')db.exec('DROP TRIGGER _rock_alias_immutable_delete');
    if(change==='provenance'){const sql=db.prepare("SELECT sql FROM sqlite_schema WHERE name='_rock_alias_immutable_update'").get().sql;db.exec("DROP TRIGGER _rock_alias_immutable_update; UPDATE _rock_migration_aliases SET source_manifest_sha256='forged'");db.exec(sql);}
    if(change==='audit-link'){const sql=db.prepare("SELECT sql FROM sqlite_schema WHERE name='_rock_alias_immutable_delete'").get().sql;db.exec("DROP TRIGGER _rock_alias_immutable_delete; DELETE FROM _rock_migration_aliases WHERE canonical_name='0030_sky_linux_service.sql'");db.exec(sql);}
    if(change==='history-link')db.exec("DELETE FROM d1_migrations WHERE name='0030_sky_linux_service.sql'");
    const before=sqliteLogicalDigest(db);db.close();assert.throws(()=>f.plan(),/Unverified|incomplete|changed|audit|history|guards/i);await assert.rejects(f.apply({digest:'old'},'replay.sqlite'),/Unverified|incomplete|changed|audit|history|guards/i);const after=f.open();assert.equal(sqliteLogicalDigest(after),before);after.close();
  }
});
// Test-only fd/namespace races. Production code has no injection hook.
async function withFsMethod(name, wrap, action) {
  const fs=(await import('node:fs')).default;
  const {syncBuiltinESMExports}=await import('node:module');
  const original=Reflect.get(fs,name);fs[name]=wrap(original,fs);syncBuiltinESMExports();
  try{return await action(fs);}finally{fs[name]=original;syncBuiltinESMExports();}
}
function assertOriginalState(f,expected,path=f.databasePath){const db=new DatabaseSync(path);try{assert.equal(sqliteLogicalDigest(db),expected);}finally{db.close();}}
await test('exclusive no-follow backup creation rejects a symlink installed at the open syscall',async t=>{
  const f=fixture(t),p=f.plan(),fs=(await import('node:fs')).default,target=join(fs.realpathSync(f.root),'backup.sqlite'),victim=join(f.root,'sentinel');writeFileSync(victim,'keep');let raced=false;
  await withFsMethod('openSync',(original,api)=>(path,...args)=>{if(path===target&&typeof args[0]==='number'&&(args[0]&api.constants.O_CREAT)){raced=true;api.symlinkSync(victim,target);}return original(path,...args);},async()=>{await assert.rejects(f.apply(p),/EEXIST/);});
  assert.equal(raced,true);assert.equal(readFileSync(victim,'utf8'),'keep');assertOriginalState(f,p.inputDigest);
});
await test('backup replacement after fd creation or writing cannot redirect bytes into a sentinel',async t=>{
  for(const point of ['open','write']){
    const f=fixture(t),p=f.plan(),fs=(await import('node:fs')).default,target=join(fs.realpathSync(f.root),'backup.sqlite'),victim=join(f.root,'sentinel');writeFileSync(victim,'keep');let raced=false;
    const swap=api=>{api.unlinkSync(target);api.symlinkSync(victim,target);raced=true;};
    if(point==='open')await withFsMethod('openSync',(original,api)=>(path,...args)=>{const fd=original(path,...args);if(path===target&&typeof args[0]==='number'&&(args[0]&api.constants.O_CREAT))swap(api);return fd;},async()=>{await assert.rejects(f.apply(p),/identity|link|changed/i);});
    else await withFsMethod('writeSync',(original,api)=>(...args)=>{const n=original(...args);if(!raced)swap(api);return n;},async()=>{await assert.rejects(f.apply(p),/identity|link|changed/i);});
    assert.equal(raced,true);assert.equal(readFileSync(victim,'utf8'),'keep');assertOriginalState(f,p.inputDigest);
  }
});
await test('short writes and tampered descriptor readback never qualify as a verified backup',async t=>{
  const f=fixture(t),p=f.plan();await withFsMethod('writeSync',()=>()=>0,async()=>{await assert.rejects(f.apply(p),/Short backup/);});assertOriginalState(f,p.inputDigest);
  const g=fixture(t),q=g.plan();let corrupted=false;await withFsMethod('readSync',(original,api)=>(fd,buffer,offset,length,position)=>{const n=original(fd,buffer,offset,length,position);let isBackup=false;try{const held=api.fstatSync(fd,{bigint:true}),named=api.lstatSync(join(g.root,'backup.sqlite'),{bigint:true});isBackup=held.dev===named.dev&&held.ino===named.ino;}catch(error){if(error.code!=='ENOENT')throw error;}if(isBackup&&length>100&&n>0){buffer[offset]^=0xff;corrupted=true;}return n;},async()=>{await assert.rejects(g.apply(q),/Backup descriptor bytes|restore differs/);});assert.equal(corrupted,true);assertOriginalState(g,q.inputDigest);
});
await test('backup disappearance just before COMMIT is caught by the SQLite commit authorizer and rolls back',async t=>{
  const f=fixture(t),p=f.plan(),original=Reflect.get(DatabaseSync.prototype,'exec'),fs=(await import('node:fs')).default;let removed=false;
  DatabaseSync.prototype.exec=function(sql){if(sql==='COMMIT'&&!removed){removed=true;fs.unlinkSync(join(f.root,'backup.sqlite'));}return original.call(this,sql);};
  try{await assert.rejects(f.apply(p),/ENOENT|changed|authoriz/i);}finally{DatabaseSync.prototype.exec=original;}
  assert.equal(removed,true);assertOriginalState(f,p.inputDigest);
});
await test('source path replacement at descriptor acquisition or writer-lock acquisition refuses before domain mutation',async t=>{
  for(const point of ['open','lock']){
    const f=fixture(t),p=f.plan(),fs=(await import('node:fs')).default,source=join(fs.realpathSync(f.root),'copy.sqlite'),held=join(f.root,'held-original.sqlite'),victim=join(f.root,'sentinel');writeFileSync(victim,'keep');let raced=false;
    const swap=()=>{fs.renameSync(source,held);fs.symlinkSync(victim,source);raced=true;};
    if(point==='open')await withFsMethod('openSync',(original,api)=>(path,...args)=>{const fd=original(path,...args);if(path===source&&typeof args[0]==='number'&&(args[0]&api.constants.O_NOFOLLOW))swap();return fd;},async()=>{await assert.rejects(f.apply(p),/identity|link|changed/i);});
    else {const original=Reflect.get(DatabaseSync.prototype,'exec');DatabaseSync.prototype.exec=function(sql){const value=original.call(this,sql);if(sql==='BEGIN IMMEDIATE'&&!raced)swap();return value;};try{await assert.rejects(f.apply(p),/identity|link|changed/i);}finally{DatabaseSync.prototype.exec=original;}}
    assert.equal(raced,true);assert.equal(readFileSync(victim,'utf8'),'keep');assertOriginalState(f,p.inputDigest,held);
  }
});
await test('backup-parent replacement cannot publish or commit a fake backup',async t=>{
  const f=fixture(t),p=f.plan(),fs=(await import('node:fs')).default,parent=join(f.root,'private-backup'),moved=join(f.root,'displaced-backup'),victim=join(f.root,'sentinel');mkdirSync(parent,{mode:0o700});writeFileSync(victim,'keep');const target=join(fs.realpathSync(parent),'backup.sqlite');let raced=false;
  await withFsMethod('openSync',(original,api)=>(path,...args)=>{const fd=original(path,...args);if(path===target&&typeof args[0]==='number'&&(args[0]&api.constants.O_CREAT)){api.renameSync(parent,moved);api.mkdirSync(parent,{mode:0o700});api.symlinkSync(victim,target);raced=true;}return fd;},async()=>{await assert.rejects(reconcileLocalMigrationAliases({...f,backupPath:target,expectedPlanDigest:p.digest}),/ancestry|parent|identity|changed/i);});
  assert.equal(raced,true);assert.equal(readFileSync(victim,'utf8'),'keep');assertOriginalState(f,p.inputDigest);
});
await test('apply requires private owned parents, trusted ancestry and a single-link source; successful backup is durable snapshot bytes',async t=>{
  const fs=(await import('node:fs')).default,f=fixture(t),p=f.plan();fs.chmodSync(f.root,0o755);await assert.rejects(f.apply(p),/private0700/);assertOriginalState(f,p.inputDigest);fs.chmodSync(f.root,0o700);
  fs.linkSync(f.databasePath,join(f.root,'hardlink'));await assert.rejects(f.apply(p),/identity|link/i);assertOriginalState(f,p.inputDigest);fs.unlinkSync(join(f.root,'hardlink'));
  const untrusted=join(f.root,'untrusted'),child=join(untrusted,'private');mkdirSync(untrusted);fs.chmodSync(untrusted,0o777);mkdirSync(child,{mode:0o700});const copy=join(child,'copy.sqlite');fs.copyFileSync(f.databasePath,copy);await assert.rejects(reconcileLocalMigrationAliases({...f,databasePath:copy,backupPath:join(child,'backup.sqlite'),expectedPlanDigest:p.digest}),/ancestry/);assertOriginalState(f,p.inputDigest,copy);
  const result=await f.apply();assert.equal(result.backupVerified,true);const {createHash}=await import('node:crypto');const bytes=readFileSync(result.backupPath);assert.equal(createHash('sha256').update(bytes).digest('hex'),result.backupSha256);assert.equal(fs.statSync(result.backupPath).mode&0o777,0o600);
});

await test('offline source refuses recovery sidecars and WAL headers before SQLite can recover or create files',async t=>{
  const fs=(await import('node:fs')).default;
  for(const suffix of ['-journal','-wal','-shm']){const f=fixture(t),p=f.plan(),before=readFileSync(f.databasePath);writeFileSync(f.databasePath+suffix,'keep-sidecar');await assert.rejects(f.apply(p),/sidecars/);assert.deepEqual(readFileSync(f.databasePath),before);assert.equal(readFileSync(f.databasePath+suffix,'utf8'),'keep-sidecar');fs.unlinkSync(f.databasePath+suffix);assertOriginalState(f,p.inputDigest);}
  const f=fixture(t),p=f.plan(),bytes=readFileSync(f.databasePath);bytes[18]=2;bytes[19]=2;writeFileSync(f.databasePath,bytes);await assert.rejects(f.apply(p),/rollback-journal offline/);assert.deepEqual(readFileSync(f.databasePath),bytes);assert.equal(existsSync(f.databasePath+'-wal'),false);
});
