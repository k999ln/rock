import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

SCRIPT = Path(__file__).resolve().parents[1] / 'toolkits/sky-linux-local/update-pixel.py'
spec = importlib.util.spec_from_file_location('pixel_owner_update', SCRIPT)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class OwnerUpdateTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root, self.source = self.base / 'sky-private', self.base / 'source'
        for folder in [self.root, self.root / 'state', self.root / 'app', self.root / 'android-bridge', self.source]:
            folder.mkdir(mode=0o700)
        self.payload = {}
        for name in updater.FILES:
            value = ('lock:' if name.endswith(('-lock.json',)) else 'new:') + name
            self.payload[name] = value.encode()
            self.write(self.source / name, self.payload[name])
            self.write(self.root / 'app' / name, self.payload[name] if name.endswith('-lock.json') else ('old:' + name).encode())
        self.write(self.root / 'app/retained-extra.txt', b'Unchanged owner extra')
        self.write(self.root / 'worker.py', b'old root worker')
        self.write(self.root / 'android-bridge/client.py', b'old bridge')
        for name in updater.IDENTITIES:
            self.write(self.root / 'android-bridge' / name, ('private fixture:' + name).encode())
        self.state = {'schema': 1, 'owner': 'synthetic', 'phase': 'stopped', 'selectedModelId': 'fixture',
                      'models': [{'id': 'fixture'}], 'agents': [{'id': 'agent'}],
                      'runs': [{'job': {'id': 'job', 'status': 'review'}, 'stop': 'none', 'text': 'Retained synthetic result'}]}
        self.write_state()
        self.manifest()
        self.old_app = updater.inventory(self.root / 'app')
        self.old_identity = updater.identities(self.root)
        self.old_state = (self.root / 'state/state.json').read_bytes()
        self.calls = []

    def write(self, path, data):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o600)

    def write_state(self):
        self.write(self.root / 'state/state.json', json.dumps(self.state).encode())

    def manifest(self):
        value = {'schema': 'sky.pixel-linux-package/1', 'files': {name: hashlib.sha256(body).hexdigest() for name, body in self.payload.items()}}
        path = self.source / 'package-manifest.json'
        self.write(path, json.dumps(value).encode())
        self.sha = updater.digest(path)

    def inspect(self):
        state = json.loads((self.root / 'state/state.json').read_bytes())
        return {**state, 'schema': 'sky.private-linux-deployment/1'}

    def control(self, action, unit):
        self.calls.append((action, unit))

    def run_update(self, **kwargs):
        options = {'control': self.control, 'inspect': self.inspect, 'check_capabilities': lambda _: None, **kwargs}
        return updater.update(self.root, self.source, self.sha, **options)

    def receipt(self):
        transaction = json.loads((self.root / 'update-transaction.json').read_bytes())['id']
        directory = self.root / 'updates' / transaction
        return directory, json.loads((directory / 'receipt.json').read_bytes())

    def test_cutover_updates_active_bridge_and_worker_preserves_private_data_and_old_source(self):
        result = self.run_update()
        self.assertEqual(result['state'], 'committed')
        self.assertEqual((result['jobsRetained'], result['modelsRetained'], result['agentsRetained']), (1, 1, 1))
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.old_state)
        self.assertEqual(updater.identities(self.root), self.old_identity)
        self.assertEqual((self.root / 'worker.py').read_bytes(), self.payload['toolkits/sky-linux-local/worker.py'])
        self.assertEqual((self.root / 'android-bridge/client.py').read_bytes(), self.payload['toolkits/sky-linux-local/android-bridge.py'])
        self.assertEqual((self.root / 'app/retained-extra.txt').read_bytes(), b'Unchanged owner extra')
        directory, receipt = self.receipt()
        self.assertEqual(updater.inventory(directory / 'app'), self.old_app)
        self.assertEqual(receipt['state'], 'committed')
        self.assertIn(('check', 'sky-android-bridge.service'), self.calls)

    def test_tampered_payload_never_stops_services(self):
        self.write(self.source / 'server.mjs', b'tampered')
        with self.assertRaisesRegex(updater.UpdateError, 'PACKAGE_CHANGED'):
            self.run_update()
        self.assertEqual(self.calls, [])
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)

    def test_active_work_is_rejected_before_cutover(self):
        self.state['runs'][0]['job']['status'] = 'active'
        self.write_state()
        with self.assertRaisesRegex(updater.UpdateError, 'WORK_NOT_STOPPED'):
            self.run_update()
        self.assertEqual(self.calls, [])

    def test_ready_environment_must_be_stopped_first(self):
        self.state['phase'] = 'ready'
        self.write_state()
        with self.assertRaisesRegex(updater.UpdateError, 'STOP_ENVIRONMENT_BEFORE_UPDATE'):
            self.run_update()
        self.assertEqual(self.calls, [])

    def test_failed_capability_check_restores_code_without_restoring_or_erasing_user_state(self):
        def fail(_):
            raise RuntimeError('synthetic ABI failure')
        with self.assertRaisesRegex(updater.UpdateError, 'UPDATE_FAILED_OLD_CODE_RESTORED'):
            self.run_update(check_capabilities=fail)
        directory, receipt = self.receipt()
        self.assertEqual(receipt['state'], 'rolled_back')
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)
        self.assertEqual((self.root / 'worker.py').read_bytes(), b'old root worker')
        self.assertEqual((self.root / 'android-bridge/client.py').read_bytes(), b'old bridge')
        self.assertTrue((directory / 'failed-app').is_dir())
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.old_state)
        self.assertEqual(updater.identities(self.root), self.old_identity)

    def test_service_failure_before_app_move_recovers_old_services(self):
        failed = False
        def control(action, unit):
            nonlocal failed
            self.control(action, unit)
            if not failed and (action, unit) == ('stop', 'sky-private.service'):
                failed = True
                raise RuntimeError('synthetic stop failure')
        with self.assertRaisesRegex(updater.UpdateError, 'OLD_CODE_RESTORED'):
            self.run_update(control=control)
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)
        self.assertEqual(self.receipt()[1]['state'], 'rolled_back')

    def test_concurrent_private_data_is_preserved_and_not_hidden_by_backup_restore(self):
        changed = False
        def control(action, unit):
            nonlocal changed
            self.control(action, unit)
            if not changed and (action, unit) == ('stop', 'sky-private.service'):
                changed = True
                self.state['runs'].append({'job': {'id': 'new-owner-job', 'status': 'review'}, 'stop': 'none'})
                self.write_state()
        with self.assertRaisesRegex(updater.UpdateError, 'UPDATE_RECOVERY_REQUIRED'):
            self.run_update(control=control)
        self.assertEqual(len(self.inspect()['runs']), 2)
        self.assertEqual(self.receipt()[1]['state'], 'rollback_failed')
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)

    def crash_after_old_move(self):
        replace = os.replace
        def crash(source, target):
            if Path(source).name == 'staged-app':
                raise KeyboardInterrupt('synthetic process loss')
            return replace(source, target)
        with patch.object(updater.os, 'replace', side_effect=crash):
            with self.assertRaises(KeyboardInterrupt):
                self.run_update()
        return self.receipt()

    def test_interrupted_cutover_refuses_new_update_then_explicit_recovery_restores_old_app(self):
        directory, receipt = self.crash_after_old_move()
        self.assertFalse((self.root / 'app').exists())
        self.assertEqual(receipt['state'], 'old_moved')
        with self.assertRaisesRegex(updater.UpdateError, 'UPDATE_RECOVERY_REQUIRED'):
            self.run_update()
        updater.rollback(self.root, receipt, self.control, self.inspect, lambda _: None)
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)
        self.assertEqual(json.loads((directory / 'receipt.json').read_bytes())['state'], 'rolled_back')
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.old_state)

    def test_corrupt_backup_is_not_installed(self):
        directory, receipt = self.crash_after_old_move()
        self.write(directory / 'app/server.mjs', b'changed backup')
        with self.assertRaisesRegex(updater.UpdateError, 'BACKUP_CHANGED'):
            updater.rollback(self.root, receipt, self.control, self.inspect)
        self.assertFalse((self.root / 'app').exists())
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.old_state)

    def test_symlink_payload_is_rejected(self):
        target = self.source / 'server.mjs'
        target.unlink()
        other = self.base / 'outside.mjs'
        self.write(other, self.payload['server.mjs'])
        target.symlink_to(other)
        with self.assertRaisesRegex(updater.UpdateError, 'PACKAGE_PATH_REJECTED'):
            self.run_update()
        self.assertEqual(self.calls, [])

    def test_missing_existing_key_does_not_create_a_new_identity(self):
        (self.root / 'android-bridge/client.key').unlink()
        with self.assertRaises(FileNotFoundError):
            self.run_update()
        self.assertFalse((self.root / 'android-bridge/client.key').exists())
        self.assertEqual(self.calls, [])

    def test_model_runtime_upgrade_is_a_separate_gate(self):
        name = 'toolkits/sky-linux-local/runtime-lock.json'
        self.payload[name] = b'unaccepted engine version'
        self.write(self.source / name, self.payload[name])
        self.manifest()
        with self.assertRaisesRegex(updater.UpdateError, 'SEPARATE_ACCEPTANCE'):
            self.run_update()
        self.assertEqual(self.calls, [])

    def test_second_updater_cannot_enter_the_transaction(self):
        descriptor = os.open(self.root / 'update.lock', os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.run_update()
        finally:
            os.close(descriptor)
        self.assertEqual(self.calls, [])

    def test_fixed_service_control_has_no_arbitrary_unit_or_shell(self):
        with self.assertRaisesRegex(updater.UpdateError, 'FIXED_SERVICE_ONLY'):
            updater.systemctl('start', 'unrelated.service')
        with patch.object(updater.subprocess, 'run') as run:
            updater.systemctl('check', 'sky-private.service')
            self.assertEqual(run.call_args.args[0], ['systemctl', 'is-active', '--quiet', 'sky-private.service'])

    def test_receipt_limit_matches_the_dispatch_guard_without_overwriting_prior_bytes(self):
        path = self.root / 'receipt-limit.json'
        self.write(path, b'original')
        with self.assertRaisesRegex(updater.UpdateError, 'UPDATE_RECORD_TOO_LARGE'):
            updater.save(path, {'large': 'x' * 262144})
        self.assertEqual(path.read_bytes(), b'original')

    def cli_recovery(self, transaction):
        rollback = updater.rollback
        with patch.object(updater.sys, 'platform', 'linux'), patch.object(updater.sys, 'argv', ['update', '--recover', transaction]), \
             patch.object(updater.os, 'uname', return_value=SimpleNamespace(machine='aarch64')), \
             patch.object(updater.os, 'geteuid', return_value=1000), patch.object(updater.Path, 'home', return_value=self.base), \
             patch.object(updater, 'systemctl', self.control), patch.object(updater, 'status', self.inspect), \
             patch.object(updater, 'rollback', side_effect=lambda root, receipt, control, inspect: rollback(root, receipt, control, inspect, lambda _: None)):
            output = io.StringIO()
            with redirect_stdout(output):
                updater.main()
            return json.loads(output.getvalue())

    def test_recovery_cli_accepts_only_the_current_unfinished_transaction(self):
        _, receipt = self.crash_after_old_move()
        other = 'c' * 64 + '-' + 'd' * 32
        (self.root / 'updates' / other).mkdir(mode=0o700)
        self.calls.clear()
        with self.assertRaisesRegex(updater.UpdateError, 'CURRENT_TRANSACTION_REQUIRED'):
            self.cli_recovery(other)
        self.assertEqual(self.calls, [])
        result = self.cli_recovery(receipt['id'])
        self.assertEqual(result, {'state': 'rolled_back', 'privateDataOverwritten': False})
        self.assertEqual(updater.inventory(self.root / 'app'), self.old_app)
        self.assertEqual((self.root / 'state/state.json').read_bytes(), self.old_state)

    def test_unsupported_platform_rejects_before_accessing_owner_home(self):
        with patch.object(updater.sys, 'argv', ['update', '--manifest-sha', self.sha]), \
             patch.object(updater.sys, 'platform', 'darwin'), \
             patch.object(updater.Path, 'home', side_effect=AssertionError('home must not be accessed')):
            with self.assertRaisesRegex(updater.UpdateError, 'OWNER_PIXEL_GUEST_REQUIRED'):
                updater.main()

    def test_fixed_worker_capability_probe_is_bounded_strict_and_read_only(self):
        value = {'schema':'rockstaros.linux-text-capability/1','protocol':1,
                 'platform':'linux','architecture':'aarch64','maximumOutputTokens':1024,'maximumDeadlineMs':120000}
        def invoke(body):
            def run(args, **options):
                self.assertEqual(args, ['python3',str(self.root/'worker.py'),'capabilities'])
                self.assertEqual(options['timeout'],15)
                self.assertEqual(options['stdin'],subprocess.DEVNULL)
                self.assertFalse(options.get('shell',False))
                self.assertEqual(set(options['env']),{'PATH','HOME','LANG'})
                with patch.object(updater.resource,'setrlimit') as limit:
                    options['preexec_fn']()
                    limit.assert_any_call(updater.resource.RLIMIT_FSIZE,(8192,8192))
                options['stdout'].write(body)
            with patch.object(updater.subprocess,'run',side_effect=run):
                updater.capabilities(self.root)
        import subprocess
        invoke(json.dumps(value).encode())
        for change in [{'protocol':True},{'platform':'darwin'},{'maximumOutputTokens':2048},{'maximumDeadlineMs':True}]:
            with self.assertRaisesRegex(updater.UpdateError,'RUNTIME_ABI_UNSUPPORTED'):
                invoke(json.dumps({**value,**change}).encode())
        with self.assertRaisesRegex(updater.UpdateError,'RUNTIME_RESPONSE_INVALID'):invoke(b'x'*8193)
        for body in [b'',b'{}\n{}']:
            with self.assertRaises((ValueError,updater.UpdateError)):invoke(body)
        with patch.object(updater.subprocess,'run',side_effect=subprocess.TimeoutExpired('fixed probe',15)):
            with self.assertRaises(subprocess.TimeoutExpired):updater.capabilities(self.root)

    def test_cache_ledger_survives_update_and_rollback(self):
        self.state['cachePreparations']={'schema':1,'incomplete':False,'entries':{'synthetic-A':{'state':'ready'}}}
        self.state['cachePreparation']={'requestId':'synthetic-A','state':'ready'}
        self.write_state();before=(self.root/'state/state.json').read_bytes()
        self.run_update();self.assertEqual((self.root/'state/state.json').read_bytes(),before)
        # A separate candidate proves rollback never restores an older user ledger.
        old=updater.cache_ledger(self.root)
        self.state['cachePreparations']['entries']['synthetic-B']={'state':'unknown'}
        self.write_state();self.assertNotEqual(updater.cache_ledger(self.root),old)

    def test_empty_cache_ledger_migration_and_old_receipt_fingerprint_are_compatible(self):
        old=updater.protected(self.root)
        empty=updater.cache_ledger(self.root)
        self.state['cachePreparations']={'schema':1,'incomplete':False,'entries':{}}
        self.write_state()
        self.assertEqual(updater.protected(self.root),old)
        self.assertEqual(updater.cache_ledger(self.root),empty)

    def test_pending_cache_phase_at_second_idle_check_never_cuts_over(self):
        calls=0
        def inspect():
            nonlocal calls
            calls+=1
            result=self.inspect()
            if calls==2:result['phase']='preparing'
            return result
        with self.assertRaises(updater.UpdateError):self.run_update(inspect=inspect)
        self.assertEqual(updater.inventory(self.root/'app'),self.old_app)
        self.assertFalse(any(action=='stop' for action,_ in self.calls))

    def test_cache_terminal_sync_pending_is_not_idle(self):
        for phase in ['preparing','ready']:
            with self.assertRaisesRegex(updater.UpdateError,'STOP_ENVIRONMENT'):
                updater.idle({**self.inspect(),'phase':phase,'cachePreparation':{'state':'preparing'}})

    def test_actual_manager_and_transaction_fence_interleave_before_effect(self):
        import subprocess
        import selectors
        repo=SCRIPT.parents[2]
        model=json.loads((repo/'toolkits/sky-linux-local/runtime-lock.json').read_text())['model']
        code=r'''
import {createLinuxLocalManager} from './scripts/sky-linux-local-runtime.mjs';
import {pixelUpdateGuard} from './toolkits/sky-linux-local/pixel-update-guard.mjs';
import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';
import {createInterface} from 'node:readline';import {join} from 'node:path';
const root=process.argv[1],pause=process.argv[2],model=JSON.parse(process.argv[3]);
const lines=createInterface({input:process.stdin});let resume;lines.on('line',()=>resume?.());
const barrier=()=>new Promise(resolve=>{resume=resolve;});let effects=0,checks=0,paused=false;
const guard=pixelUpdateGuard(root),original=fs.open;
if(pause==='sync'){fs.open=async(...args)=>{const h=await original(...args);if(!paused&&String(args[0])===join(root,'state/state.json')&&args[1]==='r'){
 paused=true;const sync=h.sync.bind(h);h.sync=async()=>{console.log('barrier');await barrier();return sync();};}return h;};syncBuiltinESMExports();}
const environment={id:'pixel-linux',bootId:'synthetic',spawn(){throw Error('no process');},async stop(){},
 async assertExecutionAllowed(){await guard();if(pause==='guard'&&++checks===1){console.log('barrier');await barrier();}},
 async inspectCached(){return {id:model.id,sha256:model.sha256,bytes:model.bytes,state:'verified',cacheOnly:true,downloads:false};},
 async prepare(){effects++;throw Error('must never prepare');}};
const manager=await createLinuxLocalManager({root:process.cwd(),stateDir:join(root,'state'),environment});
console.log('ready');await barrier();
try {await manager.action({action:'prepare-cached',accepted:true,cacheOnly:true,modelId:model.id,modelSha256:model.sha256,
 requestId:'11111111-1111-4111-8111-111111111111',scopeSha256:'a'.repeat(64)});console.log(JSON.stringify({effects,allowed:true}));}
catch(e){console.log(JSON.stringify({effects,code:e.code??e.message}));}
finally{fs.open=original;syncBuiltinESMExports();await manager.close();lines.close();}
'''
        for pause in ['guard','sync']:
            with self.subTest(pause=pause):
                # Each interleaving has fresh product data and no previous transaction.
                self.state={'schema':1,'owner':f'local-uid:{os.getuid()}','phase':'stopped',
                            'models':[model],'selectedModelId':model['id'],'agents':[],'runs':[]}
                self.write_state()
                pointer=self.root/'update-transaction.json'
                if pointer.exists():pointer.unlink()
                child=subprocess.Popen(['node','--experimental-strip-types','--input-type=module','-e',code,
                                        str(self.root),pause,json.dumps(model)],cwd=repo,
                                       stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                def line():
                    with selectors.DefaultSelector() as sel:
                        sel.register(child.stdout,selectors.EVENT_READ)
                        self.assertTrue(sel.select(5),'bounded Node fixture output missing')
                    return child.stdout.readline().strip()
                def release():child.stdin.write('continue\n');child.stdin.flush()
                count=0
                try:
                    self.assertEqual(line(),'ready')
                    def inspect():
                        nonlocal count
                        count+=1
                        if count==1:
                            before=self.inspect();release();self.assertEqual(line(),'barrier');return before
                        if count==2:
                            self.assertTrue(pointer.exists());release()
                            result=json.loads(line());self.assertEqual(result,{'effects':0,'code':'PIXEL_UPDATE_PENDING'})
                        return self.inspect()
                    self.calls=[]
                    with self.assertRaisesRegex(updater.UpdateError,'UPDATE_ADMISSION_REJECTED'):
                        self.run_update(inspect=inspect)
                    self.assertEqual(child.wait(timeout=5),0,child.stderr.read())
                    self.assertEqual(self.calls,[])
                    self.assertEqual(updater.inventory(self.root/'app'),self.old_app)
                    saved=json.loads((self.root/'state/state.json').read_text())
                    self.assertEqual(saved['cachePreparation']['state'],'unknown')
                finally:
                    if child.poll() is None:child.kill();child.wait(timeout=5)
                    child.stdin.close();child.stdout.close();child.stderr.close()


if __name__ == '__main__':
    unittest.main()
