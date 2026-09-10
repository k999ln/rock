"""False-PASS guards use real fixture SQLite; no QEMU or hardware claim."""
import copy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import socket
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import test_operations_device as fixture
from operations import verify_native as verifier


class OperationsNativeVerifierTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.OperationsDeviceTests('test_eligible_unregistered_unpaid_device_can_activate_without_wallet_mutation')
        self.fixture.setUpClass();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
        self.fixture.wallet['available_minor']=0;self.fixture.tap()
        self.profile,self.observation=self.fixture.adapter._observation(self.fixture.wallet)
        self.binding=verifier.binding(self.fixture.config)
        self.data=self.fixture.root/'userdata.fake';self.data.write_bytes(b'explicit test-only image placeholder')
        self.proxy=self.fixture.root/'proxy.db'
        with closing(sqlite3.connect(self.proxy)) as db,db:
            db.executescript('CREATE TABLE requests(key TEXT); CREATE TABLE snapshot(payload TEXT);')
            db.execute('INSERT INTO snapshot VALUES(?)',(json.dumps(self.fixture.wallet),))
        self.paths={'/platform/activation/state.sqlite3':self.fixture.root/'activation/state.sqlite3',
            '/wallet/backend-cache/remote-cache.db':self.proxy,
            '/platform/purchaser-service-binding.json':self.fixture.binding_path}

    def closed(self):
        with patch.object(verifier,'cat',side_effect=lambda _image,name:self.paths[name].read_bytes()),\
             patch.object(verifier.subprocess,'run',return_value=SimpleNamespace(stdout=b'')):
            return verifier.closed_state(self.data,self.fixture.root,self.binding,self.profile)

    def test_real_activation_receipt_and_zero_wallet_operation_fixture_passes(self):
        result=self.closed();self.assertEqual(result['activation_count'],1)
        self.assertEqual(result['wallet_mutation_requests'],0);self.assertFalse(result['private_database_exported'])

    def test_backend_location_obeys_existing_standalone_service_path_contract(self):
        self.assertEqual(verifier.backend_path(Path('/var/tmp/rock-activation-native-2239')),
                         Path('/var/tmp/rock-star-closed-services/rock-activation-native-2239'))
        for path in ('relative','/var/tmp/arbitrary','/tmp/rock-activation-native-2239'):
            with self.subTest(path=path),self.assertRaises(ValueError):verifier.backend_path(Path(path))

    def test_early_blank_frame_is_retained_and_only_existing_full_threshold_is_accepted(self):
        clock=[0];count=[0];folder=self.fixture.root/'frames';folder.mkdir();entry={'screenshots':[]}
        def command(_name,args):
            count[0]+=1
            Path(args['filename']).write_bytes(b'\x89PNG\r\n\x1a\n'+b'\0\0\0\rIHDR'+struct.pack('>II',720,960)+b'x'*(32 if count[0]==1 else 4096))
        ui=SimpleNamespace(monitor=SimpleNamespace(command=command))
        verifier.capture_ready(ui,folder,entry,clock=lambda:clock[0],sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds))
        self.assertEqual([row['accepted'] for row in entry['startup_frames']],[False,True])
        self.assertTrue((folder/'00-startup-00.png').exists());self.assertEqual(len(entry['screenshots']),1)

    def test_blank_framebuffer_timeout_does_not_become_visual_success(self):
        clock=[0];folder=self.fixture.root/'frames';folder.mkdir();entry={'screenshots':[]}
        def command(_name,args):
            Path(args['filename']).write_bytes(b'\x89PNG\r\n\x1a\n'+b'\0\0\0\rIHDR'+struct.pack('>II',720,960)+b'x'*32)
        ui=SimpleNamespace(monitor=SimpleNamespace(command=command))
        with self.assertRaises(ValueError):
            verifier.capture_ready(ui,folder,entry,timeout=2,clock=lambda:clock[0],sleep=lambda seconds:clock.__setitem__(0,clock[0]+seconds))
        self.assertEqual(entry['screenshots'],[])

    def test_wrong_signed_profile_is_not_proved_by_any_active_row(self):
        self.profile['protected_binding_sha256']='a'*64
        with self.assertRaises(ValueError):self.closed()

    def test_wallet_mutation_or_other_scope_cache_cannot_pass_zero_effect_claim(self):
        with closing(sqlite3.connect(self.proxy)) as db,db:db.execute("INSERT INTO requests VALUES('forbidden-register')")
        with self.assertRaises(ValueError):self.closed()
        with closing(sqlite3.connect(self.proxy)) as db,db:
            db.execute('DELETE FROM requests');value=copy.deepcopy(self.fixture.wallet)
            value['service_access']['consumer_id']='bob';db.execute('UPDATE snapshot SET payload=?',(json.dumps(value),))
        with self.assertRaises(ValueError):self.closed()

    def test_changed_saved_receipt_actor_and_hardware_effect_are_rejected(self):
        original=verifier.rows
        for change in ('actor','effect'):
            def changed(path,query):
                result=original(path,query)
                if query=='SELECT key,actor,payload,response FROM receipts':
                    if change=='actor':result[0]['actor']='device:wrong'
                    else:
                        response=json.loads(result[0]['response']);response['hardware_action_performed']=True
                        result[0]['response']=json.dumps(response)
                return result
            with self.subTest(change=change),patch.object(verifier,'rows',side_effect=changed),self.assertRaises(ValueError):self.closed()

    def test_stage0_and_normal_guest_poweroff_are_required_separately(self):
        text='\n'.join(('ROCK_AB_SELECTED slot=A sequence=1 reason=committed','ROCK_AB_SWITCH_ROOT device=/dev/vda',
            'ROCK_AB_HEALTH_CONFIRMED','ROCK_ACTIVATION_BOOT_VERIFIED '+'a'*64,'stopped /usr/bin/rock-ui','Stopping crond:',
            'Stopping network:','EXT4-fs (vdb): unmounting filesystem','Sent SIGTERM to all processes','reboot: Power down'))
        events=[{'event':'SHUTDOWN','data':{'guest':True}}]
        self.assertEqual(verifier.validate_boot(text,events,0,1)['slot'],'A')
        cases=[(text.replace('ROCK_AB_HEALTH_CONFIRMED',''),events,0),
            (text.replace('sequence=1','sequence=2'),events,0),(text,[],0),
            (text,[{'event':'SHUTDOWN','data':{'guest':False}}],0),(text,events,-9),
            (text.replace('Sent SIGTERM to all processes',''),events,0),
            (text+'\nROCK_ACTIVATION_BOOT_UNAVAILABLE',events,0),
            (text+'\nROCK_ACTIVATION_BOOT_VERIFIED '+'b'*64,events,0)]
        for value,event,exit_code in cases:
            with self.subTest(value=value[-60:]),self.assertRaises(ValueError):verifier.validate_boot(value,event,exit_code,1)

    def test_qemu_termination_error_cannot_skip_independent_backend_cleanup(self):
        calls=[]
        process=SimpleNamespace(poll=lambda:None,terminate=lambda:(_ for _ in ()).throw(ProcessLookupError('fixture exited')),
                                wait=lambda **_:0)
        errors=verifier.cleanup_owners(None,process,lambda:calls.append('backend stopped'))
        self.assertEqual(calls,['backend stopped']);self.assertTrue(any('ProcessLookupError' in item for item in errors))

    def test_real_socket_queued_shutdown_after_peer_exit_is_read_before_close(self):
        local,peer=socket.socketpair()
        self.addCleanup(local.close);self.addCleanup(peer.close)
        monitor=verifier.EventMonitor.__new__(verifier.EventMonitor)
        monitor.connection=local;monitor.stream=local.makefile('rwb',buffering=0)
        self.addCleanup(monitor.stream.close);monitor.events=[]
        event={'event':'SHUTDOWN','data':{'guest':True},'timestamp':{'seconds':42,'microseconds':7}}
        peer.sendall((json.dumps(event)+'\n').encode());peer.close()
        # This is the exact race: the peer has already exited while its final
        # event remains unread. No command/request or event synthesis is used.
        self.assertEqual(monitor.drain_exited(),{'eof':True,'queued_frames':1})
        self.assertEqual(monitor.events,[event])

    def test_empty_eof_and_malformed_final_socket_frame_do_not_invent_shutdown(self):
        for raw in (b'',b'{"event":"SHUTDOWN"'):
            local,peer=socket.socketpair()
            try:
                monitor=verifier.EventMonitor.__new__(verifier.EventMonitor)
                monitor.connection=local;monitor.stream=local.makefile('rwb',buffering=0);monitor.events=[]
                if raw:peer.sendall(raw)
                peer.close()
                if raw:
                    with self.assertRaises(ValueError):monitor.drain_exited()
                else:self.assertEqual(monitor.drain_exited(),{'eof':True,'queued_frames':0})
                self.assertEqual(monitor.events,[])
            finally:
                monitor.stream.close();local.close();peer.close()

    def test_native_before_tap_after_and_restart_capture_roles_cannot_be_omitted(self):
        before={'action':'capture','name':'01-before-activation'}
        tap={'action':'click','role':'activation','x':360,'y':740}
        after={'action':'capture','name':'02-after-activation'}
        entry={'phase':1,'timeline':[before,tap,after]}
        self.assertEqual(verifier.validate_roles(entry)['recorded_activation_clicks'],1)
        for timeline in ([tap,after],[before,after],[tap,before,after],[before,tap,tap,after]):
            with self.subTest(timeline=timeline),self.assertRaises(ValueError):verifier.validate_roles({'phase':1,'timeline':timeline})
        self.assertEqual(verifier.validate_roles({'phase':2,'timeline':[{'action':'capture','name':'03-retained-activation'}]})['recorded_activation_clicks'],0)
        with self.assertRaises(ValueError):verifier.validate_roles({'phase':2,'timeline':[tap,{'action':'capture','name':'03-retained-activation'}]})


if __name__=='__main__':unittest.main()
