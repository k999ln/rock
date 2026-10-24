import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, openSync, closeSync, fstatSync, lstatSync, readSync, writeSync, fsyncSync, constants as F } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { DatabaseSync, constants as C } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const hash = v => createHash('sha256').update(v).digest('hex');
const quote = s => '"' + s.replaceAll('"', '""') + '"';
const json = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? String(x) : x);
const manifest = JSON.parse(readFileSync(new URL('../data/migration-aliases.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(readFileSync(new URL('../data/migration-reference-profiles.json', import.meta.url), 'utf8')).profiles;
const AUDIT = '_rock_migration_aliases';
const TABLE = `CREATE TABLE _rock_migration_aliases (
 canonical_name TEXT PRIMARY KEY, alias_name TEXT NOT NULL UNIQUE,
 sql_sha256 TEXT NOT NULL, source_manifest_sha256 TEXT NOT NULL)`;
const guards = Object.fromEntries(['update','delete'].map(op => [
  `_rock_alias_immutable_${op}`,
  `CREATE TRIGGER _rock_alias_immutable_${op} BEFORE ${op.toUpperCase()} ON _rock_migration_aliases BEGIN SELECT RAISE(ABORT,'immutable migration alias'); END`,
]));
// Only comparison normalization. No SQL is classified or executed by regex.
const norm = sql => (sql.match(/'(?:''|[^'])*'|`[^`]*`|"[^"]*"|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g) ?? [])
  .map(t => t.startsWith("'") ? t : t.replace(/^[`"]|[`"]$/g, '').toLowerCase()).join('');
const historyTables = [];
for (const type of ['TEXT','TIMESTAMP']) for (const nullable of ['', ' NOT NULL'])
  historyTables.push(norm(`CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at ${type} DEFAULT CURRENT_TIMESTAMP${nullable})`));
const pureFunctions = new Set(['current_timestamp','current_date','current_time','json_valid','json_extract','json_type','json_array_length','typeof','length','coalesce','ifnull','hex','lower','upper','abs','trim','round']);
function requireBoundary(db) {
  if (typeof db.setAuthorizer !== 'function' || typeof db.serialize !== 'function' || typeof db.deserialize !== 'function')
    throw new Error('Secure SQLite authorizer/serialize/deserialize APIs are required; no permissive fallback');
}
function readAuthorizer(action, a, b, name, context) {
  if (context || (name && name !== 'main')) return C.SQLITE_DENY;
  if ([C.SQLITE_READ,C.SQLITE_SELECT].includes(action)) return C.SQLITE_OK;
  if (action === C.SQLITE_PRAGMA && a === 'table_info') return C.SQLITE_OK;
  if (action === C.SQLITE_FUNCTION && pureFunctions.has(String(b).toLowerCase())) return C.SQLITE_OK;
  return C.SQLITE_DENY;
}
function withReadSnapshot(db, read) {
  requireBoundary(db);
  const mirror = new DatabaseSync(':memory:');
  try {
    requireBoundary(mirror);
    mirror.deserialize(db.serialize());
    mirror.enableDefensive(true);
    mirror.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON');
    mirror.setAuthorizer(readAuthorizer);
    return read(mirror);
  } finally { mirror.close(); }
}
function localFile(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) throw new Error('An explicit absolute local SQLite copy is required');
  return path;
}
function journal(directory) {
  const raw = readFileSync(resolve(directory, 'meta/_journal.json'));
  const entries = JSON.parse(raw).entries;
  if (!Array.isArray(entries) || new Set(entries.map(e => e.tag)).size !== entries.length) throw new Error('Invalid migration journal');
  let prior = -Infinity;
  const files = entries.map((e, idx) => {
    if (e.idx !== idx || !Number.isSafeInteger(e.when) || e.when <= prior || !/^\d{4}_[a-z0-9_]+$/.test(e.tag)) throw new Error('Invalid migration journal order/tag');
    prior = e.when;
    const name = e.tag + '.sql';
    return [name,hash(readFileSync(resolve(directory,name)))];
  });
  const profile = profiles.find(p => p.journalSha256 === hash(raw) && json(p.sqlFiles) === json(files));
  if (!profile) throw new Error('Unverified complete source/target journal and SQL manifest; no source SQL is executed');
  const { digest, ...body } = profile;
  if (hash(json(body)) !== digest) throw new Error('Invalid reviewed reference profile');
  return profile;
}
function metadata(db) {
  const objects = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name IN ('d1_migrations','_rock_migration_aliases') ORDER BY name").all();
  const d1 = objects.find(o => o.type === 'table' && o.name === 'd1_migrations');
  if (d1 && !historyTables.includes(norm(d1.sql))) throw new Error('Unsupported exact D1 metadata schema');
  const audit = objects.find(o => o.type === 'table' && o.name === AUDIT);
  for (const o of objects) {
    if (o === d1) continue;
    if (o === audit && norm(o.sql) === norm(TABLE)) continue;
    if (o.type === 'index' && o.sql === null && ['sqlite_autoindex_d1_migrations_1','sqlite_autoindex__rock_migration_aliases_1','sqlite_autoindex__rock_migration_aliases_2'].includes(o.name)) continue;
    if (audit && o.type === 'trigger' && guards[o.name] && norm(o.sql) === norm(guards[o.name])) continue;
    throw new Error('Unknown migration metadata object/audit conflicts: ' + o.name);
  }
  if (audit && (norm(audit.sql) !== norm(TABLE) || Object.keys(guards).some(n => !objects.some(o => o.name === n && norm(o.sql) === norm(guards[n])))))
    throw new Error('Incomplete migration alias audit schema/immutable guards');
  const history = d1 ? db.prepare('SELECT * FROM d1_migrations ORDER BY id').all() : [];
  if (new Set(history.map(h => h.name)).size !== history.length) throw new Error('Duplicate D1 history names');
  const rows = audit ? db.prepare(`SELECT * FROM ${AUDIT} ORDER BY canonical_name`).all() : [];
  return { history, rows, hasAudit: Boolean(audit) };
}
function digestRows(db, domainOnly = false) {
  const digest = createHash('sha256');
  for (const row of db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all().filter(r => !r.name.startsWith('sqlite_'))) {
    if (domainOnly && ['d1_migrations',AUDIT].includes(row.tbl_name)) continue;
    digest.update(json(row));
    if (row.type !== 'table') continue;
    const columns = db.prepare(`PRAGMA table_info(${quote(row.name)})`).all().map(c => c.name);
    for (const value of db.prepare(`SELECT * FROM ${quote(row.name)} ORDER BY ${columns.map(quote).join(',')}`).iterate()) digest.update(json(value));
  }
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name='sqlite_sequence'").get()) {
    for (const row of db.prepare("SELECT * FROM sqlite_sequence ORDER BY name").all())
      if (!domainOnly || row.name !== 'd1_migrations') digest.update(json(row));
  }
  return digest.digest('hex');
}
export function sqliteLogicalDigest(db) { return withReadSnapshot(db, view => digestRows(view)); }
function planSnapshot(db, { sourceDirectory, targetDirectory }) {
  const source = journal(sourceDirectory), target = journal(targetDirectory), state = metadata(db);
  const present = new Set(state.history.map(r => r.name)), byCanonical = new Map(state.rows.map(r => [r.canonical_name,r]));
  for (const row of state.rows) {
    const alias = manifest.aliases.find(a => a.canonical === row.canonical_name && a.source === row.alias_name && a.sha256 === row.sql_sha256);
    if (!alias || row.source_manifest_sha256 !== source.digest || !present.has(row.alias_name) || !present.has(row.canonical_name))
      throw new Error('Migration alias audit provenance/history conflicts with reviewed source');
  }
  const pending = [];
  for (const alias of manifest.aliases) {
    const from = present.has(alias.source), to = present.has(alias.canonical), audit = byCanonical.get(alias.canonical);
    if (!from && !to && !audit) continue;
    if (from && to && !audit) throw new Error('Canonical alias history lacks reviewed audit evidence');
    const sourceHash = source.sqlFiles.find(f => f[0] === alias.source)?.[1];
    const targetHash = target.sqlFiles.find(f => f[0] === alias.canonical)?.[1];
    if ((from && sourceHash !== alias.sha256) || targetHash !== alias.sha256) throw new Error('Unverified migration alias bytes: ' + alias.source);
    const expected = (from ? source.aliasObjects[alias.source] : target.aliasObjects[alias.canonical]);
    if (!expected?.length) throw new Error('Reviewed alias schema reference is absent');
    for (const object of expected) {
      const actual = db.prepare('SELECT type,sql FROM sqlite_schema WHERE name=?').get(object.name);
      if (!actual || actual.type !== object.type || actual.sql !== object.sql) throw new Error('Migration alias schema is incomplete or changed: ' + object.name);
    }
    if (from && !to) pending.push(alias);
  }
  const result = { schema:'rockstaros.local-migration-alias-plan/2',engine:manifest.engine,
    sourceJournalSha256:source.journalSha256,targetJournalSha256:target.journalSha256,
    sourceProfileSha256:source.digest,targetProfileSha256:target.digest,
    sourceSqlSha256:hash(json(source.sqlFiles)),targetSqlSha256:hash(json(target.sqlFiles)),
    inputDigest:digestRows(db),domainDigest:digestRows(db,true),aliases:pending,
    targetMigrationsStillPending:target.sqlFiles.map(f=>f[0]).filter(n=>!present.has(n)&&!pending.some(a=>a.canonical===n)),
    runtimePorted:false,completeUnionAccepted:false };
  return {...result,digest:hash(json(result))};
}
export function planMigrationAliases(db, options) { return withReadSnapshot(db, view => planSnapshot(view,options)); }
function writeAuthorizer(stage) {
  return (action,a,b,name,context) => {
    if ((name && name !== 'main') || context) return C.SQLITE_DENY;
    if ([C.SQLITE_READ,C.SQLITE_SELECT].includes(action)) return C.SQLITE_OK;
    // sqlite3_serialize issues a read-only page_count pragma internally.
    if (action === C.SQLITE_PRAGMA && a === 'page_count' && b === null) return C.SQLITE_OK;
    if (action === C.SQLITE_FUNCTION && String(b).toLowerCase() === 'current_timestamp') return C.SQLITE_OK;
    if (action === C.SQLITE_TRANSACTION) {
      if (String(a).toUpperCase() === 'COMMIT') stage.beforeCommit?.();
      return C.SQLITE_OK;
    }
    if (stage.value === 'setup') {
      if (action === C.SQLITE_CREATE_TABLE && a === AUDIT) return C.SQLITE_OK;
      if (action === C.SQLITE_CREATE_INDEX && ['sqlite_autoindex__rock_migration_aliases_1','sqlite_autoindex__rock_migration_aliases_2'].includes(a)) return C.SQLITE_OK;
      if (action === C.SQLITE_CREATE_TRIGGER && guards[a]) return C.SQLITE_OK;
      if ([C.SQLITE_INSERT,C.SQLITE_UPDATE].includes(action) && ['sqlite_master','sqlite_schema'].includes(a)) return C.SQLITE_OK;
    }
    if (stage.value === 'insert') {
      if (action === C.SQLITE_INSERT && ['d1_migrations',AUDIT,'sqlite_sequence'].includes(a)) return C.SQLITE_OK;
      if (action === C.SQLITE_UPDATE && a === 'sqlite_sequence') return C.SQLITE_OK;
    }
    return C.SQLITE_DENY;
  };
}
function verifyDelta(db, before, plan, options) {
  return withReadSnapshot(db, view => {
    if (digestRows(view,true) !== plan.domainDigest) throw new Error('Protected domain/schema/tombstone state changed; rollback');
    const after = metadata(view);
    if (after.history.length !== before.history.length + plan.aliases.length || json(after.history.slice(0,before.history.length)) !== json(before.history)) throw new Error('Old migration history changed; rollback');
    const names = after.history.slice(before.history.length).map(r=>r.name).sort();
    if (json(names) !== json(plan.aliases.map(a=>a.canonical).sort())) throw new Error('Unexpected migration history delta; rollback');
    if (after.rows.length !== before.rows.length + plan.aliases.length || before.rows.some(r=>!after.rows.some(a=>json(a)===json(r)))) throw new Error('Old alias audit changed; rollback');
    const replay = planSnapshot(view,options);
    if (replay.aliases.length) throw new Error('Incomplete alias/audit commit; rollback');
  });
}
// The caller must supply a single-operator offline copy in private POSIX
// directories. Same-UID/root processes are not an OS security boundary, but
// namespace changes are checked at acquisition, publication and COMMIT.
function privateLocation(path) {
  localFile(path);
  if (typeof process.getuid !== 'function' || typeof F.O_NOFOLLOW !== 'number' || typeof F.O_DIRECTORY !== 'number') throw new Error('Private POSIX no-follow file descriptors are required');
  const parent = realpathSync(dirname(path));
  const fd = openSync(parent, F.O_RDONLY | F.O_DIRECTORY | F.O_NOFOLLOW);
  try {
    const uid = BigInt(process.getuid()), stat = fstatSync(fd, {bigint:true}), ancestry = [];
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077n) !== 0n) throw new Error('Source and backup need owned private0700 parent directories');
    for (let name=parent;;name=dirname(name)) {
      const value=lstatSync(name,{bigint:true});
      const rootSticky=value.uid===0n && (value.mode&0o1000n)!==0n;
      if (!value.isDirectory() || (value.uid!==uid && value.uid!==0n) || ((value.mode&0o022n)!==0n && !rootSticky)) throw new Error('Untrusted writable directory ancestry');
      ancestry.push({name,dev:value.dev,ino:value.ino});
      if(dirname(name)===name)break;
    }
    return {path:join(parent,basename(path)),fd,parent,ancestry,uid,dev:stat.dev,ino:stat.ino};
  } catch(error) {closeSync(fd);throw error;}
}
function assertLocation(location) {
  const parent=fstatSync(location.fd,{bigint:true});
  if(parent.dev!==location.dev || parent.ino!==location.ino || parent.uid!==location.uid || (parent.mode&0o077n)!==0n)throw new Error('Private parent descriptor changed');
  for(const expected of location.ancestry){
    const stat=lstatSync(expected.name,{bigint:true});
    const rootSticky=stat.uid===0n && (stat.mode&0o1000n)!==0n;
    if(!stat.isDirectory() || stat.dev!==expected.dev || stat.ino!==expected.ino || (stat.uid!==location.uid&&stat.uid!==0n) || ((stat.mode&0o022n)!==0n&&!rootSticky))throw new Error('Directory ancestry changed');
  }
}
function assertFile(location,fd,identity,privateFile=false) {
  assertLocation(location);
  const held=fstatSync(fd,{bigint:true}), named=lstatSync(location.path,{bigint:true});
  if(!held.isFile() || !named.isFile() || held.dev!==identity.dev || held.ino!==identity.ino || named.dev!==held.dev || named.ino!==held.ino || held.nlink!==1n || held.uid!==location.uid || (held.mode&(privateFile?0o077n:0o022n))!==0n)throw new Error('File identity/link/ownership changed');
  return held;
}
function readDescriptor(fd,size) {
  const bytes=Buffer.alloc(size);
  for(let offset=0;offset<size;){const n=readSync(fd,bytes,offset,size-offset,offset);if(n<=0)throw new Error('Short descriptor read');offset+=n;}
  return bytes;
}
function requireOfflineSource(location,fd,size) {
  if(size<100n)throw new Error('An existing complete offline SQLite copy is required');
  const header=readDescriptor(fd,100);
  if(header.subarray(0,16).toString()!=='SQLite format 3\0' || header[18]!==1 || header[19]!==1)throw new Error('A complete rollback-journal offline SQLite copy is required');
  for(const suffix of ['-journal','-wal','-shm']){
    try{lstatSync(location.path+suffix);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    throw new Error('Offline copy must not have recovery/WAL sidecars');
  }
}
function snapshotDigest(bytes) {
  const restored=new DatabaseSync(':memory:');
  try {requireBoundary(restored);restored.deserialize(bytes);return sqliteLogicalDigest(restored);}finally{restored.close();}
}
export async function reconcileLocalMigrationAliases({ databasePath,sourceDirectory,targetDirectory,backupPath,expectedPlanDigest }) {
  const locations=[],fds=[];let db;
  try {
    const source=privateLocation(databasePath);locations.push(source);
    const destination=privateLocation(backupPath);locations.push(destination);
    if(source.path===destination.path)throw new Error('unused separate backup required');
    const sourceFd=openSync(source.path,F.O_RDONLY|F.O_NOFOLLOW);fds.push(sourceFd);
    const sourceId=fstatSync(sourceFd,{bigint:true});
    assertFile(source,sourceFd,sourceId);
    requireOfflineSource(source,sourceFd,sourceId.size);
    // Only a private, identity-anchored offline source is opened by SQLite.
    // No externally writable destination is ever passed to SQLite.
    db=new DatabaseSync(source.path);assertFile(source,sourceFd,sourceId);
    requireBoundary(db);
    const options={sourceDirectory,targetDirectory},plan=planMigrationAliases(db,options);
    if(!expectedPlanDigest||plan.digest!==expectedPlanDigest)throw new Error('Stale or missing explicit migration plan');
    const stage={value:'setup'};db.setAuthorizer(writeAuthorizer(stage));db.exec('BEGIN IMMEDIATE');
    try {
      assertFile(source,sourceFd,sourceId);assertLocation(destination);
      const current=planMigrationAliases(db,options);
      if(current.digest!==plan.digest)throw new Error('Database/source changed before locked snapshot; re-plan');
      const snapshot=Buffer.from(db.serialize()),snapshotHash=hash(snapshot);
      if(snapshotDigest(snapshot)!==plan.inputDigest)throw new Error('Locked snapshot differs from plan');
      let backupFd;
      try {backupFd=openSync(destination.path,F.O_RDWR|F.O_CREAT|F.O_EXCL|F.O_NOFOLLOW,0o600);}catch(error){if(error.code==='EEXIST')throw new Error('unused separate backup required (EEXIST)');throw error;}
      fds.push(backupFd);const backupId=fstatSync(backupFd,{bigint:true});
      assertFile(destination,backupFd,backupId,true);
      for(let offset=0;offset<snapshot.length;){const n=writeSync(backupFd,snapshot,offset,snapshot.length-offset,offset);if(n<=0)throw new Error('Short backup descriptor write');offset+=n;}
      fsyncSync(backupFd);fsyncSync(destination.fd);
      const backupGuard=()=>{
        assertFile(source,sourceFd,sourceId);
        const stat=assertFile(destination,backupFd,backupId,true);
        if(stat.size!==BigInt(snapshot.length)||hash(readDescriptor(backupFd,snapshot.length))!==snapshotHash)throw new Error('Backup descriptor bytes/size changed');
      };
      backupGuard();
      // Restore from the bytes read on the held fd, never reopen its pathname.
      if(snapshotDigest(readDescriptor(backupFd,snapshot.length))!==plan.inputDigest)throw new Error('Backup descriptor restore differs from plan');
      const before=withReadSnapshot(db,metadata);
      if(plan.aliases.length){
        if(!before.hasAudit){db.exec(TABLE);for(const sql of Object.values(guards))db.exec(sql);}
        stage.value='insert';
        for(const alias of plan.aliases){
          if(db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(alias.canonical).changes!==1)throw new Error('Alias history insert was rejected');
          if(db.prepare('INSERT INTO _rock_migration_aliases(canonical_name,alias_name,sql_sha256,source_manifest_sha256) VALUES (?,?,?,?)').run(alias.canonical,alias.source,alias.sha256,plan.sourceProfileSha256).changes!==1)throw new Error('Alias audit insert was rejected');
        }
      }
      stage.value='validate';verifyDelta(db,before,plan,options);backupGuard();
      // The authorizer checks fs-only guards again when SQLite prepares COMMIT.
      stage.beforeCommit=backupGuard;db.exec('COMMIT');
      return{recorded:plan.aliases.length,backupPath:destination.path,backupSha256:snapshotHash,backupVerified:true,protectedStateVerified:true,remainingMigrations:plan.targetMigrationsStillPending,completeUnionAccepted:false};
    }catch(error){stage.value='finish';db.exec('ROLLBACK');throw error;}finally{db.setAuthorizer(null);}
  }finally{db?.close();for(const fd of fds.reverse())closeSync(fd);for(const location of locations.reverse())closeSync(location.fd);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const args=process.argv.slice(2),v={};for(let i=0;i<args.length;i+=2){if(!['--database','--source','--target','--backup','--plan-digest'].includes(args[i])||!args[i+1]||v[args[i]])throw new Error('Only explicit unique local database/source/target/backup/plan-digest flags are supported');v[args[i]]=args[i+1];}
    const options={databasePath:localFile(v['--database']),sourceDirectory:v['--source'],targetDirectory:v['--target']};const db=new DatabaseSync(options.databasePath,{readOnly:true});let plan;try{plan=planMigrationAliases(db,options);}finally{db.close();}
    const result=v['--plan-digest']?await reconcileLocalMigrationAliases({...options,backupPath:v['--backup'],expectedPlanDigest:v['--plan-digest']}):plan;process.stdout.write(json(result)+'\n');
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
