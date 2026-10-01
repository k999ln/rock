"""A lost power receipt remains unresolved, preserving the exact retry key."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('rock_power_relay_service',ROOT/'os/platform/service.py')
service = importlib.util.module_from_spec(spec); spec.loader.exec_module(service)


class PowerRelay(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.platform = service.Platform(self.temp.name,ROOT/'examples/registry')
        self.request = {'v':1,'op':'device.poweroff','key':'unchanged-power-key'}

    def test_explicit_root_refusal_is_preserved_and_power_gets_bounded_window(self):
        refusal = {'ok':False,'code':'busy','error':'another action is already accepted'}
        with patch.object(service,'call',return_value=refusal) as relay:
            self.assertEqual(self.platform.dispatch(self.request),refusal)
        relay.assert_called_once_with(service.POWER_SOCKET,{'v':1,'op':'poweroff','key':'unchanged-power-key'},0,
                                      timeout=12,response_timeout=12,return_errors=True)

    def test_lost_or_invalid_response_is_not_a_confirmed_rejection(self):
        for error in (TimeoutError(),OSError('closed'),ValueError('incomplete JSON frame')):
            with self.subTest(error=type(error).__name__),patch.object(service,'call',side_effect=error):
                with self.assertRaises(service.ServiceUnavailable): self.platform.dispatch(self.request)

    def test_wrong_service_identity_is_still_denied(self):
        with patch.object(service,'call',side_effect=PermissionError('different peer')):
            with self.assertRaises(PermissionError): self.platform.dispatch(self.request)

    def test_handler_emits_unavailable_after_an_unresolved_power_relay(self):
        left,right = socket.socketpair()
        self.addCleanup(left.close); self.addCleanup(right.close)
        server = SimpleNamespace(allowed_uids={os.geteuid()},service=self.platform)
        with patch.object(service,'peer_uid',return_value=os.geteuid()),patch.object(service,'call',side_effect=TimeoutError()):
            right.sendall(service.canonical(self.request)+b'\n')
            service.Handler(left,None,server)
            response = service.read_frame(right,4096)
        self.assertEqual(response['code'],'unavailable')
        self.assertFalse(response['ok'])

    def test_small_explicit_response_deadline_bounds_slow_reply(self):
        path = str(Path(self.temp.name)/'slow.sock')
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as listener:
            listener.bind(path); listener.listen(1)
            def receive():
                connection,_ = listener.accept()
                with connection:
                    connection.recv(4096); time.sleep(.1)
            thread = threading.Thread(target=receive); thread.start()
            try:
                start = time.monotonic()
                with patch.object(service,'peer_uid',return_value=0),self.assertRaises(TimeoutError):
                    service.call(path,{'v':1,'op':'poweroff','key':'same'},0,timeout=.04,response_timeout=.04,return_errors=True)
                self.assertLess(time.monotonic()-start,.3)
            finally: thread.join(1)


if __name__ == '__main__': unittest.main()
