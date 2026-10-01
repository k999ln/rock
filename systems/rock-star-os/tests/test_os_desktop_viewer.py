"""Owned ephemeral HTTP listeners only; production display ports are untouched."""
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock

PATH=Path(__file__).resolve().parents[1]/'os/desktop/browser_server.py'
spec=importlib.util.spec_from_file_location('rock_desktop_static_viewer',PATH)
viewer=importlib.util.module_from_spec(spec); spec.loader.exec_module(viewer)


class StaticViewerBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'public'; self.root.mkdir()
        (self.root/'index.html').write_text('<p>test framebuffer viewer</p>')
        (self.root/'viewer.js').write_text('/* static fixture */')
        (self.root/'novnc/app').mkdir(parents=True)
        (self.root/'novnc/app/ui.js').write_text('MUST NOT BE SERVED')
        (self.root/'novnc/core').mkdir(parents=True)
        (self.root/'novnc/core/rfb.js').write_text('/* reviewed runtime fixture */')
        (self.root/'private.txt').write_text('MUST NOT BE SERVED')
        (self.root.parent/'outside.js').write_text('MUST NOT BE SERVED')
        (self.root/'escape.js').symlink_to(self.root.parent/'outside.js')
        (self.root/'linked').symlink_to(self.root.parent,target_is_directory=True)
        self.root_patch=patch.object(viewer,'ROOT',self.root); self.root_patch.start(); self.addCleanup(self.root_patch.stop)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),viewer.Handler)
        self.server.instance='test-owned-instance'; self.server.build='test-build'
        self.port=self.server.server_port
        self.port_patch=patch.object(viewer,'PORT',self.port); self.port_patch.start(); self.addCleanup(self.port_patch.stop)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.02},daemon=True)
        self.thread.start(); self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(2)

    def request(self,path,host=None,method='GET'):
        connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=2)
        try:
            connection.request(method,path,headers={'Host':host or '127.0.0.1:'+str(self.port)})
            response=connection.getresponse()
            return response.status,dict(response.getheaders()),response.read()
        finally: connection.close()

    def test_static_allowlist_headers_and_health_identity(self):
        code,headers,body=self.request('/index.html')
        self.assertEqual(code,200); self.assertIn(b'test framebuffer',body)
        self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertEqual(headers['Referrer-Policy'],'no-referrer')
        self.assertIn("connect-src ws://127.0.0.1:5909",headers['Content-Security-Policy'])
        self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy'])
        code,_,body=self.request('/health')
        self.assertEqual(code,200)
        self.assertEqual(json.loads(body),{'instance':'test-owned-instance','build':'test-build'})
        self.assertEqual(self.request('/viewer.js',method='HEAD')[2],b'')
        self.assertEqual(self.request('/novnc/core/rfb.js')[0],200)

    def test_foreign_host_traversal_and_symlink_escape_are_refused(self):
        self.assertEqual(self.request('/index.html',host='foreign.invalid')[0],403)
        for path in ('/private.txt','/','/../outside.js','/%2e%2e/outside.js','/escape.js','/linked/outside.js','/novnc/app/ui.js'):
            with self.subTest(path=path):
                code,_,body=self.request(path)
                self.assertEqual(code,404); self.assertNotIn(b'MUST NOT BE SERVED',body)
        self.assertEqual(self.request('/viewer.js',method='POST')[0],501)

    def test_pinned_alternate_websocket_port_changes_only_integer_and_csp(self):
        self.server.websocket_port = 5910
        (self.root/'viewer.js').write_text('const configuredWebsocketPort = 5909;\n/* no password */')
        code, headers, body = self.request('/viewer.js')
        self.assertEqual(code, 200)
        self.assertEqual(body, b'const configuredWebsocketPort = 5910;\n/* no password */')
        self.assertIn('connect-src ws://127.0.0.1:5910;', headers['Content-Security-Policy'])
        self.assertNotIn(':5909', headers['Content-Security-Policy'])
        self.assertEqual(self.request('/viewer.js', method='HEAD')[2], b'')
        self.assertEqual(self.request('/viewer.js', host='127.0.0.1:8899')[0], 403)

    def test_alternate_port_refuses_an_unrecognized_viewer_source(self):
        self.server.websocket_port = 5910
        self.assertEqual(self.request('/viewer.js')[0], 500)

    def test_explicit_port_parameters_cannot_alias_or_escape_loopback(self):
        for ports in ({'port': 5909, 'websocket_port': 5909}, {'port': 80}, {'port': True},
                      {'port': 8900, 'websocket_port': '127.0.0.1:5910'}):
            with self.subTest(ports=ports), self.assertRaises(ValueError):
                viewer.ensure_viewer(self.root.parent/'invalid', 'session', **ports)

    def test_owned_reuse_requires_process_instance_and_build(self):
        record={'pid':123,'command':'test-owned-command','instance':'test-owned-instance','build':'test-build'}
        with patch.object(viewer,'process_command',return_value='test-owned-command'):
            self.assertTrue(viewer.healthy(record))
            self.assertFalse(viewer.healthy(dict(record,instance='different-instance')))
            self.assertFalse(viewer.healthy(dict(record,build='different-build')))
        with patch.object(viewer,'process_command',return_value='foreign-command'):
            self.assertFalse(viewer.healthy(record))

    def test_foreign_listener_is_not_killed_or_reused(self):
        state=self.root.parent/'state'
        with patch.object(viewer,'fingerprint',return_value='test-build'),patch.object(viewer.subprocess,'Popen') as spawn:
            with self.assertRaises(OSError): viewer.ensure_viewer(state,'fixture-session')
        spawn.assert_not_called()
        self.assertEqual(self.request('/health')[0],200)
        self.assertFalse((state/'viewer.json').exists())

    def test_spawn_failure_closes_only_new_reserved_listener(self):
        # Allocate another temporary port, distinct from both production ports
        # and the still-running unrelated fixture server above.
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0)); port=reservation.getsockname()[1]
        with patch.object(viewer,'PORT',port),patch.object(viewer,'fingerprint',return_value='test-build'), \
             patch.object(viewer.subprocess,'Popen',side_effect=OSError('injected spawn failure')):
            with self.assertRaisesRegex(OSError,'injected spawn failure'):
                viewer.ensure_viewer(self.root.parent/'spawn-failure','fixture-session')
        with socket.socket() as available:
            available.bind(('127.0.0.1',port)); available.listen(1)
        self.assertEqual(self.request('/health')[0],200)

    def test_startup_records_command_only_after_unique_http_readiness(self):
        state=self.root.parent/'reexec-fixture'; events=[]
        child=MagicMock(pid=123); child.poll.return_value=None
        replies=iter([False,True,True])
        def http_ready(record):
            value=next(replies); events.append(('http',value)); return value
        def command(pid):
            self.assertIn(('http',True),events)
            events.append(('command','post-reexec-python'))
            return 'post-reexec-python'
        with patch.object(viewer,'ThreadingHTTPServer'),patch.object(viewer,'fingerprint',return_value='test-build'), \
             patch.object(viewer.subprocess,'Popen',return_value=child),patch.object(viewer,'http_healthy',side_effect=http_ready), \
             patch.object(viewer,'process_command',side_effect=command):
            result=viewer.ensure_viewer(state,'fixture-session')
        self.assertEqual(result,viewer.BASE_URL+'index.html')
        self.assertEqual(json.loads((state/'viewer.json').read_text())['command'],'post-reexec-python')
        self.assertEqual(events[:2],[('http',False),('http',True)])
        child.terminate.assert_not_called()


if __name__=='__main__': unittest.main()
