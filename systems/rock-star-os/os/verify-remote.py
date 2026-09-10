#!/usr/bin/env python3
"""Actual ARM64 guest -> owned TLS registry/isolated runner -> offline reboot.

Only a newly created guest disk and child services belong to this experiment.
Public RFC fixtures are test identities. This is not public cloud or USB proof.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

REPO = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(REPO / 'src'), str(REPO / 'os')]
from blackberryrock.packages import canonical, PUBLIC_TEST_KEY, TEST_PUBLISHER
from registry.publish import publish
from registry.transport import HTTPSOrigin
from runner.build_fixture import remote_fixture
from runner.executor import IsolatedRecipeExecutor
from runner.serve import OWNERS
from runner.server import Handler, TLSRunnerServer
from runner.store import RunnerStore

spec = importlib.util.spec_from_file_location('store_helpers', REPO / 'os/verify-store.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
sha, stop, qmp = helpers.sha, helpers.stop, helpers.boot_helpers.qmp
KEYS = {'os-remote-first', 'os-remote-after-link-loss'}
INPUT = '  OSからの実入力  \n  Remote execution  '
EXPECTED = 'OSからの実入力\nRemote execution'


class RecordedExecutor:
    def __init__(self, actual):
        self.actual, self.calls = actual, []

    def execute(self, text, recipe, cancel):
        row = {'input_sha256':hashlib.sha256(text.encode()).hexdigest(), 'started':time.time()}
        self.calls.append(row)
        try:
            output, proof = self.actual.execute(text, recipe, cancel)
            row.update(status='succeeded', output_sha256=hashlib.sha256(output.encode()).hexdigest(), execution=proof)
            return output, proof
        except BaseException as error:
            row.update(status='failed', error_type=type(error).__name__)
            raise
        finally:
            row['finished'] = time.time()


class RecordedStore(RunnerStore):
    def __init__(self, *args, **kwargs):
        self.requests = []
        super().__init__(*args, **kwargs)

    def dispatch(self, envelope, **kwargs):
        response = super().dispatch(envelope, **kwargs)
        request = envelope['request']
        self.requests.append({'op':request['op'], 'key':request['key'],
                              'request_sha256':hashlib.sha256(canonical(request)).hexdigest(),
                              'response_sha256':hashlib.sha256(canonical(response)).hexdigest(),
                              'observed':time.time()})
        return response


class LoseFirstAcceptedReply(Handler):
    def respond(self, status, raw):
        body = json.loads(raw)
        result = body.get('response', {}).get('result', {})
        if status == 200 and result.get('accepted') is True and self.server.drop_pending:
            self.server.drop_pending = False
            self.server.dropped.append({'key':result['key'], 'request_sha256':result['request_sha256'],
                                        'full_bytes':len(raw), 'sent_bytes':len(raw)//2,
                                        'after_durable_acceptance':True})
            try:
                self.send_response(status)
                self.send_header('Content-Length', str(len(raw)))
                self.send_header('Content-Type', 'application/json')
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(raw[:len(raw)//2])
            except OSError:
                pass
            self.close_connection = True
        else:
            super().respond(status, raw)


def runner_rows(store):
    with store.mutex, closing(store.connect()) as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        return [dict(row) for row in db.execute('SELECT * FROM jobs ORDER BY key')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', required=True, type=Path)
    parser.add_argument('--scope', choices=('local-full','game-isolation'), default='local-full')
    args = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() == 0:
        raise SystemExit('Requires nonroot Linux development VM')
    images = args.artifacts.resolve()
    evidence = Path(tempfile.mkdtemp(prefix='remote-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-', dir=images))
    kernel, rootfs = images/'Image', images/'rootfs.ext4'
    before = {p.name:sha(p) for p in (kernel,rootfs)}
    fixtures = REPO/'os/registry/fixtures'
    ca = fixtures/'development-ca.pem'
    report = {'schema':'rock-os-remote-host-proof/1','status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),
              'image_sha256':before,'boots':[],'blackberry':'NOT_RUN','physical_usb':'NOT_RUN',
              'production_cloud':'NOT_RUN','real_money':'NOT_RUN','scope':'actual guest API and owned VM TLS fixture only'}
    registry = guest = server = store = thread = observer = None
    log = (evidence/'registry.log').open('wb')
    print('Actual remote OS evidence: '+str(evidence), flush=True)
    try:
        game_gate = None
        if args.scope == 'game-isolation':
            sys.path.insert(0,str(REPO/'os/desktop'))
            from game_gate_observer import Gate
            game_gate = Gate(images,evidence,('os/verify-remote.py','os/verify-store.py','os/platform/remote-guest-test.py'),
                             {'boots':2,'per_boot_seconds':360,'registry_ready_seconds':10})
            report.update(verification_scope=args.scope,wallet='NOT_RUN',game_scope_plan_sha256=game_gate.plan_sha)
        for port in (9443,9444):
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
                probe.bind(('127.0.0.1',port)); probe.listen(1)
        registry = subprocess.Popen([sys.executable,'-B','-m','registry.server','--state',str(evidence/'registry'),
                      '--authors',str(fixtures/'approved-authors.json'),'--cert',str(ca),
                      '--fixture-key',str(fixtures/'PUBLIC-FIXTURE-KEY.pem')],
                      env=dict(os.environ,PYTHONPATH=str(REPO/'src')+':'+str(REPO/'os')),
                      stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
        transport = HTTPSOrigin('https://127.0.0.1:9443',ca,timeout=1,attempts=1)
        deadline = time.monotonic()+10
        while True:
            if registry.poll() is not None:
                raise RuntimeError('owned registry stopped before readiness')
            try:
                transport.request('GET','/index.json',512*1024); break
            except ValueError:
                if time.monotonic() >= deadline: raise
                time.sleep(.1)
        package = evidence/'remote-text.rock.json'
        package.write_bytes(canonical(remote_fixture()))
        report['publish_receipt'] = publish('https://127.0.0.1:9443',ca,fixtures/'PUBLIC-AUTHOR-TOKEN.txt',package,'sdk-remote-'+sha(package))
        launcher = evidence/'runner-sandbox'
        subprocess.run(['/usr/bin/cc','-O2','-Wall','-Wextra','-Werror','-o',str(launcher),str(REPO/'os/runner/sandbox_launcher.c')],check=True)
        launcher.chmod(0o755)
        observer = RecordedExecutor(IsolatedRecipeExecutor(launcher,REPO/'src/blackberryrock/recipe_worker.py',REPO/'os/runner/isolated_entry.py'))
        store = RecordedStore(evidence/'runner',endpoint_id='runner-linux-cloud',target='cloud',
                   transport_evidence='pinned_tls_loopback_fixture',owners=OWNERS,
                   publisher_trust={TEST_PUBLISHER:PUBLIC_TEST_KEY},executor=observer)
        server = TLSRunnerServer(('127.0.0.1',9444),store,ca,fixtures/'PUBLIC-FIXTURE-KEY.pem',LoseFirstAcceptedReply)
        server.drop_pending, server.dropped = True, []
        thread = threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.05},daemon=True)
        thread.start()
        data = evidence/'userdata.ext4'
        with data.open('xb') as stream: stream.truncate(128*1024*1024)
        subprocess.run(['mkfs.ext4','-q','-F','-L','rock-data',str(data)],check=True)
        for phase in (1,2):
            monitor, logfile = evidence/f'qmp-{phase}.sock',evidence/f'boot-{phase}.log'
            command = ['qemu-system-aarch64','-machine','virt-10.0,gic-version=3','-accel','tcg','-cpu','cortex-a53',
                       '-m','1024','-smp','2','-display','none','-serial','stdio','-monitor','none',
                       '-qmp',f'unix:{monitor},server=on,wait=off','-no-reboot','-kernel',str(kernel),
                       '-append','console=ttyAMA0 vt.global_cursor_default=0 root=/dev/vda ro rootflags=noload rootwait panic=-1 rock.remote.verify=1',
                       '-drive',f'if=none,file={rootfs},format=raw,id=osdisk,readonly=on','-device','virtio-blk-pci,drive=osdisk,addr=0x1',
                       '-drive',f'if=none,file={data},format=raw,id=userdata','-device','virtio-blk-pci,drive=userdata,addr=0x2',
                       '-object','rng-random,filename=/dev/urandom,id=rockrng','-device','virtio-rng-pci,rng=rockrng,addr=0x3',
                       '-device','virtio-gpu-pci,xres=720,yres=960,addr=0x4','-device','virtio-keyboard-pci,addr=0x5',
                       '-device','virtio-tablet-pci,addr=0x6']
            command += (['-netdev','user,id=store-net','-device','virtio-net-pci,netdev=store-net,id=store-nic,addr=0x7,romfile='] if phase == 1 else ['-nic','none'])
            if game_gate:command[command.index('-append')+1] += ' rock.remote.scope=game-isolation'
            disconnected = reconnected = False
            with logfile.open('wb') as output:
                guest = subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
                deadline = time.monotonic()+360
                while guest.poll() is None:
                    content = logfile.read_text(errors='replace')
                    if phase == 1 and not disconnected and 'ROCK_REMOTE_DISCONNECT_READY' in content:
                        qmp(monitor,'set_link',{'name':'store-nic','up':False}); disconnected=True
                    if phase == 1 and not reconnected and 'ROCK_REMOTE_OFFLINE_PENDING' in content:
                        rows = runner_rows(store)
                        if {row['key'] for row in rows} != {'os-remote-first'}:
                            raise RuntimeError('offline request was unexpectedly accepted remotely')
                        report['runner_keys_during_link_loss'] = [row['key'] for row in rows]
                        qmp(monitor,'set_link',{'name':'store-nic','up':True}); reconnected=True
                    if time.monotonic() >= deadline:
                        raise TimeoutError('remote guest exceeded deadline')
                    time.sleep(.15)
            content = logfile.read_text(errors='replace')
            proofs = [json.loads(line.split('ROCK_REMOTE_GUEST_PROOF ',1)[1]) for line in content.splitlines() if 'ROCK_REMOTE_GUEST_PROOF ' in line]
            if len(proofs) != 1: raise RuntimeError('expected one guest proof')
            proof = proofs[0]
            if game_gate:game_gate.proof(proof)
            report['boots'].append({'phase':phase,'command':command,'proof':proof,'exit_code':guest.returncode,
                                    'link_disconnected':disconnected,'link_reconnected':reconnected})
            if guest.returncode or proof['status'] != 'PASS':
                raise RuntimeError('remote guest failed: '+str(proof.get('error')))
            filename = '/remote-proof.json' if phase == 1 else '/remote-offline-proof.json'
            disk = subprocess.run(['debugfs','-R','cat '+filename,str(data)],capture_output=True,check=True,timeout=15)
            if json.loads(disk.stdout) != proof: raise RuntimeError('serial/durable guest proof mismatch')
            (evidence/f'guest-proof-{phase}.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
            if phase == 1 and not (disconnected and reconnected): raise RuntimeError('link loss not exercised')
        rows = runner_rows(store)
        if {row['key'] for row in rows} != KEYS or len(rows) != 2:
            raise RuntimeError('remote durable jobs differ from exact approved set')
        if len(observer.calls) != 2 or any(x['status'] != 'succeeded' for x in observer.calls):
            raise RuntimeError('expected exactly two successful isolated process invocations')
        for row in rows:
            if row['state'] != 'succeeded' or row['request_json'] is not None:
                raise RuntimeError('terminal runner state or retention mismatch')
            proof = report['boots'][0]['proof']['first' if row['key']=='os-remote-first' else 'second']['remote']
            if (json.loads(row['execution_json']) != proof['execution'] or json.loads(row['receipt_json']) != proof['receipt']):
                raise RuntimeError('guest result differs from independent runner database')
            if json.loads(row['output_json']) != proof['output'] or proof['output'] != EXPECTED:
                raise RuntimeError('guest output differs from durable runner output')
            matching = [call for call in observer.calls if call['execution'] == proof['execution']]
            if (len(matching) != 1 or matching[0]['input_sha256'] != hashlib.sha256(INPUT.encode()).hexdigest()
                    or matching[0]['output_sha256'] != hashlib.sha256(EXPECTED.encode()).hexdigest()):
                raise RuntimeError('isolated executor input/output proof does not match this durable job')
        if len(server.dropped) != 1 or server.dropped[0]['key'] != 'os-remote-first':
            raise RuntimeError('durable acceptance reply loss was not exercised exactly once')
        if {x['key'] for x in store.requests if x['op']=='submit'} != KEYS:
            raise RuntimeError('unexpected remote submit key')
        if {p.name:sha(p) for p in (kernel,rootfs)} != before: raise RuntimeError('OS images changed')
        if game_gate:report['game_authority_retention'] = game_gate.finish()
        report.update(status='PASS_SCOPED' if game_gate else 'PASS',runner_rows=rows,launcher_sha256=sha(launcher),images_unchanged=True)
        print('PASS actual OS remote execution, lost acceptance reply, reconnect and offline reboot',flush=True)
    except BaseException as error:
        report.update(status='FAIL',error=type(error).__name__+': '+str(error))
        raise
    finally:
        original_error = sys.exc_info()[0] is not None
        failures = []
        def cleanup(name, action):
            try:
                action()
            except BaseException as error:
                failures.append({'action':name,'error_type':type(error).__name__})
        try:
            cleanup('owned guest',lambda:stop(guest))
            cleanup('owned registry',lambda:stop(registry))
            if server is not None:
                if thread is not None and thread.is_alive():
                    cleanup('runner shutdown',server.shutdown)
                    cleanup('runner thread',lambda:thread.join(5))
                    if thread.is_alive(): failures.append({'action':'runner thread','error_type':'StillAlive'})
                cleanup('runner listener',server.server_close)
                report['dropped_replies'] = server.dropped
            if store is not None:
                cleanup('runner store',store.close)
                report['remote_request_metadata'] = store.requests
            if observer is not None: report['actual_executor_calls'] = observer.calls
            cleanup('registry log',log.close)
        finally:
            if failures:
                report.update(status='FAIL',cleanup_failures=failures)
            report['finished_utc'] = datetime.now(timezone.utc).isoformat()
            (evidence/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        if failures and not original_error:
            raise RuntimeError('owned experiment cleanup incomplete; see preserved report')


if __name__ == '__main__':
    main()
