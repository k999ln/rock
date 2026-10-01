"""Actual owned localhost HTTP + private SQLite; no OS or real provider claim."""
from contextlib import closing
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from mcp_broker import MCPHttpClient
from mcp_broker import fixture
from mcp_broker.fixture import FixtureServer, PUBLIC_TOKEN
from mcp_broker.http import VERSION, MAX_INPUT, MAX_BODY, INTENT_META, TransportError, canonical

AUTHORITY='9b24f5d2-d9c3-4a2c-97cc-05ec6c4c3e71'
CONSENT='a'*64
ROOT=Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as stream:
        stream.bind(('127.0.0.1',0));return stream.getsockname()[1]


class PersistentFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.path=self.root/'provider';self.port=free_port();self.owners=[]

    def tearDown(self):
        for owner in reversed(self.owners): owner.close()
        self.temp.cleanup()

    def open(self,path=None,**kwargs):
        options=dict(port=self.port,persistent=True,profile_binding=AUTHORITY);options.update(kwargs)
        owner=FixtureServer(path or self.path,**options);self.owners.append(owner);return owner

    def client(self,owner):
        return MCPHttpClient(owner.origin,[owner.policy],authorization='Bearer '+PUBLIC_TOKEN,allow_http_fixture=True)

    def effect(self,owner,key='intent-one',text='selected text',consent=CONSENT):
        return self.client(owner).execute('text.upper',text,business_key=key,consent_digest=consent)

    def status(self,owner,key='intent-one',consent=CONSENT):
        return self.client(owner).reconcile('text.upper',business_key=key,consent_digest=consent)

    def raw(self,owner,body=None,extra=None):
        if body is None:
            body=canonical({'jsonrpc':'2.0','id':'request-1','method':'server/discover','params':{'_meta':{
                'io.modelcontextprotocol/protocolVersion':VERSION,'io.modelcontextprotocol/clientCapabilities':{}}}})
        headers=[('Host','127.0.0.1'),('Authorization','Bearer '+PUBLIC_TOKEN),('Content-Type','application/json'),
                 ('MCP-Protocol-Version',VERSION),('Mcp-Method','server/discover'),('Content-Length',str(len(body)))]
        if extra is not None: headers=extra(headers)
        raw=b'POST /mcp HTTP/1.1\r\n'+b''.join(k.encode()+b': '+v.encode()+b'\r\n' for k,v in headers)+b'\r\n'+body
        with socket.create_connection(('127.0.0.1',owner.server.server_port),timeout=4) as stream:
            stream.sendall(raw)
            chunks=[]
            while True:
                try:part=stream.recv(65536)
                except ConnectionResetError:break
                if not part:break
                chunks.append(part)
        return int(b''.join(chunks).split(b' ',2)[1])

    def test_default_remains_fresh_only_and_persistent_requires_fixed_port(self):
        original=FixtureServer(self.path);self.owners.append(original);original.close()
        with self.assertRaises(FileExistsError): FixtureServer(self.path)
        with self.assertRaises(ValueError): FixtureServer(self.root/'no-port',persistent=True)
        with self.assertRaises(ValueError): self.open(self.root/'bad-binding',profile_binding='not-a-uuid')
        with self.assertRaises(ValueError): self.open(self.path)
        self.assertFalse((self.root/'no-port').exists())

    def test_fixed_origin_reopens_identical_immutable_receipt_and_status(self):
        first=self.open();receipt=self.effect(first)
        marker=(self.path/'PROFILE.json').read_bytes();origin=first.origin
        first.close();first.close()
        second=self.open()
        self.assertEqual(second.origin,origin);self.assertEqual(self.status(second),receipt)
        self.assertEqual(self.effect(second),receipt);self.assertEqual(second.count(),1)
        self.assertEqual((self.path/'PROFILE.json').read_bytes(),marker)
        with closing(second.store.connect()) as db:
            with self.assertRaises(sqlite3.IntegrityError): db.execute('DELETE FROM effects')
            with self.assertRaises(sqlite3.IntegrityError): db.execute("UPDATE fixture_mode SET profile='{}'")
            self.assertEqual([r[1] for r in db.execute('PRAGMA table_info(effects)')],['key','consent_digest','input_sha','receipt'])

    def test_lost_ack_restart_reconciles_without_another_effect_call(self):
        first=self.open();first.fault='drop_after_commit'
        with self.assertRaises(TransportError): self.effect(first)
        self.assertEqual(first.count(),1);first.close()
        second=self.open();receipt=self.status(second)
        self.assertEqual(receipt['state'],'succeeded');self.assertEqual(receipt['output'],{'text':'SELECTED TEXT'})
        self.assertEqual(second.count(),1)
        self.assertEqual([r.get('tool') for r in second.wire],['effect.status'])

    def test_wrong_intent_and_changed_input_never_replace_saved_receipt(self):
        owner=self.open();old=self.effect(owner)
        for call in (lambda:self.effect(owner,text='changed'),lambda:self.effect(owner,consent='b'*64),
                     lambda:self.status(owner,consent='b'*64),lambda:self.status(owner,consent='x'*64)):
            with self.assertRaises((TransportError,ValueError)):call()
        self.assertEqual(self.status(owner),old);self.assertEqual(owner.count(),1)
        self.assertEqual(self.status(owner,key='absent')['state'],'not_found')

    def test_duplicate_owner_flock_in_another_process(self):
        owner=self.open();self.effect(owner)
        code="""import sys
from mcp_broker.fixture import FixtureServer
try: FixtureServer(sys.argv[1],port=int(sys.argv[2]),persistent=True,profile_binding=sys.argv[3])
except BlockingIOError: print('LOCKED')
else: raise SystemExit(3)
"""
        result=subprocess.run([sys.executable,'-B','-c',code,str(self.path),str(self.port),AUTHORITY],
            cwd=ROOT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(ROOT/'src')+':'+str(ROOT/'os')},
            capture_output=True,text=True,timeout=8)
        self.assertEqual((result.returncode,result.stdout.strip(),result.stderr),(0,'LOCKED',''))
        self.assertEqual(owner.count(),1)

    def test_owned_subprocess_exit_releases_fixed_origin_and_receipts(self):
        code="""import sys
from mcp_broker.fixture import FixtureServer
from mcp_broker.http import MCPHttpClient
from mcp_broker.fixture import PUBLIC_TOKEN
p=FixtureServer(sys.argv[1],port=int(sys.argv[2]),persistent=True,profile_binding=sys.argv[3])
try:
 c=MCPHttpClient(p.origin,[p.policy],authorization='Bearer '+PUBLIC_TOKEN,allow_http_fixture=True)
 c.execute('text.upper','selected text',business_key='intent-one',consent_digest='a'*64)
finally:p.close()
print('CLOSED')
"""
        result=subprocess.run([sys.executable,'-B','-W','error::ResourceWarning','-c',code,str(self.path),str(self.port),AUTHORITY],
            cwd=ROOT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(ROOT/'src')+':'+str(ROOT/'os')},
            capture_output=True,text=True,timeout=8)
        self.assertEqual((result.returncode,result.stdout.strip(),result.stderr),(0,'CLOSED',''))
        owner=self.open();self.assertEqual(self.status(owner)['state'],'succeeded');self.assertEqual(owner.count(),1)

    def test_occupied_port_does_not_mutate_existing_receipts_or_initialize_new_db(self):
        first=self.open();self.effect(first);first.close()
        old=hashlib.sha256((self.path/'effects.sqlite3').read_bytes()).hexdigest()
        with socket.socket() as occupied:
            occupied.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            occupied.bind(('127.0.0.1',self.port));occupied.listen(1)
            with self.assertRaises(OSError): self.open()
            with self.assertRaises(OSError): self.open(self.root/'new')
        self.assertEqual(hashlib.sha256((self.path/'effects.sqlite3').read_bytes()).hexdigest(),old)
        self.assertFalse((self.root/'new/effects.sqlite3').exists())
        self.assertEqual(self.open().count(),1)

    def test_missing_db_marker_or_lock_does_not_reinitialize(self):
        for index,missing in enumerate(('effects.sqlite3','PROFILE.json','fixture.lock')):
            with self.subTest(missing=missing):
                path=self.root/str(index);owner=self.open(path);self.effect(owner);owner.close()
                (path/missing).unlink();before={p.name:p.read_bytes() for p in path.iterdir()}
                with self.assertRaises(ValueError): self.open(path)
                self.assertEqual({p.name:p.read_bytes() for p in path.iterdir()},before)

    def test_changed_authority_port_or_marker_refuses_without_repair(self):
        owner=self.open();self.effect(owner);owner.close()
        before={p.name:p.read_bytes() for p in self.path.iterdir()}
        for kwargs in ({'port':free_port()},{'profile_binding':'60d61cc6-b96b-456e-9a2d-14fc87eeb19c'}):
            with self.assertRaises(ValueError):self.open(**kwargs)
            self.assertEqual({p.name:p.read_bytes() for p in self.path.iterdir()},before)
        marker=self.path/'PROFILE.json';value=json.loads(marker.read_text());value['token_sha256']='0'*64
        marker.write_bytes(canonical(value));changed=marker.read_bytes()
        with self.assertRaises(ValueError):self.open()
        self.assertEqual(marker.read_bytes(),changed)

    def test_corrupt_schema_missing_mode_and_legacy_db_fail_closed(self):
        faults=("DROP TABLE fixture_mode","DROP TRIGGER mode_no_delete; DELETE FROM fixture_mode",
                "DROP TRIGGER effect_no_update","CREATE TABLE extra(secret TEXT)",
                "DROP TRIGGER effect_no_update; CREATE TRIGGER effect_no_update BEFORE UPDATE ON effects BEGIN SELECT 1; END")
        for index,fault in enumerate(faults):
            with self.subTest(fault=fault):
                path=self.root/str(index);owner=self.open(path);self.effect(owner);owner.close()
                with closing(sqlite3.connect(path/'effects.sqlite3')) as db:db.executescript(fault);db.commit()
                before=(path/'effects.sqlite3').read_bytes()
                with self.assertRaises((ValueError,sqlite3.Error)): self.open(path)
                self.assertEqual((path/'effects.sqlite3').read_bytes(),before)

    def test_non_sqlite_file_refuses_without_repair_and_releases_attempt_lock(self):
        owner=self.open();owner.close();path=self.path/'effects.sqlite3'
        path.write_bytes(b'not a SQLite database' * 100)
        before=path.read_bytes()
        for _ in range(2):
            with self.assertRaises(sqlite3.DatabaseError):self.open()
            self.assertEqual(path.read_bytes(),before)

    def test_unsafe_files_refuse_before_any_database_write(self):
        for index,kind in enumerate(('symlink','hardlink','permissions','sidecar')):
            with self.subTest(kind=kind):
                path=self.root/str(index);owner=self.open(path);owner.close();db=path/'effects.sqlite3'
                if kind=='symlink':
                    external=self.root/(str(index)+'-external');db.rename(external);db.symlink_to(external)
                elif kind=='hardlink':os.link(db,self.root/(str(index)+'-external'))
                elif kind=='permissions':db.chmod(0o644)
                else:(path/'effects.sqlite3-wal').symlink_to(self.root/'absent')
                with self.assertRaises(ValueError):self.open(path)

    def test_receipt_count_and_bytes_caps_preserve_recovery_and_replay(self):
        for index,changes in enumerate(({'MAX_EFFECTS':1},{'MAX_STORED_BYTES':700})):
            with patch.multiple(fixture,**changes):
                owner=self.open(self.root/str(index));receipt=self.effect(owner,text='x'*100)
                with self.assertRaises(TransportError):self.effect(owner,key='two',text='y'*100)
                self.assertEqual(self.effect(owner,text='x'*100),receipt);owner.close()
                owner=self.open(self.root/str(index));self.assertEqual(self.status(owner),receipt);self.assertEqual(owner.count(),1)
                owner.close()

    def test_concurrent_cap_is_atomic_and_status_survives(self):
        with patch.object(fixture,'MAX_EFFECTS',1):
            owner=self.open();ready=threading.Barrier(3);results=[]
            def call(key):
                ready.wait()
                try:results.append((key,self.effect(owner,key=key)['state']))
                except TransportError:results.append((key,'rejected'))
            threads=[threading.Thread(target=call,args=(key,)) for key in ('first','second')]
            for thread in threads:thread.start()
            ready.wait()
            for thread in threads:thread.join(4);self.assertFalse(thread.is_alive())
            self.assertEqual(sorted(state for _,state in results),['rejected','succeeded'])
            winner=next(key for key,state in results if state=='succeeded')
            self.assertEqual(owner.count(),1);self.assertEqual(self.status(owner,key=winner)['state'],'succeeded')

    def test_corrupt_saved_receipt_or_live_missing_marker_does_not_publish_result(self):
        owner=self.open();self.effect(owner)
        marker=self.path/'PROFILE.json';marker.unlink()
        with self.assertRaises(TransportError):self.status(owner)
        with self.assertRaises(TransportError):self.effect(owner,key='two')
        self.assertEqual(owner.count(),1);owner.close()
        path=self.root/'receipt';owner=self.open(path);self.effect(owner);owner.close()
        with closing(sqlite3.connect(path/'effects.sqlite3')) as db:
            db.execute('DROP TRIGGER effect_no_update')
            db.execute("UPDATE effects SET receipt='{}'")
            db.execute(fixture.SCHEMA['effect_no_update']);db.commit()
        before=(path/'effects.sqlite3').read_bytes()
        with self.assertRaises(ValueError):self.open(path)
        self.assertEqual((path/'effects.sqlite3').read_bytes(),before)

    def test_input_wire_auth_and_origin_rejections_have_zero_effects(self):
        owner=self.open()
        for edit,status in ((lambda h:[(k,v) for k,v in h if k!='Authorization'],401),
             (lambda h:h+[('Authorization','Bearer '+PUBLIC_TOKEN)],401),
             (lambda h:h+[('Origin','https://untrusted.invalid')],403),
             (lambda h:h+[('Origin','null'),('Origin','null')],403),
             (lambda h:h+[('Content-Length','1')],400),
             (lambda h:h+[('Transfer-Encoding','chunked')],400),
             (lambda h:[(k,'text/plain' if k=='Content-Type' else v) for k,v in h],400),
             (lambda h:[(k,str(MAX_BODY+1) if k=='Content-Length' else v) for k,v in h],400)):
            self.assertEqual(self.raw(owner,extra=edit),status)
        self.assertEqual(self.raw(owner,body=b'{"jsonrpc":"2.0","jsonrpc":"2.0"}'),400)
        for value in ('x'*(MAX_INPUT+1),'ŉ'*30000):
            with self.assertRaises((TransportError,ValueError)):self.effect(owner,text=value)
        self.assertEqual(owner.count(),0)
        self.assertEqual(self.client(owner).discover()['protocol'],VERSION)

    def test_discovery_advertised_tools_have_fixed_authenticated_listing(self):
        owner=self.open();client=self.client(owner)
        self.assertTrue(client.discover()['tools_available'])
        result=client._rpc('tools/list',{})
        self.assertEqual([row['name'] for row in result['tools']],['effect.status','text.upper'])
        self.assertEqual(result['tools'][1]['inputSchema'],owner.policy.contract()['input_schema'])
        self.assertEqual(result['ttlMs'],0);self.assertEqual(result['cacheScope'],'private')
        self.assertNotIn('nextCursor',result);self.assertTrue(all('outputSchema' not in row for row in result['tools']))
        with self.assertRaises(TransportError):client._rpc('tools/list',{'cursor':'anything'})
        self.assertEqual(owner.count(),0)

    def test_close_waits_for_actual_accepted_worker_before_unlock(self):
        owner=self.open();entered=threading.Event();release=threading.Event();results=[]
        original=owner.store.effect
        def delayed(*args):
            entered.set();release.wait(2);return original(*args)
        with patch.object(owner.store,'effect',side_effect=delayed):
            caller=threading.Thread(target=lambda:results.append(self.effect(owner)));caller.start()
            self.assertTrue(entered.wait(1))
            closer=threading.Thread(target=owner.close);closer.start();time.sleep(.05)
            try:
                self.assertTrue(closer.is_alive())
                with self.assertRaises(BlockingIOError):self.open()
            finally:release.set();caller.join(3);closer.join(3)
        self.assertFalse(closer.is_alive());self.assertFalse(caller.is_alive());self.assertEqual(len(results),1)
        self.assertEqual(self.open().count(),1)

    def test_failed_listener_start_and_close_retry_retain_safe_ownership(self):
        with patch.object(threading.Thread,'start',side_effect=RuntimeError('thread fixture failure')):
            with self.assertRaises(RuntimeError):self.open()
        owner=self.open();self.effect(owner)
        with patch.object(owner.server,'server_close',side_effect=OSError('close fixture failure')):
            with self.assertRaises(OSError):owner.close()
            with self.assertRaises(BlockingIOError):self.open()
        owner.close();self.assertEqual(self.open().count(),1)

    def test_partial_http_session_has_bounded_shutdown(self):
        owner=self.open();stream=socket.create_connection(('127.0.0.1',self.port),timeout=4)
        try:
            stream.sendall(b'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n')
            time.sleep(.03);started=time.monotonic();owner.close()
            self.assertLess(time.monotonic()-started,4)
            self.assertFalse(owner.thread.is_alive());self.assertIsNone(owner.store.fd)
        finally:stream.close()
        self.assertEqual(self.open().count(),0)


if __name__=='__main__':unittest.main()
