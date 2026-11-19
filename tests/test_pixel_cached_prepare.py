import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cached_prepare', Path(__file__).resolve().parents[1] / 'toolkits/sky-linux-local/prepare-pixel.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class CachedPrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve() / 'sky-private'
        self.root.mkdir()
        self.addCleanup(patch.stopall)
        patch.object(p, 'ROOT', self.root).start()
        self.cdll = patch.object(p.ctypes, 'CDLL').start()
        self.run = patch.object(p.subprocess, 'run', side_effect=AssertionError('No executable, apt or shell in inventory')).start()
        self.fetch = patch.object(p.urllib.request, 'build_opener', side_effect=AssertionError('No network')).start()
        self.data = b'GGUF' + b'x' * 1020
        self.model = {'id':'fixture','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest(),'promptFormat':'chatml'}
        self.dist = self.root / 'distribution';self.dist.mkdir()
        runtime = self.root / 'runtime' / 'fixture';runtime.mkdir(parents=True)
        with tarfile.open(self.dist / 'runtime.tar.gz','w:gz') as archive:
            for name in ['llama-cli','llama-completion','libfixture.so']:
                value = ('fixture '+name).encode();(runtime / name).write_bytes(value)
                member=tarfile.TarInfo('fixture/'+name);member.size=len(value);archive.addfile(member,io.BytesIO(value))
        lock={'model':self.model,'directory':'fixture','architecture':'aarch64','bytes':(self.dist/'runtime.tar.gz').stat().st_size,'sha256':p.sha(self.dist/'runtime.tar.gz')}
        app=self.root/'app/toolkits/sky-linux-local';app.mkdir(parents=True)
        for target in [app/'runtime-lock.json',self.root/'runtime-lock.json']:target.write_text(json.dumps(lock))
        for target in [app/'worker.py',self.root/'worker.py']:target.write_text('fixed-worker')
        folder=self.root/'models/fixture';folder.mkdir(parents=True);(folder/'model.json').write_text(json.dumps(self.model));(folder/'model.gguf').write_bytes(self.data)
        (self.root/'runtime-files.json').write_text(json.dumps({x.name:p.sha(x) for x in runtime.iterdir()}))

    def snapshot(self):
        return {str(x.relative_to(self.root)):x.read_bytes() for x in self.root.rglob('*') if x.is_file()}

    def test_inventory_is_read_only_and_does_not_acquire_or_execute(self):
        before=self.snapshot();result=p.cached_operation(self.model,self.dist)
        self.assertEqual(result['state'],'verified');self.assertFalse(result['downloads']);self.assertEqual(before,self.snapshot())
        self.run.assert_not_called();self.fetch.assert_not_called()

    def test_missing_mismatch_symlink_unknown_never_downloads(self):
        model=self.root/'models/fixture/model.gguf'
        for kind in ['missing','mismatch','symlink']:
            model.unlink(missing_ok=True)
            if kind=='mismatch':model.write_bytes(b'GGUF'+b'y'*1020)
            elif kind=='symlink':model.symlink_to(self.dist/'runtime.tar.gz')
            with self.assertRaises((ValueError,FileNotFoundError)):p.cached_operation(self.model,self.dist)
        self.fetch.assert_not_called();self.run.assert_not_called()
        with self.assertRaises((ValueError,FileNotFoundError)):p.cached_operation({**self.model,'id':'unknown'},self.dist)

    def test_runtime_archive_file_manifest_worker_or_dependency_failure_has_no_repair(self):
        for path in [self.dist/'runtime.tar.gz',self.root/'runtime/fixture/llama-cli',self.root/'runtime-files.json',self.root/'worker.py']:
            original=path.read_bytes();path.write_bytes(b'changed')
            with self.assertRaises((ValueError,json.JSONDecodeError)):p.cached_operation(self.model,self.dist)
            path.write_bytes(original)
        self.cdll.side_effect=OSError('missing libgomp')
        with self.assertRaises(OSError):p.cached_operation(self.model,self.dist)
        self.run.assert_not_called();self.fetch.assert_not_called()

    def test_cache_inventory_main_never_falls_through_to_install_or_download(self):
        import types
        stdin=types.SimpleNamespace(buffer=io.BytesIO(json.dumps(self.model).encode()))
        with patch.object(p.sys,'platform','linux'),patch.object(p.os,'uname') as uname,patch.object(p.sys,'stdin',stdin),patch.object(p.sys,'argv',['prepare-pixel.py','--cache-inventory']),patch.dict(p.os.environ,{'SKY_PIXEL_DISTRIBUTION':str(self.dist)}),patch.object(p,'acquire',side_effect=AssertionError('No acquire')),patch.object(p,'extract',side_effect=AssertionError('No extraction')):
            uname.return_value.machine='aarch64';result=p.main()
        self.assertEqual(result['state'],'verified');self.run.assert_not_called();self.fetch.assert_not_called()

    def test_prepare_only_runs_verified_version_check_and_never_changes_originals(self):
        before=self.snapshot();self.run.side_effect=None;self.run.return_value.returncode=0;self.run.return_value.stdout=json.dumps({'schema':'rockstaros.linux-text-capability/1','protocol':1,'platform':'linux','architecture':'aarch64'})
        original_read=Path.read_text
        def proc_read(path,*args,**kwargs):
            if str(path)=='/proc/meminfo':return 'MemTotal: 8388608 kB\n'
            if str(path)=='/proc/sys/kernel/random/boot_id':return '11111111-2222-4333-8444-555555555555'
            return original_read(path,*args,**kwargs)
        with patch.object(p.os,'uname') as uname,patch.object(p.sys,'platform','linux'),patch.object(Path,'read_text',proc_read):
            uname.return_value.machine='aarch64';result=p.cached_operation(self.model,self.dist,True)
        self.assertTrue(result['ready']);self.assertEqual(before,self.snapshot());self.assertEqual(self.run.call_count,2)
        args=self.run.call_args_list[0].args[0];self.assertEqual(args,[str(self.root/'runtime/fixture/llama-cli'),'--version'])
        self.assertNotIn('shell',self.run.call_args.kwargs);self.fetch.assert_not_called()

if __name__=='__main__':unittest.main()
