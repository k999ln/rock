import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { rockstarPasswordStore } from '../lib/rockstar-password.ts';
const now = Date.now();
const secret = 'fixture correct horse battery 2026';
function request(cookie='', extra={}) { return new Request('https://avoado.si/api/os/access',{method:'POST',headers:{origin:'https://avoado.si',cookie,...extra}}); }
const signed = session => request(session.cookie.split(';')[0]);
function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const [root,site] of [['0078_rockstar_accounts.sql','0028_rockstar_accounts.sql'],['0079_rockstar_password_accounts.sql','0029_rockstar_password_accounts.sql']]){
    const file=existsSync(new URL('../drizzle/'+root,import.meta.url))?root:site;
    sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  }
  for(const name of ['jennifer_passkey_credentials','jennifer_passkey_sessions','rockstar_device_sessions'])sql.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY,user_id TEXT,revoked_at INTEGER);`);
  sql.exec('CREATE TABLE rockstar_device_authorizations(id TEXT PRIMARY KEY,user_id TEXT,status TEXT);CREATE TABLE retained_history(owner_id TEXT,body TEXT);');
  const prepare=(query,args=[])=>({bind(...a){return prepare(query,a);},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});
  const db={prepare,async batch(rows){sql.exec('BEGIN');try{const result=[];for(const row of rows)result.push(await row.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  return {sql,store:rockstarPasswordStore(db)};
}
const signup=(store,name='fixture_one')=>store.enroll(request(),{mode:'signup',handle:name,password:secret},null,now);
void test('password signup creates server owner, salted scrypt hash and host-only session without gateway',async t=>{
  const {sql,store}=fixture(t);const result=await signup(store);
  assert.match(result.cookie,/^__Host-rockstar_account_access=rock_account_/);assert.match(result.cookie,/HttpOnly; SameSite=Strict/);assert.match(result.cookie,/; Secure$/);
  const owner=await store.authenticate(signed(result),now);assert.match(owner,/^rockstar:[0-9a-f-]{36}$/);
  const row=sql.prepare('SELECT * FROM rockstar_account_passwords').get();assert.equal(row.handle,'fixture_one');assert.equal(row.verifier.length,64);assert.notEqual(row.verifier,secret);assert.equal(row.salt.length,43);
  assert.match(result.recoveryCode,/^rock_recovery_[A-Za-z0-9_-]{43}$/);assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM rockstar_accounts').get()).includes(result.recoveryCode));
  assert.equal((await store.status(owner)).handle,'fixture_one');
});
void test('existing gateway owner can add first login while retaining old owner, grant and history',async t=>{
  const {sql,store}=fixture(t);sql.prepare('INSERT INTO rockstar_device_sessions VALUES(?,?,NULL)').run('device','legacy-owner');sql.prepare('INSERT INTO retained_history VALUES(?,?)').run('legacy-owner','private fixture');
  const r=await store.enroll(request(),{mode:'add',handle:'legacy_one',password:secret},'legacy-owner',now);
  assert.equal(await store.authenticate(signed(r),now),'legacy-owner');assert.equal(sql.prepare('SELECT revoked_at FROM rockstar_device_sessions').get().revoked_at,null);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM retained_history').get().n,1);
  await assert.rejects(store.enroll(request(),{mode:'add',handle:'other_name',password:secret},'legacy-owner',now),/ACCOUNT_LOGIN_ALREADY_CONFIGURED/);
});
void test('password login preserves owner and rejects wrong password or silent owner switch',async t=>{
  const {store}=fixture(t);const first=await signup(store);const owner=await store.authenticate(signed(first),now);
  const login=await store.login(request(),{mode:'login',handle:'FIXTURE_ONE',password:secret},null,now+1);assert.equal(await store.authenticate(signed(login),now+1),owner);
  await assert.rejects(store.login(request(),{mode:'login',handle:'fixture_one',password:secret+'x'},null,now),/UNAUTHORIZED/);
  await assert.rejects(store.login(request(),{mode:'login',handle:'fixture_one',password:secret},'another-owner',now),/UNAUTHORIZED/);
  await assert.rejects(store.login(request(),{mode:'login',handle:'unknown_user',password:secret},null,now),/UNAUTHORIZED/);
});
void test('logout, expiry and invalid cookies cannot reuse password sessions',async t=>{
  const {store}=fixture(t);const r=await signup(store);await store.logout(signed(r),now+1);await assert.rejects(store.authenticate(signed(r),now+1),/UNAUTHORIZED/);
  const l=await store.login(request(),{handle:'fixture_one',password:secret},null,now+2);await assert.rejects(store.authenticate(signed(l),now+31*86400000),/UNAUTHORIZED/);await assert.rejects(store.authenticate(request('__Host-rockstar_account_access=bad'),now),/UNAUTHORIZED/);
});
void test('recovery invalidates old password, passkeys, sessions, device grants and pending enrollment; history remains',async t=>{
  const {sql,store}=fixture(t);const first=await signup(store);const owner=await store.authenticate(signed(first),now);
  for(const name of ['jennifer_passkey_credentials','jennifer_passkey_sessions','rockstar_device_sessions'])sql.prepare(`INSERT INTO ${name} VALUES(?,?,NULL)`).run(name,owner);
  sql.prepare('INSERT INTO rockstar_device_authorizations VALUES(?,?,?)').run('approved',owner,'approved');sql.prepare('INSERT INTO retained_history VALUES(?,?)').run(owner,'private fixture');
  const recovered=await store.enroll(request(),{mode:'recover',handle:'fixture_one',password:secret+' new',recoveryCode:first.recoveryCode,confirmRevoke:true},null,now+1);
  assert.equal(await store.authenticate(signed(recovered),now+1),owner);await assert.rejects(store.authenticate(signed(first),now+1),/UNAUTHORIZED/);await assert.rejects(store.login(request(),{handle:'fixture_one',password:secret},null,now+1),/UNAUTHORIZED/);
  for(const name of ['jennifer_passkey_credentials','jennifer_passkey_sessions','rockstar_device_sessions'])assert.equal(sql.prepare(`SELECT revoked_at FROM ${name}`).get().revoked_at,now+1);
  assert.equal(sql.prepare('SELECT status FROM rockstar_device_authorizations').get().status,'denied');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM retained_history').get().n,1);
  await assert.rejects(store.enroll(request(),{mode:'recover',handle:'fixture_one',password:secret+' other',recoveryCode:first.recoveryCode,confirmRevoke:true},null,now+2),/UNAUTHORIZED/);
});
void test('CSRF, client-selected owner, weak passwords and duplicate handles fail without owner transfer',async t=>{
  const {sql,store}=fixture(t);
  await assert.rejects(store.enroll(request('',{origin:'https://attacker.invalid'}),{mode:'signup',handle:'fixture_one',password:secret},null,now),/ORIGIN/);
  await assert.rejects(store.enroll(request(),{mode:'signup',handle:'fixture_one',password:secret,userId:'victim'},null,now),/PASSKEY_INVALID/);
  await assert.rejects(store.enroll(request(),{mode:'signup',handle:'fixture_one',password:'short'},null,now),/PASSWORD_INVALID/);
  await signup(store);await assert.rejects(signup(store),/ACCOUNT_NAME_UNAVAILABLE/);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM rockstar_accounts').get().n,1);
});
void test('account revision fencing invalidates old password after passkey-side recovery',async t=>{
  const {sql,store}=fixture(t);const r=await signup(store);sql.exec('UPDATE rockstar_accounts SET revision=revision+1');await assert.rejects(store.authenticate(signed(r),now),/UNAUTHORIZED/);await assert.rejects(store.login(request(),{handle:'fixture_one',password:secret},null,now),/UNAUTHORIZED/);
});
