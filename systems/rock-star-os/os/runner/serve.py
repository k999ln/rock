"""CLI serves actual isolated workers only. Public fixture authentication only."""
import argparse
from pathlib import Path
import signal
import threading

from blackberryrock.packages import PUBLIC_TEST_KEY, TEST_PUBLISHER
from .executor import IsolatedRecipeExecutor
from .protocol import PUBLIC_ALICE_TOKEN, PUBLIC_BOB_TOKEN
from .server import TLSRunnerServer, UnixRunnerServer
from .store import RunnerStore

OWNERS = {'alice': {'token': PUBLIC_ALICE_TOKEN, 'publishers': [TEST_PUBLISHER]},
          'bob': {'token': PUBLIC_BOB_TOKEN, 'publishers': [TEST_PUBLISHER]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--endpoint-id', required=True)
    parser.add_argument('--mode', choices=['cloud', 'pc_usb'], required=True)
    parser.add_argument('--launcher', type=Path, required=True)
    parser.add_argument('--worker', type=Path, required=True)
    parser.add_argument('--ca', type=Path)
    parser.add_argument('--public-fixture-key', type=Path)
    parser.add_argument('--port', type=int, default=9444)
    parser.add_argument('--socket', type=Path)
    args = parser.parse_args()
    if args.mode == 'cloud' and (not args.ca or not args.public_fixture_key):
        parser.error('cloud fixture requires explicit existing CA and PUBLIC fixture TLS key')
    if args.mode == 'pc_usb' and not args.socket:
        parser.error('PC-link fixture requires an explicit private Unix socket path')
    executor = IsolatedRecipeExecutor(args.launcher, args.worker, Path(__file__).with_name('isolated_entry.py'))
    store = RunnerStore(args.state, endpoint_id=args.endpoint_id, target=args.mode,
                        transport_evidence='pinned_tls_loopback_fixture' if args.mode == 'cloud' else 'authenticated_unix_fixture',
                        owners=OWNERS, publisher_trust={TEST_PUBLISHER: PUBLIC_TEST_KEY}, executor=executor)
    server = (TLSRunnerServer(('127.0.0.1', args.port), store, args.ca, args.public_fixture_key) if args.mode == 'cloud'
              else UnixRunnerServer(args.socket, store))
    def stop(*_):
        # HTTPServer.shutdown must run outside its serve_forever thread.
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print('PUBLIC DEVELOPMENT FIXTURE; production identity/payment/cloud deployment/physical USB NOT_RUN', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        store.close()


if __name__ == '__main__':
    main()
