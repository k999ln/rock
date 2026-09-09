import concurrent.futures
from contextlib import closing
import json
import os
from pathlib import Path
import socket
import selectors
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))
import power_service as power
from powerctl import request_power

BOOT_A = '11111111-1111-4111-8111-111111111111'
BOOT_B = '22222222-2222-4222-8222-222222222222'


def request(key='first', operation='poweroff'):
    return {'v': 1, 'op': operation, 'key': key}


@unittest.skipUnless(sys.platform == 'linux' and os.getuid() == 0 and os.geteuid() == 0,
                     'run as root only in an isolated Linux test VM')
class PowerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='rock-power-unit-')
        self.root = Path(self.temp.name)
        self.calls, self.services, self.servers = [], [], []

    def tearDown(self):
        for server, thread in self.servers:
            server.stopping = True
            thread.join(timeout=3)
            server.close()
            self.assertFalse(thread.is_alive())
        for service in reversed(self.services):
            service.close()
        self.temp.cleanup()

    def service(self, *, boot=BOOT_A, delay=0.01, executor=None):
        callback = executor if executor is not None else lambda operation: (self.calls.append(operation), 0)[1]
        service = power.PowerService(self.root / 'state', executor=callback, boot_id=boot, delay=delay)
        self.services.append(service)
        return service

    def stop_service(self, service):
        service.close()
        self.services.remove(service)

    def server(self, service):
        server = power.Server(self.root / 'run' / 'power.sock', service)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.servers.append((server, thread))
        return server

    def rows(self, service):
        with closing(sqlite3.connect(service.database)) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute('SELECT * FROM requests ORDER BY key')]

    def wait(self, condition):
        until = time.monotonic() + 3
        while time.monotonic() < until:
            if condition():
                return
            time.sleep(0.01)
        self.fail('bounded asynchronous condition did not occur')

    def test_receipt_commit_precedes_reply_and_dispatch(self):
        def inspect(operation):
            rows = self.rows(service)
            self.assertEqual('dispatched', rows[0]['status'])
            self.assertIsNotNone(rows[0]['replied_unix'])
            self.assertIsNotNone(rows[0]['dispatched_unix'])
            self.calls.append(operation)
            return 0
        service = self.service(executor=inspect)
        receipt = service.accept(request(), peer_uid=1002)
        self.assertTrue(receipt['result']['accepted'])
        self.assertEqual(BOOT_A, receipt['result']['boot_id'])
        self.assertEqual('pending', self.rows(service)[0]['status'])
        time.sleep(0.04)
        self.assertEqual([], self.calls)
        service.after_reply(request())
        self.wait(lambda: self.calls == ['poweroff'])

    def test_same_key_retries_dispatch_once_and_keep_original_receipt(self):
        service = self.service()
        receipt = service.accept(request(), peer_uid=0)
        for _ in range(12):
            self.assertEqual(receipt, service.accept(request(), peer_uid=1002))
            service.after_reply(request())
        self.wait(lambda: len(self.calls) == 1)
        service.after_reply(request())
        time.sleep(0.04)
        self.assertEqual(['poweroff'], self.calls)
        self.assertEqual(receipt, json.loads(self.rows(service)[0]['receipt_json']))

    def test_key_conflict_and_busy_receipts(self):
        service = self.service()
        service.accept(request(), peer_uid=0)
        with self.assertRaises(power.Rejected):
            service.accept(request(operation='reboot'), peer_uid=0)
        denied = service.accept(request('second', 'reboot'), peer_uid=0)
        self.assertEqual('busy', denied['code'])
        self.assertEqual(denied, service.accept(request('second', 'reboot'), peer_uid=0))
        self.assertEqual(2, len(self.rows(service)))

    def test_concurrent_distinct_and_identical_requests(self):
        service = self.service(delay=0.03)
        def accept(index):
            item = request('concurrent-' + str(index))
            result = service.accept(item, peer_uid=1002)
            if result['ok']:
                service.after_reply(item)
            return result
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(accept, range(20)))
        self.assertEqual(1, sum(result['ok'] for result in results))
        self.wait(lambda: len(self.calls) == 1)
        winner = next(result['result']['key'] for result in results if result['ok'])
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            same = list(pool.map(lambda _: service.accept(request(winner), peer_uid=1002), range(20)))
        self.assertTrue(all(result == same[0] for result in same))
        self.assertEqual(['poweroff'], self.calls)

    def test_pending_restart_same_boot_and_next_boot_never_executes(self):
        for new_boot in (BOOT_A, BOOT_B):
            with self.subTest(boot=new_boot):
                # Use distinct temporary state per subcase.
                self.root = Path(self.temp.name) / new_boot
                self.root.mkdir()
                first = self.service(delay=1)
                receipt = first.accept(request(), peer_uid=0)
                first.after_reply(request())
                self.stop_service(first)
                recovered = self.service(boot=new_boot)
                self.assertEqual('abandoned', self.rows(recovered)[0]['status'])
                self.assertEqual(receipt, recovered.accept(request(), peer_uid=1002))
                recovered.after_reply(request())
                time.sleep(0.04)
                self.assertEqual([], self.calls)
                self.stop_service(recovered)

    def test_previous_boot_dispatch_not_replayed_or_blocking_new_boot(self):
        first = self.service()
        receipt = first.accept(request(), peer_uid=0)
        first.after_reply(request())
        self.wait(lambda: self.calls == ['poweroff'])
        self.stop_service(first)
        second = self.service(boot=BOOT_B)
        self.assertEqual(receipt, second.accept(request(), peer_uid=1002))
        second.after_reply(request())
        fresh = request('new-boot', 'reboot')
        self.assertTrue(second.accept(fresh, peer_uid=1002)['ok'])
        second.after_reply(fresh)
        self.wait(lambda: self.calls == ['poweroff', 'reboot'])

    def test_command_failure_is_recorded_and_same_key_never_reexecutes(self):
        def failed(operation):
            self.calls.append(operation)
            raise OSError('injected fixed-command failure')
        service = self.service(executor=failed)
        receipt = service.accept(request(), peer_uid=0)
        service.after_reply(request())
        self.wait(lambda: self.rows(service)[0]['status'] == 'failed')
        self.assertEqual(receipt, service.accept(request(), peer_uid=0))
        service.after_reply(request())
        time.sleep(0.04)
        self.assertEqual(['poweroff'], self.calls)
        self.assertTrue(service.accept(request('explicit-new-key'), peer_uid=0)['ok'])

    def test_receipts_are_immutable_and_state_has_exact_permissions(self):
        service = self.service()
        service.accept(request(), peer_uid=0)
        with closing(service.connect()) as db:
            self.assertEqual(3, db.execute('PRAGMA synchronous').fetchone()[0])
        self.assertEqual(0o700, self.root.joinpath('state').stat().st_mode & 0o777)
        self.assertEqual(0o600, service.database.stat().st_mode & 0o777)
        with closing(sqlite3.connect(service.database)) as db, db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE requests SET receipt_json='{}'")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('DELETE FROM requests')
        with self.assertRaises(BlockingIOError):
            self.service()

    def test_strict_fields_types_and_bounded_capacity(self):
        service = self.service()
        invalid = [{}, [], request() | {'path': '/bin/sh'}, request() | {'command': 'reboot'},
                   request() | {'v': True}, request() | {'op': 'poweroff -f'},
                   request() | {'key': 'x' * 129}, request() | {'key': ''}, request() | {'key': 'あ'}]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(power.Rejected):
                service.accept(item, peer_uid=1002)
        self.assertEqual([], self.rows(service))
        with patch.object(power, 'MAX_RECEIPTS', 1):
            service.accept(request(), peer_uid=0)
            with self.assertRaises(power.Rejected):
                service.accept(request('full'), peer_uid=0)

    def test_kernel_peer_authorization_survives_loosened_socket_permissions(self):
        service = self.service()
        server = self.server(service)
        os.chmod(self.root, 0o755)
        os.chmod(server.path.parent, 0o755)
        os.chmod(server.path, 0o666)
        client = 'import socket,json,sys;s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);s.sendall(sys.argv[2].encode()+b"\\n");print(s.recv(2048).decode())'
        for uid in (1000, 1001, 1003, 1002):
            def identity():
                os.setgroups([])
                os.setgid(uid)
                os.setuid(uid)
            result = subprocess.run([sys.executable, '-B', '-I', '-c', client, str(server.path), json.dumps(request(str(uid)))],
                                    preexec_fn=identity, capture_output=True, text=True, timeout=4, check=True)
            reply = json.loads(result.stdout)
            self.assertEqual(uid == 1002, reply['ok'])
            if uid != 1002:
                self.assertEqual('unauthorized', reply['code'])
        self.wait(lambda: self.calls == ['poweroff'])
        self.assertEqual(['1002'], [row['key'] for row in self.rows(service)])

    def test_wire_frame_limits_duplicates_and_whole_frame_deadline(self):
        service = self.service()
        server = self.server(service)
        for raw in (b'{"v":1,"v":1,"op":"poweroff","key":"duplicate"}\n', b'x' * 1025,
                    b'{}\n{}\n', b'\xff\n', b'{"v":1,"op":"poweroff","key":NaN}\n'):
            with self.subTest(raw=raw[:50]), socket.socket(socket.AF_UNIX) as client:
                client.settimeout(4)
                client.connect(str(server.path))
                client.sendall(raw)
                self.assertFalse(json.loads(client.recv(2048))['ok'])
        with socket.socket(socket.AF_UNIX) as client:
            client.settimeout(4)
            client.connect(str(server.path))
            client.sendall(b'{')
            start = time.monotonic()
            reply = json.loads(client.recv(2048))
            self.assertFalse(reply['ok'])
            self.assertLess(time.monotonic() - start, 3)
        self.assertEqual([], self.rows(service))

    def test_cli_receipt_and_fixed_normal_init_commands(self):
        service = self.service()
        server = self.server(service)
        receipt = request_power('reboot', 'cli-test', str(server.path))
        self.assertTrue(receipt['result']['accepted'])
        self.wait(lambda: self.calls == ['reboot'])
        with patch.object(power.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as run:
            for action in ('poweroff', 'reboot'):
                self.assertEqual(0, power.normal_init_action(action))
                self.assertEqual(['/sbin/' + action], run.call_args.args[0])
                self.assertNotIn('shell', run.call_args.kwargs)
                self.assertNotIn('-f', run.call_args.args[0])

    def test_cli_waits_for_slow_receipt_and_dispatches_only_once(self):
        service = self.service()
        server = self.server(service)
        original = service.accept
        def slow_accept(*args, **kwargs):
            time.sleep(3.4)
            return original(*args, **kwargs)
        with patch.object(service, 'accept', side_effect=slow_accept):
            receipt = request_power('poweroff', 'slow-cli-test', str(server.path))
        self.assertTrue(receipt['result']['accepted'])
        self.wait(lambda: self.calls == ['poweroff'])
        self.assertEqual(request_power('poweroff', 'slow-cli-test', str(server.path)), receipt)
        self.assertEqual(self.calls, ['poweroff'])

    def test_dispatch_claim_survives_actual_process_exit_without_replay(self):
        code = '''
import json,os,sys,time
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from power_service import PowerService
def crash(operation):
    Path(sys.argv[2]).joinpath("callback-ran").write_text(operation)
    os._exit(37)
service=PowerService(Path(sys.argv[2])/"state",executor=crash,boot_id=sys.argv[3],delay=0.01)
request={"v":1,"op":"reboot","key":"crash-claim"}
print(json.dumps(service.accept(request,peer_uid=0)),flush=True)
service.after_reply(request)
time.sleep(4)
raise RuntimeError("callback did not run")
'''
        child = subprocess.run([sys.executable, '-B', '-I', '-c', code, str(SOURCE), str(self.root), BOOT_A],
                               capture_output=True, text=True, timeout=5)
        self.assertEqual(37, child.returncode, child.stderr)
        receipt = json.loads(child.stdout)
        self.assertEqual('reboot', (self.root / 'callback-ran').read_text())
        recovered = self.service()
        row = self.rows(recovered)[0]
        self.assertEqual('dispatched', row['status'])
        self.assertIsNotNone(row['dispatched_unix'])
        replay = request('crash-claim', 'reboot')
        self.assertEqual(receipt, recovered.accept(replay, peer_uid=0))
        recovered.after_reply(replay)
        time.sleep(0.04)
        self.assertEqual([], self.calls)
        self.assertEqual('busy', recovered.accept(request('another-this-boot'), peer_uid=0)['code'])

    def test_cli_rejects_real_nonroot_server_before_sending_request(self):
        os.chmod(self.root, 0o777)
        path = self.root / 'foreign.sock'
        code = '''
import socket,sys
s=socket.socket(socket.AF_UNIX)
s.bind(sys.argv[1]);s.listen(1);s.settimeout(3)
print("READY",flush=True)
c,_=s.accept();c.settimeout(2)
print("received="+str(len(c.recv(1024))),flush=True)
c.close();s.close()
'''
        def identity():
            os.setgroups([])
            os.setgid(1002)
            os.setuid(1002)
        child = subprocess.Popen([sys.executable, '-B', '-I', '-c', code, str(path)], preexec_fn=identity,
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(child.stdout, selectors.EVENT_READ)
                self.assertTrue(selector.select(3), 'foreign test server did not start')
            self.assertEqual('READY\n', child.stdout.readline())
            with self.assertRaises(PermissionError):
                request_power('poweroff', 'not-sent', str(path))
            output, error = child.communicate(timeout=3)
            self.assertEqual(0, child.returncode, error)
            self.assertEqual('received=0\n', output)
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=3)
            child.stdout.close()
            child.stderr.close()

    def test_worker_storage_faults_fail_fast_without_automatic_redispatch(self):
        for phase in ('before-dispatch', 'after-callback'):
            with self.subTest(phase=phase):
                self.root = Path(self.temp.name) / phase
                self.root.mkdir()
                service = self.service()
                receipt = service.accept(request(), peer_uid=0)
                condition = "NEW.status='dispatched'" if phase == 'before-dispatch' else 'NEW.command_returncode IS NOT NULL'
                with closing(sqlite3.connect(service.database)) as db, db:
                    db.execute("CREATE TRIGGER injected_storage_fault BEFORE UPDATE ON requests WHEN " + condition +
                               " BEGIN SELECT RAISE(ABORT,'injected storage fault'); END")
                service.after_reply(request())
                self.wait(lambda: service.fatal_error is not None)
                self.assertIn('injected storage fault', service.fatal_error)
                expected = [] if phase == 'before-dispatch' else ['poweroff']
                self.assertEqual(expected, self.calls)
                server = power.Server(self.root / 'run' / 'power.sock', service)
                try:
                    with self.assertRaisesRegex(RuntimeError, 'storage worker failed'):
                        server.serve_forever()
                finally:
                    server.close()
                self.stop_service(service)
                with closing(sqlite3.connect(service.database)) as db, db:
                    db.execute('DROP TRIGGER injected_storage_fault')
                restarted = self.service()
                self.assertEqual(receipt, restarted.accept(request(), peer_uid=0))
                restarted.after_reply(request())
                time.sleep(0.04)
                self.assertEqual(expected, self.calls)
                self.stop_service(restarted)
                self.calls.clear()

    def test_reply_storage_fault_exits_without_claiming_execution(self):
        service = self.service()
        with closing(sqlite3.connect(service.database)) as db, db:
            db.execute("CREATE TRIGGER injected_reply_fault BEFORE UPDATE ON requests WHEN NEW.status='ready' "
                       "BEGIN SELECT RAISE(ABORT,'injected reply fault'); END")
        server = power.Server(self.root / 'run' / 'power.sock', service)
        try:
            client, connection = socket.socketpair()
            with client, connection:
                client.settimeout(2)
                client.sendall(power.canonical(request()) + b'\n')
                server.handle(connection)
                self.assertTrue(json.loads(client.recv(2048))['ok'])
            self.assertIn('injected reply fault', service.fatal_error)
            self.assertEqual('pending', self.rows(service)[0]['status'])
            self.assertEqual([], self.calls)
            with self.assertRaisesRegex(RuntimeError, 'storage worker failed'):
                server.serve_forever()
        finally:
            server.close()

    def test_state_and_socket_path_safety(self):
        bad = self.root / 'state'
        bad.mkdir(mode=0o755)
        with self.assertRaises(PermissionError):
            self.service()
        os.chmod(bad, 0o700)
        service = self.service()
        run = self.root / 'run'
        run.mkdir()
        marker = run / 'power.sock'
        marker.write_text('not a socket')
        with self.assertRaises(PermissionError):
            power.Server(marker, service)
        self.assertEqual('not a socket', marker.read_text())


if __name__ == '__main__':
    unittest.main()
