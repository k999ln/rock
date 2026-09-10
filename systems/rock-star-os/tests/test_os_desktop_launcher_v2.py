"""Host launcher profile/ownership guards. No VM or QEMU is launched."""
import copy
import hashlib
import importlib.util
import json
import os
import plistlib
import socket
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'os/desktop'))
spec = importlib.util.spec_from_file_location('desktop_launcher_v2',ROOT/'os/desktop/launcher.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)


class LauncherV2(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()
        self.addCleanup(self.temp.cleanup)
        self.home=self.root/'lima';self.home.mkdir(mode=0o700)
        self.vm=self.home/'rock-native';self.vm.mkdir(mode=0o700)
        for name in ('lima.yaml','vz-identifier','ssh.config'):
            (self.vm/name).write_bytes(('fixed fixture '+name).encode());(self.vm/name).chmod(0o600)
        self.source=self.root/'guest-source';(self.source/'os/desktop').mkdir(parents=True)
        self.script=self.source/'os/desktop/guest.py';self.script.write_text("raise AssertionError('source check must not execute this fixture')\n")
        self.manifest=self.root/'launcher.json'
        self.device={'schema':'rock-desktop-device/6','name':'isolated-fixture','images':'/var/tmp/immutable-images',
            'sha256':{name:'a'*64 for name in ('Image','rootfs.ext4','stage0.cpio.gz')},
            'viewer':'browser','network':'none','boot':{'mode':'signed-stage0','profile':'local-development','factory_sha256':'b'*64}}
        self.value={'schema':'rock-desktop-launcher/2','lima_home':str(self.home),'vm_name':'rock-native',
            'vm_config_sha256':hashlib.sha256((self.vm/'lima.yaml').read_bytes()).hexdigest(),
            'vm_identity_sha256':hashlib.sha256((self.vm/'vz-identifier').read_bytes()).hexdigest(),
            'guest_source':str(self.source),'guest_script_sha256':hashlib.sha256(self.script.read_bytes()).hexdigest(),
            'host_state':str(self.root/'display'),'port':5909,'device':self.device}

    def load(self,value=None):
        self.manifest.write_text(json.dumps(self.value if value is None else value));self.manifest.chmod(0o600)
        with patch.object(launcher.sys,'platform','darwin'),patch.object(launcher.shutil,'which',return_value=sys.executable):
            return launcher.load(self.manifest)

    def record(self,config):
        state='/var/tmp/rock-star-desktop/'+config['device']['name']
        return {'running':True,'session':state+'/sessions/'+'d'*32,'config':config['device'],
            'viewer':'browser','network':'none','vnc_socket':state+'/vnc.sock',
            'websocket_socket':state+'/websocket.sock','qmp_socket':state+'/qmp.sock'}

    def instance(self,config):
        return {'name':config['vm_name'],'hostname':'lima-'+config['vm_name'],'dir':str(self.vm),
                'sshConfigFile':config['ssh_config'],'vmType':'vz','arch':'aarch64','status':'Running'}

    def test_explicit_profile_preserves_selected_vm_source_device_and_avoids_diskutil(self):
        with patch.object(launcher.subprocess,'check_output') as command:
            config=self.load()
        command.assert_not_called()
        self.assertEqual(config['ssh_config'],str(self.vm/'ssh.config'))
        self.assertEqual(config['device'],self.device)
        self.assertFalse(Path(config['host_state']).exists())

    def test_v1_keeps_external_volume_old_vm_and_source_contract(self):
        value={'schema':'rock-desktop-launcher/1','mount_path':str(self.root),'mount_uuid':'fixture-volume',
            'lima_home':str(self.home),'host_state':str(self.root/'legacy-display'),'port':5908,
            'device':{'name':'legacy-fixture','schema':'rock-desktop-device/1'}}
        with patch.object(launcher.Path,'is_mount',return_value=True),patch.object(launcher.subprocess,'check_output',return_value=plistlib.dumps({'VolumeUUID':'fixture-volume'})) as disk:
            config=self.load(value)
        self.assertEqual(launcher.vm_name(config),'rock');self.assertEqual(launcher.guest_source(config),'/mnt/rock-source')
        self.assertEqual(config['ssh_config'],str(self.home/'rock/ssh.config'));disk.assert_called_once()

    def test_unknown_fields_network_profile_and_partial_image_triple_are_refused(self):
        mutations=(lambda v:v.update(mount_path='/Volumes/old'),lambda v:v.update(port=True),
            lambda v:v.update(vm_name='rock-native;other'),lambda v:v.update(guest_source='/tmp/../other'),
            lambda v:v['device'].update(schema='rock-desktop-device/5'),
            lambda v:v['device'].update(network='closed-services'),lambda v:v['device'].update(services={}),
            lambda v:v['device']['sha256'].pop('stage0.cpio.gz'),lambda v:v['device']['boot'].update(profile='purchaser'))
        for mutate in mutations:
            value=copy.deepcopy(self.value);mutate(value)
            with self.subTest(value=value),self.assertRaises(ValueError):self.load(value)

    def test_changed_vm_identifier_or_configuration_never_selects_replacement(self):
        for name in ('vz-identifier','lima.yaml'):
            original=(self.vm/name).read_bytes();(self.vm/name).write_bytes(b'changed VM')
            with self.assertRaisesRegex(ValueError,'VM identity'):self.load()
            (self.vm/name).write_bytes(original)

    def test_unsafe_host_state_and_duplicate_manifest_fields_are_rejected(self):
        bad=copy.deepcopy(self.value);bad['host_state']=str(self.vm/'display')
        with self.assertRaises(ValueError):self.load(bad)
        target=self.root/'target';target.mkdir(mode=0o700)
        (self.root/'display').symlink_to(target,target_is_directory=True)
        with self.assertRaises(ValueError):self.load()
        (self.root/'display').unlink()
        self.load();self.manifest.write_text(self.manifest.read_text()[:-1]+',"port":5909}')
        with patch.object(launcher.sys,'platform','darwin'),self.assertRaisesRegex(ValueError,'duplicate'):
            launcher.load(self.manifest)

    def test_real_readonly_source_probe_does_not_execute_guest_and_wrong_hash_blocks_action(self):
        config=self.load();commands=[]
        def run(command,**kwargs):
            commands.append(command)
            index=command.index('-c')
            return subprocess.run([sys.executable,'-B',*command[index:]],check=True,capture_output=True,text=True,timeout=5,env=dict(os.environ,PYTHONOPTIMIZE='1'))
        with patch.object(launcher,'run',side_effect=run):launcher.check_guest_source(config)
        self.assertEqual(len(commands),1);self.assertIn('rock-native',commands[0])
        wrong=dict(config,guest_script_sha256='0'*64);commands.clear()
        with patch.object(launcher,'run',side_effect=run),self.assertRaisesRegex(ValueError,'起動用ファイル'):
            launcher.remote(wrong,'start',wrong['device'])
        self.assertEqual(len(commands),1)
        # The script hash alone must not accept a replaceable intermediate directory.
        intermediate=self.source/'os';intermediate.chmod(0o777);commands.clear()
        try:
            with patch.object(launcher,'run',side_effect=run),self.assertRaisesRegex(ValueError,'起動用ファイル'):
                launcher.remote(config,'start',config['device'])
            self.assertEqual(len(commands),1)
        finally:intermediate.chmod(0o755)

    def test_remote_command_uses_selected_source_and_existing_vm_without_fallback(self):
        config=self.load()
        with patch.object(launcher,'check_guest_source') as check,patch.object(launcher,'run',return_value=subprocess.CompletedProcess([],0,'{"running":false}','')) as run:
            launcher.remote(config,'status')
        check.assert_called_once_with(config)
        command=run.call_args.args[0]
        self.assertIn('rock-native',command);self.assertNotIn('rock',command)
        self.assertIn(str(self.script),command);self.assertNotIn('/mnt/rock-source',command)
        index=command.index('/usr/bin/env')
        self.assertEqual(command[index:index+4],['/usr/bin/env','PATH='+launcher.LINUX_TOOL_PATH,'python3','-B'])

    def test_host_state_binding_rejects_new_profile_before_vm_or_guest_contact(self):
        config=self.load();state=Path(config['host_state']);state.mkdir(mode=0o700)
        with launcher.launcher_lock(config,state):pass
        changed=dict(config,binding_sha256='f'*64)
        with patch.object(launcher,'run') as run,patch.object(launcher,'remote') as remote,self.assertRaisesRegex(ValueError,'different launcher'):
            launcher.launch(changed,False)
        run.assert_not_called();remote.assert_not_called()
        with launcher.launcher_lock(config,state):pass

    def test_unmarked_display_state_and_foreign_vm_metadata_are_refused(self):
        config=self.load();state=Path(config['host_state']);state.mkdir(mode=0o700)
        (state/'viewer.json').write_text('{}')
        with patch.object(launcher,'run') as run,self.assertRaisesRegex(ValueError,'no matching launcher'):
            launcher.launch(config,False)
        run.assert_not_called()
        instance=self.instance(config);instance['dir']='/different/vm'
        with self.assertRaisesRegex(ValueError,'metadata differs'):launcher.verify_instance(config,instance)

    def test_wrong_saved_image_or_socket_and_live_missing_session_are_refused(self):
        config=self.load();record=self.record(config)
        launcher.verify_device_record(config,record,started=True)
        for value in (dict(record,websocket_socket='/other/socket'),dict(record,config=dict(config['device'],name='other')),
                      {'running':True},{'running':False}):
            with self.subTest(record=value),self.assertRaises(ValueError):launcher.verify_device_record(config,value,started=True)

    def test_owned_browser_reopen_retains_session_and_never_returns_or_persists_secret(self):
        config=self.load();device=self.record(config);state=Path(config['host_state']);events=[]
        def run(command,**kwargs):
            if 'list' in command: output=json.dumps(self.instance(config))
            elif '-G' in command: output='hostname 127.0.0.1\n';self.assertEqual(command[-1],'lima-rock-native')
            else: output='owned fixture SSH command'
            return subprocess.CompletedProcess(command,0,output,'')
        def remote(config,action,payload=None):
            events.append(action)
            if action=='status':return {'running':False} if events.count('status')==1 else device
            if action=='start':self.assertEqual(payload,self.device);return device
            self.fail('unexpected guest action')
        child=MagicMock(pid=123);child.poll.return_value=None
        safe='http://127.0.0.1:8899/index.html';secret=safe+'#port=5909&password=PRIVATE8'
        with patch.object(launcher,'run',side_effect=run),patch.object(launcher,'remote',side_effect=remote), \
             patch.object(launcher,'tunnel_alive',side_effect=[False,True,True]),patch.object(launcher,'tunnel_listening',return_value=True),patch.object(launcher.socket,'socket'), \
             patch.object(launcher.subprocess,'Popen',return_value=child) as spawn,patch.object(launcher,'websocket_ready',return_value=True), \
             patch.object(launcher,'browser_display_url',return_value=(safe,secret)),patch.object(launcher.subprocess,'run'):
            first=launcher.launch(config);second=launcher.launch(config)
        self.assertEqual(first,second);self.assertEqual(first['session'],device['session'])
        self.assertNotIn('PRIVATE8',json.dumps(first));self.assertNotIn('PRIVATE8',''.join(path.read_text() for path in state.iterdir() if path.is_file()))
        self.assertEqual(spawn.call_count,1)
        command=spawn.call_args.args[0];self.assertEqual(command[-2],'lima-rock-native');self.assertIn(str(self.script),command[-1])
        self.assertTrue(command[-1].startswith('/usr/bin/env PATH='+launcher.LINUX_TOOL_PATH+' python3 -B '))
        child.terminate.assert_not_called();child.kill.assert_not_called()

    def test_late_display_readiness_is_rejected_before_tunnel_record_or_browser_open(self):
        config=self.load();device=self.record(config)
        responses=[subprocess.CompletedProcess([],0,json.dumps(self.instance(config)),''),subprocess.CompletedProcess([],0,'hostname 127.0.0.1\n','')]
        child=MagicMock(pid=123);child.poll.return_value=None
        with patch.object(launcher,'run',side_effect=responses),patch.object(launcher,'remote',side_effect=[{'running':False},device]), \
             patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket'), \
             patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'websocket_ready',return_value=True), \
             patch.object(launcher.time,'monotonic',side_effect=[0,16]),patch.object(launcher,'tunnel_listening',return_value=True),patch.object(launcher,'browser_display_url') as display:
            with self.assertRaisesRegex(ValueError,'表示接続に時間'):launcher.launch(config)
        self.assertFalse((Path(config['host_state'])/'tunnel.json').exists());display.assert_not_called();child.terminate.assert_called_once()

    def test_listener_owner_parser_requires_same_pid_fd_address_and_listen_state(self):
        config=self.load()
        valid='p123\nf5\nn127.0.0.1:5909\nTST=LISTEN\nTQR=0\nTQS=0\n'
        with patch.object(launcher,'run',return_value=subprocess.CompletedProcess([],0,valid,'')) as run:
            self.assertTrue(launcher.tunnel_listening(config,123))
        self.assertEqual(run.call_args.args[0],['/usr/sbin/lsof','-nP','-a','-p','123','-iTCP@127.0.0.1:5909','-sTCP:LISTEN','-FpnT'])
        self.assertEqual(run.call_args.kwargs,{'timeout':2})
        for bad in ('', valid.replace('p123','p124'),valid.replace(':5909',':5910'),
                    valid.replace('127.0.0.1','*'),valid.replace('LISTEN','ESTABLISHED'),
                    valid.replace('TST=LISTEN','f6\nTST=LISTEN'),valid+'p124\n',
                    valid+'n127.0.0.1:5909\n',valid.replace('f5\n',''),valid+'x'*8192):
            with self.subTest(bad=bad),patch.object(launcher,'run',return_value=subprocess.CompletedProcess([],0,bad,'')):
                self.assertFalse(launcher.tunnel_listening(config,123))
        for failure in (OSError('unavailable'),subprocess.CalledProcessError(1,['lsof']),subprocess.TimeoutExpired(['lsof'],2)):
            with self.subTest(failure=type(failure).__name__),patch.object(launcher,'run',side_effect=failure):
                self.assertFalse(launcher.tunnel_listening(config,123))
        with patch.object(launcher,'run') as run:
            self.assertFalse(launcher.tunnel_listening(config,True))
            self.assertFalse(launcher.tunnel_listening(config,-1))
            self.assertTrue(launcher.tunnel_listening({'schema':'rock-desktop-launcher/1'},123))
        run.assert_not_called()

    def test_saved_command_and_session_do_not_substitute_for_live_listener_ownership(self):
        config=self.load();device=self.record(config)
        command='/usr/bin/ssh -L 127.0.0.1:5909:'+device['websocket_socket']
        record={'pid':123,'session':device['session'],'port':5909,'ps_command':command}
        with patch.object(launcher,'run',return_value=subprocess.CompletedProcess([],0,command,'')),patch.object(launcher,'tunnel_listening',return_value=False):
            self.assertFalse(launcher.tunnel_alive(record,config,device))
        with patch.object(launcher,'run',return_value=subprocess.CompletedProcess([],0,command,'')),patch.object(launcher,'tunnel_listening',return_value=True):
            self.assertTrue(launcher.tunnel_alive(record,config,device))

    def test_listener_is_rechecked_before_credentials_and_only_new_child_is_cleaned(self):
        for new_child in (True,False):
            with self.subTest(new_child=new_child):
                config=self.load();config['host_state']=str(self.root/('new-check' if new_child else 'existing-check'))
                device=self.record(config);state=Path(config['host_state']);state.mkdir(mode=0o700)
                with launcher.launcher_lock(config,state):pass
                launcher.save_record(state/'tunnel.json',{'pid':123,'session':device['session'],'port':5909,'ps_command':'owned'})
                def run(command,**kwargs):
                    text=json.dumps(self.instance(config)) if 'list' in command else 'hostname 127.0.0.1\n' if '-G' in command else 'owned'
                    return subprocess.CompletedProcess(command,0,text,'')
                child=MagicMock(pid=123);child.poll.return_value=None
                with patch.object(launcher,'run',side_effect=run),patch.object(launcher,'remote',side_effect=[device,device]), \
                     patch.object(launcher,'tunnel_alive',return_value=not new_child),patch.object(launcher.socket,'socket'), \
                     patch.object(launcher.subprocess,'Popen',return_value=child) as spawn,patch.object(launcher,'websocket_ready',return_value=True), \
                     patch.object(launcher,'tunnel_listening',side_effect=[True,False] if new_child else [False]), \
                     patch.object(launcher,'browser_display_url') as display:
                    with self.assertRaisesRegex(ValueError,'所有'):launcher.launch(config)
                display.assert_not_called()
                if new_child:child.terminate.assert_called_once();child.wait.assert_called_once()
                else:spawn.assert_not_called();child.terminate.assert_not_called()

    def test_ready_foreign_listener_is_not_adopted_while_new_ssh_is_still_connecting(self):
        config=self.load();device=self.record(config)
        def run(command,**kwargs):
            text=json.dumps(self.instance(config)) if 'list' in command else 'hostname 127.0.0.1\n' if '-G' in command else 'owned SSH still waiting for banner'
            return subprocess.CompletedProcess(command,0,text,'')
        child=MagicMock(pid=123);child.poll.return_value=None
        with patch.object(launcher,'run',side_effect=run),patch.object(launcher,'remote',side_effect=[{'running':False},device]), \
             patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket'), \
             patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'websocket_ready',return_value=True), \
             patch.object(launcher,'tunnel_listening',return_value=False,create=True), \
             patch.object(launcher,'browser_display_url',return_value=('safe','safe')) as display,patch.object(launcher.subprocess,'run') as opened:
            with self.assertRaisesRegex(ValueError,'所有'):launcher.launch(config)
        self.assertFalse((Path(config['host_state'])/'tunnel.json').exists());display.assert_not_called();opened.assert_not_called()
        child.terminate.assert_called_once();child.wait.assert_called_once()

    def test_early_ready_endpoint_does_not_skip_new_child_exit_check(self):
        config=self.load();device=self.record(config)
        def run(command,**kwargs):
            text=json.dumps(self.instance(config)) if 'list' in command else 'hostname 127.0.0.1\n' if '-G' in command else 'stale command'
            return subprocess.CompletedProcess(command,0,text,'')
        child=MagicMock(pid=123);child.poll.return_value=1
        with patch.object(launcher,'run',side_effect=run),patch.object(launcher,'remote',side_effect=[{'running':False},device]), \
             patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket'), \
             patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'websocket_ready',return_value=True), \
             patch.object(launcher,'browser_display_url',return_value=('safe','safe')) as display,patch.object(launcher.subprocess,'run'):
            with self.assertRaisesRegex(ValueError,'表示接続を開始'):launcher.launch(config)
        self.assertFalse((Path(config['host_state'])/'tunnel.json').exists());display.assert_not_called()
        child.terminate.assert_not_called();child.kill.assert_not_called()

    def test_backup_requires_existing_binding_and_same_stopped_device_profile(self):
        config=self.load()
        with patch.object(launcher,'remote') as remote,self.assertRaises(OSError):launcher.backup_profile(config)
        remote.assert_not_called()
        state=Path(config['host_state']);state.mkdir(mode=0o700)
        with patch.object(launcher,'remote') as remote,self.assertRaisesRegex(ValueError,'existing saved binding'):launcher.backup_profile(config)
        remote.assert_not_called()
        with launcher.launcher_lock(config,state):pass
        changed=dict(config,binding_sha256='f'*64)
        with patch.object(launcher,'remote') as remote,self.assertRaisesRegex(ValueError,'different launcher'):launcher.backup_profile(changed)
        remote.assert_not_called()
        stopped=dict(self.record(config),running=False)
        for current in ({'running':False},self.record(config),dict(stopped,config=dict(self.device,images='/different/images'))):
            with self.subTest(current=current),patch.object(launcher,'remote',return_value=current) as remote,self.assertRaises(ValueError):
                launcher.backup_profile(config)
            self.assertEqual([call.args[1] for call in remote.call_args_list],['status'])
        saved={'status':'SAVED','schema':'rock-desktop-backup/2','source_device':self.device['name'],'config':self.device}
        with patch.object(launcher,'remote',side_effect=[stopped,saved]) as remote:
            self.assertEqual(launcher.backup_profile(config),saved)
        self.assertEqual([call.args[1] for call in remote.call_args_list],['status','backup'])
        with patch.object(launcher,'remote',side_effect=[stopped,dict(saved,source_device='other')]),self.assertRaisesRegex(ValueError,'saved backup differs'):
            launcher.backup_profile(config)

    def test_foreign_display_listener_prevents_start_even_when_profile_is_valid(self):
        config=self.load()
        responses=[subprocess.CompletedProcess([],0,json.dumps(self.instance(config)),''),subprocess.CompletedProcess([],0,'hostname 127.0.0.1\n','')]
        with patch.object(launcher,'run',side_effect=responses),patch.object(launcher,'remote',return_value={'running':False}) as remote, \
             patch.object(launcher.socket,'socket') as factory,patch.object(launcher.subprocess,'Popen') as spawn:
            factory.return_value.__enter__.return_value.bind.side_effect=OSError('foreign listener')
            with self.assertRaisesRegex(OSError,'foreign listener'):launcher.launch(config,False)
        self.assertEqual([call.args[1] for call in remote.call_args_list],['status']);spawn.assert_not_called()

    def test_closed_viewer_tcp_state_is_reusable_but_live_listener_is_refused(self):
        config=self.load(); state=Path(config['host_state']);state.mkdir(mode=0o700)
        # Close the accepted server side first: its address remains in TCP
        # TIME_WAIT despite no viewer process or listener being present.
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            listener.bind(('127.0.0.1',0));listener.listen(1)
            port=listener.getsockname()[1]
            with patch.object(launcher,'BROWSER_PORT',port,create=True):
                with self.assertRaises(OSError):launcher.browser_port_preflight(config,state)
            with socket.create_connection(('127.0.0.1',port),timeout=2) as client:
                accepted,_=listener.accept()
                accepted.close()
                self.assertEqual(client.recv(1),b'')
        with socket.socket() as plain:
            with self.assertRaises(OSError):plain.bind(('127.0.0.1',port))
        with patch.object(launcher,'BROWSER_PORT',port,create=True):
            launcher.browser_port_preflight(config,state)


if __name__=='__main__':unittest.main()
