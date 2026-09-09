"""Actual Linux isolated worker over TLS and framed Unix; no fake executor.

Run as a nonroot Debian development user. Physical USB and public cloud NOT_RUN.
All files are created inside the explicitly supplied private work directory.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
from .build_fixture import remote_fixture
from .client import RunnerClient, consent_for
from .executor import IsolatedRecipeExecutor
from .protocol import PUBLIC_ALICE_TOKEN, TERMINAL
from .serve import OWNERS
from .server import Handler, TLSRunnerServer, UnixRunnerServer
from .store import RunnerStore
from .transport import HTTPSRunnerTransport, UnixRunnerTransport


class LoseOneReply(Handler):
    def respond(self, status, raw):
        if getattr(self.server, 'drop_once', False):
            self.server.drop_once = False
            self.send_response(status)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw[:len(raw) // 2])
            self.close_connection = True
        else:
            super().respond(status, raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--port', type=int, default=9444)
    args = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() == 0:
        raise SystemExit('NOT_RUN: requires nonroot Linux with bubblewrap and a C compiler')
    args.work_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    base = Path(__file__).resolve().parent
    launcher = args.work_dir / 'runner-sandbox'
    subprocess.run(['/usr/bin/cc', '-O2', '-Wall', '-Wextra', '-Werror', '-o', str(launcher), str(base / 'sandbox_launcher.c')], check=True)
    launcher.chmod(0o755)
    executor = IsolatedRecipeExecutor(launcher, args.project / 'src/blackberryrock/recipe_worker.py', base / 'isolated_entry.py')
    package = remote_fixture()
    results = []
    for mode, evidence in [('cloud', 'pinned_tls_loopback_fixture'), ('pc_usb', 'authenticated_unix_fixture')]:
        state = args.work_dir / mode
        endpoint = 'runner-linux-' + mode
        store = RunnerStore(state, endpoint_id=endpoint, target=mode, transport_evidence=evidence,
                            owners=OWNERS, publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY}, executor=executor)
        if mode == 'cloud':
            ca = args.project / 'os/registry/fixtures/development-ca.pem'
            key = args.project / 'os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem'
            server = TLSRunnerServer(('127.0.0.1', args.port), store, ca, key, LoseOneReply)
            server.drop_once = True
            transport = HTTPSRunnerTransport(f'https://127.0.0.1:{args.port}', ca)
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.02}, daemon=True)
        else:
            server = UnixRunnerServer(args.work_dir / 'socket/runner.sock', store)
            transport = UnixRunnerTransport(server.path)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = RunnerClient(transport, endpoint_id=endpoint, owner='alice', token=PUBLIC_ALICE_TOKEN)
            text = '  actual remote process  \n  世界  '
            key = 'actual-job-1'
            consent = consent_for(package, text, target=mode, endpoint_id=endpoint, key=key)
            receipt = client.submit(package, text, key, consent=consent)
            deadline = time.monotonic() + 8
            while True:
                status = client.status(key)
                if status['state'] in TERMINAL or time.monotonic() > deadline:
                    break
                time.sleep(0.05)
            if status['state'] != 'succeeded' or status['output'] != 'actual remote process\n世界':
                raise RuntimeError('actual isolated execution failed: ' + json.dumps(status, ensure_ascii=False))
            assert status['execution']['kind'] == 'actual_linux_isolated_process'
            assert status['execution']['socket_syscall_denied'] is True
            assert status['execution']['wallet_path_visible'] is False
            assert status['receipt']['transport_evidence'] == evidence
            assert status['receipt']['physical_usb'] == 'NOT_RUN'
            assert client.submit(package, text, key, consent=consent) == receipt
            again = client.status(key)
            assert again['execution'] == status['execution']
            results.append({'mode': mode, 'status': status, 'duplicate_submit_same_receipt': True})
        finally:
            server.shutdown(); thread.join(4); server.server_close(); store.close()
        # The persisted terminal job survives a full Store restart without executing.
        reopened = RunnerStore(state, endpoint_id=endpoint, target=mode, transport_evidence=evidence,
                               owners=OWNERS, publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY}, executor=executor, start_worker=False)
        try:
            assert reopened.status('alice', 'actual-job-1')['execution'] == results[-1]['status']['execution']
            assert reopened.tick() is False
            results[-1]['restart_same_execution'] = True
        finally:
            reopened.close()
    report = {'marker': 'ROCK_RUNNER_LINUX_ACTUAL_PASS', 'platform': sys.platform, 'machine': os.uname().machine,
              'production_cloud': 'NOT_RUN', 'physical_usb': 'NOT_RUN', 'fixtures_only': True,
              'launcher_sha256': hashlib.sha256(launcher.read_bytes()).hexdigest(), 'results': results}
    (args.work_dir / 'linux-actual.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
