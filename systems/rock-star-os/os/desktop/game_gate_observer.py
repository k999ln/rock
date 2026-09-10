"""Bind an unchanged Game authority to one fixed nonfinancial guest gate."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'src'), str(ROOT/'os'), str(ROOT/'os/desktop'), str(ROOT/'os/platform')]
import game_authority_observer as authority
import verification_scope


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    path.write_bytes(authority.canonical(value)+b'\n')


class Gate:
    def __init__(self, images, output, sources, limits):
        from game_exchange import profile
        self.images, self.output = Path(images), Path(output)
        self.config = profile.device_config(self.images, 'game-isolation-gate')
        binding = profile.verified(self.config)
        self.files = {name:sha(self.images/name) for name in ('Image','rootfs.ext4','stage0.cpio.gz','profile.json','freeze-manifest.json')}
        freeze = json.loads((self.images/'freeze-manifest.json').read_text())
        profile_record = json.loads((self.images/'profile.json').read_text())
        authority.require(freeze.get('schema') == 'rock-build-freeze/2' and freeze.get('status') == 'BUILD_COMPLETE_FROZEN' and
            freeze.get('files_sha256') == {key:self.files[key] for key in ('Image','rootfs.ext4','stage0.cpio.gz')} and
            freeze.get('source_commit') == profile_record.get('source_commit') and
            freeze.get('profile_derivation',{}).get('profile_sha256') == self.files['profile.json'],
            'complete same-source frozen Game image required')
        names = set(sources) | {'os/desktop/game_gate_observer.py','os/desktop/game_authority_observer.py',
            'os/platform/verification_scope.py','os/game_exchange/profile.py'}
        self.sources = {name:sha(ROOT/name) for name in sorted(names)}
        # The guest helper is part of this frozen source and must match bytes.
        for name in names & {'os/platform/verification_scope.py','os/platform/store-guest-test.py','os/platform/remote-guest-test.py'}:
            helper = profile.base._debug(self.images/'rootfs.ext4', 'cat /usr/lib/rock-platform/'+Path(name).name).stdout
            authority.require(helper == (ROOT/name).read_bytes(), 'embedded guest scope source differs: '+name)
        self.observer = authority.Observer(ROOT/'os/game_exchange/sandbox.py',self.config['game']['config'],self.config['game']['authority_id'],self.output)
        authority.require(self.observer.input_hashes['sandbox_config_sha256'] == self.config['game']['sha256'], 'fixed authority configuration differs')
        self.before = self.observer.invoke('snapshot')  # refuses any running writer; never stops another task
        save(self.output/'game-authority-before.json',self.before)
        self.plan = {'schema':'rock-game-isolation-gate/1','scope':'game-isolation','source_commit':freeze['source_commit'],
            'image_files_sha256':self.files,'sources_sha256':self.sources,'profile_binding':binding,
            'authority_observer':self.observer.input_hashes,'authority_before_sha256':sha(self.output/'game-authority-before.json'),
            'limits':limits,'guest_wallet_financial_assertions':'NOT_RUN',
            'external_comparison':'every typed table, schema, intrinsic rowid, pragma and protected identity exactly unchanged',
            'authority_lifecycle':'STOPPED throughout; no start, stop, registration, credit or financial request from this gate'}
        save(self.output/'game-scope-plan.json',self.plan);(self.output/'game-scope-plan.json').chmod(0o444)
        self.plan_sha = sha(self.output/'game-scope-plan.json')

    def proof(self, proof):
        verification_scope.validate_game_proof(proof)

    def finish(self):
        authority.require(sha(self.output/'game-scope-plan.json') == self.plan_sha, 'fixed Game gate plan changed')
        authority.require(sha(self.output/'game-authority-before.json') == self.plan['authority_before_sha256'],
                          'fixed authority baseline evidence changed')
        authority.require({name:sha(self.images/name) for name in self.files} == self.files, 'Game input image changed')
        authority.require({name:sha(ROOT/name) for name in self.sources} == self.sources, 'Game gate observer source changed')
        after = self.observer.invoke('snapshot');save(self.output/'game-authority-after.json',after)
        authority.unchanged(self.before, after)
        return {'status':'PASS_SCOPED','plan_sha256':self.plan_sha,'authority':'ALL_TYPED_STATE_IDENTICAL_STOPPED',
                'before_sha256':sha(self.output/'game-authority-before.json'),'after_sha256':sha(self.output/'game-authority-after.json'),
                'guest_financial_assertions':'NOT_RUN'}
