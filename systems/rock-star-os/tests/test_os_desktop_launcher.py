"""Display ownership is established before optional service initialization."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

PATH=Path(__file__).resolve().parents[1]/'os/desktop/launcher.py'
spec=importlib.util.spec_from_file_location('rock_desktop_launcher',PATH)
launcher=importlib.util.module_from_spec(spec); spec.loader.exec_module(launcher)


class DisplayRecovery(unittest.TestCase):
    def test_services_failure_retains_open_recorded_owned_display(self):
        with tempfile.TemporaryDirectory() as temporary:
            state=Path(temporary)/'host'
            config={'host_state':str(state),'lima_home':'/unused/lima','limactl':'unused-limactl',
                    'ssh_config':'/unused/ssh.config','port':5908,
                    'device':{'name':'fixture','network':'development-services'}}
            device={'running':True,'session':'fixture-session','network':'development-services','vnc_socket':'/unused/vnc.sock'}
            events=[]
            def run(command,**kwargs):
                if 'list' in command: output='{"name":"rock","status":"Running"}\n'
                elif '-G' in command: output='hostname 127.0.0.1\n'
                else: output='owned test SSH command'
                return subprocess.CompletedProcess(command,0,stdout=output,stderr='')
            def remote(config,action,payload=None):
                events.append(action)
                if action=='status': return {'running':False}
                if action=='start': return device
                self.assertTrue((state/'tunnel.json').is_file())
                self.assertIn('open',events)
                raise subprocess.CalledProcessError(1,['isolated fixture services'])
            child=MagicMock(pid=123); child.poll.return_value=None
            with patch.object(launcher,'run',side_effect=run),patch.object(launcher,'remote',side_effect=remote), \
                 patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket') as socket_factory, \
                 patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'vnc_ready',return_value=True), \
                 patch.object(launcher.subprocess,'run',side_effect=lambda *a,**k:events.append('open')):
                result=launcher.launch(config)
            self.assertTrue(result['running'])
            self.assertEqual(result['services']['status'],'UNAVAILABLE')
            self.assertEqual(events,['status','start','open','services'])
            self.assertEqual(socket_factory.return_value.__enter__.return_value.setsockopt.call_count,2)
            self.assertTrue(all(call.args == (launcher.socket.SOL_SOCKET,launcher.socket.SO_REUSEADDR,1)
                                for call in socket_factory.return_value.__enter__.return_value.setsockopt.call_args_list))
            self.assertEqual(json.loads((state/'tunnel.json').read_text())['session'],device['session'])
            child.terminate.assert_not_called(); child.kill.assert_not_called()

    def test_foreign_display_listener_prevents_os_start_and_service_contact(self):
        with tempfile.TemporaryDirectory() as temporary:
            config={'host_state':temporary,'lima_home':'/unused','limactl':'unused','ssh_config':'/unused',
                    'port':5908,'device':{'name':'fixture','network':'development-services'}}
            responses=[subprocess.CompletedProcess([],0,stdout='{"name":"rock","status":"Running"}'),
                       subprocess.CompletedProcess([],0,stdout='hostname 127.0.0.1\n')]
            with patch.object(launcher,'run',side_effect=responses),patch.object(launcher,'remote',return_value={'running':False}) as remote, \
                 patch.object(launcher.socket,'socket') as socket_factory,patch.object(launcher.subprocess,'Popen') as spawn:
                socket_factory.return_value.__enter__.return_value.bind.side_effect=OSError('foreign listener')
                with self.assertRaisesRegex(OSError,'foreign listener'): launcher.launch(config,False)
            self.assertEqual([call.args[1] for call in remote.call_args_list],['status'])
            spawn.assert_not_called()

    def test_browser_open_error_never_reports_password_argv_or_kills_display(self):
        with tempfile.TemporaryDirectory() as temporary:
            state=Path(temporary)
            config={'host_state':temporary,'lima_home':'/unused','limactl':'unused','ssh_config':'/unused',
                    'port':5909,'device':{'name':'fixture','schema':'rock-desktop-device/3','viewer':'browser','network':'none'}}
            device={'running':True,'session':'fixture-session','network':'none','viewer':'browser',
                    'vnc_socket':'/unused/vnc.sock','websocket_socket':'/unused/websocket.sock'}
            responses=[subprocess.CompletedProcess([],0,stdout='{"name":"rock","status":"Running"}'),
                       subprocess.CompletedProcess([],0,stdout='hostname 127.0.0.1\n'),
                       subprocess.CompletedProcess([],0,stdout='owned SSH command')]
            safe='http://127.0.0.1:8899/index.html'; opened=safe+'#port=5909&password=TEST_-12'
            child=MagicMock(pid=123); child.poll.return_value=None
            with patch.object(launcher,'run',side_effect=responses),patch.object(launcher,'remote',side_effect=[{'running':False},device]), \
                 patch.object(launcher,'tunnel_alive',return_value=False),patch.object(launcher.socket,'socket'), \
                 patch.object(launcher.subprocess,'Popen',return_value=child),patch.object(launcher,'websocket_ready',return_value=True), \
                 patch.object(launcher,'browser_display_url',return_value=(safe,opened)), \
                 patch.object(launcher.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['open',opened])):
                with self.assertRaisesRegex(ValueError,'画面を開けません') as error:
                    launcher.launch(config)
            self.assertNotIn('TEST_-12',str(error.exception))
            self.assertNotIn('password', (state/'tunnel.json').read_text())
            child.terminate.assert_not_called(); child.kill.assert_not_called()


if __name__=='__main__': unittest.main()
