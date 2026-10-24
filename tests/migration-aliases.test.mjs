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
