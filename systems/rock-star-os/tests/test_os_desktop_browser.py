"""Private browser display command/credential guards; no real device is started."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]/'os/desktop'
sys.path.insert(0,str(ROOT))
import guest
spec=importlib.util.spec_from_file_location('rock_browser_launcher',ROOT/'launcher.py')
launcher=importlib.util.module_from_spec(spec); spec.loader.exec_module(launcher)


class BrowserCredentialGuards(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        patched=patch.object(guest,'BASE',self.root/'devices'); patched.start(); self.addCleanup(patched.stop)
        self.state=guest.state_path('browser-fixture')
        guest.directory(self.state/'sessions')
        self.session=self.state/'sessions'/('a'*32); guest.directory(self.session)
        self.images=self.root/'images'; self.images.mkdir()
        for name in ('Image','rootfs.ext4'): (self.images/name).write_bytes(b'unit bytes, not an OS image')
        self.config={'schema':'rock-desktop-device/3','name':'browser-fixture','images':str(self.images),
                     'sha256':{name:guest.digest(self.images/name) for name in ('Image','rootfs.ext4')},
                     'network':'none','viewer':'browser'}
        self.record={'running':True,'session':str(self.session),'config':self.config}

    def read(self,session=None):
        with patch.object(guest.sys,'platform','linux'),patch.object(guest,'status',return_value=self.record), \
             patch.object(guest,'running',return_value=True):
            return guest.display_secret('browser-fixture',str(session or self.session))

    def test_versioned_browser_command_uses_only_private_sockets_and_secret_path(self):
        guest.validate_config(self.config)
        args=guest.command(self.config,self.state,self.session)
        value=args[args.index('-vnc')+1]
        self.assertEqual(value,'unix:'+str(self.state/'vnc.sock')+',websocket=unix:'+str(self.state/'websocket.sock')+',password-secret=rock-vnc')
        self.assertIn('secret,id=rock-vnc,file='+str(self.session/'vnc-password'),args)
        self.assertEqual(args[args.index('-nic')+1],'none')
        self.assertFalse(any('hostfwd=' in part for part in args))
        for config in (dict(self.config,schema='rock-desktop-device/2'),dict(self.config,viewer='arbitrary')):
            with self.assertRaises(ValueError): guest.validate_config(config)

    def test_session_secret_has_48_bit_alphabet_and_private_file_only(self):
        self.assertEqual(len(set(guest.PASSWORD_ALPHABET)),64)
        guest.create_display_secret(self.session)
        path=self.session/'vnc-password'
        self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
        password=self.read()['password']
        self.assertEqual(len(password),8)
        self.assertTrue(set(password)<=set(guest.PASSWORD_ALPHABET))
        self.assertNotIn(password,json.dumps(self.record))
        self.assertNotIn(password,json.dumps(guest.command(self.config,self.state,self.session)))
        with self.assertRaises(FileExistsError): guest.create_display_secret(self.session)

    def test_stale_session_and_stopped_device_cannot_fetch_secret(self):
        guest.create_display_secret(self.session)
        with self.assertRaisesRegex(ValueError,'expected running device'): self.read(self.state/'sessions'/('b'*32))
        self.record['running']=False
        with self.assertRaisesRegex(ValueError,'expected running device'): self.read()

    def test_unsafe_secret_permissions_links_and_format_are_rejected(self):
        guest.create_display_secret(self.session)
        path=self.session/'vnc-password'
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'unsafe'): self.read()
        path.chmod(0o600); os.link(path,self.session/'extra')
        with self.assertRaisesRegex(ValueError,'unsafe'): self.read()
        (self.session/'extra').unlink(); path.write_bytes(b'bad\nline')
        with self.assertRaisesRegex(ValueError,'invalid'): self.read()
        path.unlink(); path.symlink_to(self.images/'Image')
        with self.assertRaises(OSError): self.read()

    def test_browser_credentials_only_enter_fragment_once_and_not_report_url(self):
        viewer=SimpleNamespace(ensure_viewer=lambda state,session:'http://127.0.0.1:8899/index.html')
        fixture={'session':'fixture-session','password':'TEST_-12'}
        with patch.dict(sys.modules,{'browser_server':viewer}),patch.object(launcher,'remote',return_value=fixture) as remote:
            safe,opened=launcher.browser_display_url({},fixture,self.state,True)
            self.assertEqual(safe,'http://127.0.0.1:8899/index.html')
            self.assertEqual(opened,safe+'#port=5909&password=TEST_-12')
            self.assertEqual(remote.call_count,1)
            self.assertEqual(remote.call_args.args[1:3],('display-secret',{'session':'fixture-session'}))
            remote.reset_mock()
            self.assertEqual(launcher.browser_display_url({},fixture,self.state,False),(safe,safe))
            remote.assert_not_called()
        fixture['session']='different-session'
        with patch.dict(sys.modules,{'browser_server':viewer}),patch.object(launcher,'remote',return_value=fixture):
            with self.assertRaisesRegex(ValueError,'current session'):
                launcher.browser_display_url({}, {'session':'fixture-session'},self.state,True)

    def test_browser_open_uses_private_stdin_and_fixed_arguments(self):
        for viewer_port, display_port in ((8899,5909),(8900,5910),(1024,65535)):
            url=f'http://127.0.0.1:{viewer_port}/index.html#port={display_port}&password=TEST_-12'
            with self.subTest(viewer_port=viewer_port),patch.object(launcher.subprocess,'run') as run:
                launcher.open_browser_display(url)
            run.assert_called_once_with(['/usr/bin/osascript','-l','AppleScript','-'],
                                        input='open location "'+url+'"\n',text=True,check=True,timeout=10,
                                        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            self.assertNotIn('TEST_-12',json.dumps(run.call_args.args))
            self.assertNotIn('env',run.call_args.kwargs)
            self.assertNotIn('shell',run.call_args.kwargs)

    def test_browser_open_rejects_script_characters_and_non_generated_urls_before_spawn(self):
        safe='http://127.0.0.1:8899/index.html#port=5909&password=TEST_-12'
        invalid=(None,123,'',safe+'\n',safe+'\r',safe+'\0',safe+'"',safe+'\\',
                 safe.replace('TEST_-12','TEST_-1"'),safe.replace('TEST_-12','TEST_-1\n'),
                 safe+'\nopen location "https://example.test"',safe.replace('http:','https:'),
                 safe.replace('127.0.0.1','localhost'),safe.replace('127.0.0.1','example.test'),
                 safe.replace('/index.html','/other.html'),safe.replace('#port','?port'),
                 safe.replace('8899','1023'),safe.replace('5909','65536'),safe.replace('5909','8899'),
                 safe.replace('8899','08899'),safe.replace('TEST_-12','TEST_-123'),safe+'&extra=1')
        with patch.object(launcher.subprocess,'run') as run:
            for url in invalid:
                with self.subTest(index=invalid.index(url)),self.assertRaises(ValueError) as error:
                    launcher.open_browser_display(url)
                self.assertEqual(str(error.exception),'画面を開けませんでした。接続とOSデータは保持されています。')
            run.assert_not_called()

    def test_browser_open_process_failures_are_sanitized_without_fallback(self):
        url='http://127.0.0.1:8899/index.html#port=5909&password=TEST_-12'
        failures=(subprocess.CalledProcessError(1,['synthetic',url],output=url,stderr=url),
                  subprocess.TimeoutExpired(['synthetic',url],10,output=url,stderr=url),
                  OSError(1,url,url))
        for failure in failures:
            with self.subTest(kind=type(failure).__name__),patch.object(launcher.subprocess,'run',side_effect=failure) as run:
                with self.assertRaises(ValueError) as error: launcher.open_browser_display(url)
            self.assertEqual(str(error.exception),'画面を開けませんでした。接続とOSデータは保持されています。')
            self.assertIsNone(error.exception.__cause__)
            self.assertTrue(error.exception.__suppress_context__)
            self.assertEqual(run.call_count,1)

    def test_launch_browser_handoff_is_private_and_no_open_skips_credential_read(self):
        config={'host_state':str(self.root/'host'),'lima_home':'/unused','limactl':'unused','ssh_config':'/unused',
                'port':5909,'device':{'name':'fixture','schema':'rock-desktop-device/3','viewer':'browser','network':'none'}}
        device={'running':True,'session':'fixture-session','network':'none','viewer':'browser',
                'vnc_socket':'/unused/vnc.sock','websocket_socket':'/unused/websocket.sock'}
        viewer=SimpleNamespace(ensure_viewer=lambda state,session:'http://127.0.0.1:8899/index.html')
        for open_window in (True,False):
            with self.subTest(open_window=open_window):
                responses=[SimpleNamespace(stdout='{"name":"rock","status":"Running"}'),
                           SimpleNamespace(stdout='hostname 127.0.0.1\n'),SimpleNamespace(stdout='synthetic SSH')]
                child=MagicMock(pid=123);child.poll.return_value=None
                def remote(config,action,payload=None):
                    if action=='status':return {'running':False}
                    if action=='start':return device
                    self.assertEqual(action,'display-secret')
                    return {'session':device['session'],'password':'TEST_-12'}
                with patch.dict(sys.modules,{'browser_server':viewer}),patch.object(launcher,'run',side_effect=responses), \
                     patch.object(launcher,'remote',side_effect=remote) as guest_call, \
                     patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket'), \
                     patch.object(launcher.subprocess,'Popen',return_value=child), \
                     patch.object(launcher,'websocket_ready',return_value=True),patch.object(launcher.subprocess,'run') as opener:
                    result=launcher.launch(config,open_window)
                self.assertEqual(opener.call_count,int(open_window))
                self.assertEqual([call.args[1] for call in guest_call.call_args_list],
                                 ['status','start']+(['display-secret'] if open_window else []))
                if open_window:
                    self.assertEqual(opener.call_args.args[0],['/usr/bin/osascript','-l','AppleScript','-'])
                    self.assertIn('TEST_-12',opener.call_args.kwargs['input'])
                    self.assertNotIn('TEST_-12',json.dumps(opener.call_args.args))
                self.assertNotIn('TEST_-12',json.dumps(result))
                self.assertFalse(any('TEST_-12' in path.read_text() for path in Path(config['host_state']).iterdir() if path.is_file()))
                child.terminate.assert_not_called();child.kill.assert_not_called()

    def test_websocket_probe_checks_bounded_upgrade_response_and_challenge(self):
        import base64,hashlib
        key=base64.b64encode(b'\0'*16).decode()
        accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        good=('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
              'Sec-WebSocket-Protocol: binary\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n').encode()
        for response,expected in ((good,True),(good.replace(accept.encode(),b'wrong'),False),(b'x'*4096,False)):
            with patch.object(launcher.secrets,'token_bytes',return_value=b'\0'*16),patch.object(launcher.socket,'create_connection') as connect:
                stream=connect.return_value.__enter__.return_value; stream.recv.return_value=response
                self.assertEqual(launcher.websocket_ready(5909),expected)
                self.assertEqual(connect.call_args.args[0],('127.0.0.1',5909))
                self.assertLessEqual(stream.recv.call_count,1)


if __name__=='__main__': unittest.main()
