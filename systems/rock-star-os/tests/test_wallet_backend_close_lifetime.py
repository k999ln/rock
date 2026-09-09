"""Closing a backend releases callbacks only after all actual work has stopped."""
from contextlib import closing
import http.client
import json
from pathlib import Path
import socketserver
import ssl
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os')]
from wallet_backend.server import WalletBackendServer, AUTHORITY_HEADER, PUBLIC_OWNER_TOKEN


class BackendCloseLifetimeTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name)
        self.callback=lambda _device:None
        self.server=WalletBackendServer(('127.0.0.1',0),self.root/'authority',
            start_scheduler=False,authentication_required=False,
            service_status_provider=self.callback)
        self.addCleanup(self.server.server_close)

    def test_callback_survives_inflight_tls_work_then_is_released(self):
        entered=threading.Event();release=threading.Event();closed=threading.Event()
        original=self.server.service.dispatch
        def blocked(request,**fields):
            entered.set()
            if not release.wait(5):raise RuntimeError('test dispatch release deadline')
            self.assertIs(self.callback,self.server.service_status_provider)
            return original(request,**fields)
        self.server.service.dispatch=blocked
        serving=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.01})
        replies=[];failures=[]
        def request():
            context=ssl.create_default_context(cafile=str(ROOT/'os/registry/fixtures/development-ca.pem'))
            connection=http.client.HTTPSConnection('127.0.0.1',self.server.server_port,context=context,timeout=5)
            try:
                connection.request('POST','/v1/wallet',body=b'{"v":1,"op":"snapshot"}',headers={
                    'Content-Type':'application/json','Authorization':'Bearer '+PUBLIC_OWNER_TOKEN,
                    AUTHORITY_HEADER:self.server.authority_id})
                response=connection.getresponse();replies.append((response.status,json.loads(response.read())['ok']))
            except BaseException as error:failures.append(type(error).__name__)
            finally:connection.close()
        def stop():
            try:
                self.server.shutdown();self.server.server_close();closed.set()
            except BaseException as error:failures.append(type(error).__name__)
        requester=threading.Thread(target=request);stopper=threading.Thread(target=stop)
        serving.start();requester.start()
        try:
            self.assertTrue(entered.wait(3));stopper.start()
            self.assertFalse(closed.wait(.1))
            self.assertIs(self.callback,self.server.service_status_provider)
        finally:
            release.set();requester.join(6)
            if stopper.ident is None:stopper.start()
            stopper.join(6);serving.join(6)
        self.assertFalse(any(thread.is_alive() for thread in (requester,stopper,serving)))
        self.assertEqual([],failures);self.assertEqual([(200,True)],replies)
        self.assertTrue(closed.is_set());self.assertIsNone(self.server.service_status_provider)

    def test_service_close_failure_retains_callback_until_successful_retry(self):
        original=self.server.service.close;attempts=[]
        def intermittent():
            attempts.append(True)
            if len(attempts)==1:raise RuntimeError('owned service still stopping')
            original()
        self.server.service.close=intermittent
        with self.assertRaises(RuntimeError):self.server.server_close()
        self.assertFalse(self.server._closed);self.assertIs(self.callback,self.server.service_status_provider)
        self.assertIsNotNone(self.server.lock_fd)
        self.server.server_close()
        self.assertIsNone(self.server.service_status_provider);self.assertTrue(self.server._closed)
        self.server.server_close()
        self.assertEqual(2,len(attempts))

    def test_listener_close_failure_does_not_drop_callback(self):
        with patch.object(socketserver.ThreadingMixIn,'server_close',side_effect=RuntimeError('worker join failed')):
            with self.assertRaises(RuntimeError):self.server.server_close()
        self.assertFalse(self.server._closed);self.assertIs(self.callback,self.server.service_status_provider)
        self.server.server_close();self.assertIsNone(self.server.service_status_provider)


if __name__=='__main__':unittest.main()
