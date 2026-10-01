"""Scope refusals and retained typed cache data for real guest gate adapters."""
import copy
import importlib.util
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'src'),str(ROOT/'os'),str(ROOT/'os/platform'),str(ROOT/'os/desktop')]
import verification_scope as scope
import game_gate_observer as gate
from platform import machine  # stdlib must remain accessible
spec=importlib.util.spec_from_file_location('game_hub_fault_scope',ROOT/'os/platform/hub_fault_fixture.py')
fault=importlib.util.module_from_spec(spec);spec.loader.exec_module(fault)


class GameVerifierScope(unittest.TestCase):
    def test_default_local_and_one_exact_explicit_flag(self):
        self.assertEqual(scope.scope('quiet','rock.test.scope'),'local-full')
        self.assertEqual(scope.scope('quiet rock.test.scope=game-isolation','rock.test.scope'),'game-isolation')
        for value in ('rock.test.scope=unknown','rock.test.scope=',
                      'rock.test.scope=game-isolation rock.test.scope=game-isolation',
                      'rock.test.scope=local-full rock.test.scope=game-isolation'):
            with self.subTest(value=value),self.assertRaises(ValueError):scope.scope(value,'rock.test.scope')

    def test_unavailable_is_never_zero_or_a_financial_equality_proof(self):
        with self.assertRaises(ValueError):scope.wallet(None,'local-full')
        result=scope.wallet(None,'game-isolation')
        self.assertEqual(result['financial_assertions'],'NOT_RUN');self.assertIsNone(result['state_sha256'])
        for value in ({'available_minor':0},{},False,0):
            with self.subTest(value=value),self.assertRaises(ValueError):scope.wallet(value,'game-isolation')
        scope.unchanged(result,None,'game-isolation')
        with self.assertRaises(ValueError):scope.unchanged(result,{'available_minor':0},'game-isolation')

    def test_local_financial_changes_and_scope_changes_are_rejected(self):
        before=scope.wallet({'available_minor':0,'ledger':[]},'local-full')
        scope.unchanged(before,{'ledger':[],'available_minor':0},'local-full')
        for value in ({'available_minor':1,'ledger':[]},{'available_minor':0,'ledger':[1]},None):
            with self.subTest(value=value),self.assertRaises(ValueError):scope.unchanged(before,value,'local-full')
        with self.assertRaises(ValueError):scope.unchanged(before,None,'game-isolation')

    def test_guest_proof_cannot_omit_scope_or_overclaim_financial_acceptance(self):
        proof={'verification_scope':'game-isolation','wallet':'NOT_RUN','wallet_observation':scope.wallet(None,'game-isolation')}
        scope.validate_game_proof(proof)
        mutations=[]
        for key in proof:
            value=copy.deepcopy(proof);del value[key];mutations.append(value)
        value=copy.deepcopy(proof);value['wallet']='SIMULATOR_ONLY';mutations.append(value)
        value=copy.deepcopy(proof);value['wallet_observation']['state_sha256']='0'*64;mutations.append(value)
        for value in mutations:
            with self.subTest(value=value),self.assertRaises(ValueError):scope.validate_game_proof(value)

    def test_game_fault_cache_covers_every_table_and_forbids_local_authority(self):
        with tempfile.TemporaryDirectory() as raw:
            directory=Path(raw)
            for name in fault.GAME_DATABASES:
                path=directory/name;path.parent.mkdir(parents=True,exist_ok=True)
                db=sqlite3.connect(path)
                try:
                    db.execute('CREATE TABLE identity(value TEXT)');db.execute("INSERT INTO identity VALUES('fixed')")
                    db.execute('CREATE TABLE future_journal(value TEXT)');db.commit()
                finally:db.close()
            before=fault.wallet_state(directory,'game-isolation')
            self.assertEqual(before,fault.wallet_state(directory,'game-isolation'))
            db=sqlite3.connect(directory/fault.GAME_DATABASES[2])
            try:db.execute("INSERT INTO future_journal VALUES('new')");db.commit()
            finally:db.close()
            self.assertNotEqual(before,fault.wallet_state(directory,'game-isolation'))
            (directory/'wallet-simulator.db').touch()
            with self.assertRaisesRegex(ValueError,'local authoritative'):fault.wallet_state(directory,'game-isolation')

    def test_gate_finish_requires_original_plan_inputs_and_complete_authority(self):
        with tempfile.TemporaryDirectory() as raw:
            directory=Path(raw);images=directory/'images';images.mkdir();output=directory/'output';output.mkdir()
            (images/'Image').write_bytes(b'kernel');(output/'game-scope-plan.json').write_bytes(b'plan')
            before={'schema':'all','tables':{'future':{'row':'exact'}},'identities':{'epoch':1}}
            gate.save(output/'game-authority-before.json',before)
            observed=object.__new__(gate.Gate);observed.images=images;observed.output=output
            observed.files={'Image':gate.sha(images/'Image')};observed.sources={};observed.before=before
            observed.plan_sha=gate.sha(output/'game-scope-plan.json')
            observed.plan={'authority_before_sha256':gate.sha(output/'game-authority-before.json')}
            class Observer:
                def invoke(self,operation):
                    self.operation=operation;return copy.deepcopy(before)
            observed.observer=Observer();self.assertEqual(observed.finish()['authority'],'ALL_TYPED_STATE_IDENTICAL_STOPPED')
            self.assertEqual(observed.observer.operation,'snapshot')
            with patch.object(observed.observer,'invoke',return_value={**before,'unexpected_table':{}}):
                with self.assertRaisesRegex(ValueError,'changed'):observed.finish()
            (images/'Image').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'image changed'):observed.finish()
            (images/'Image').write_bytes(b'kernel');(output/'game-scope-plan.json').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'plan changed'):observed.finish()

    def test_embedded_helper_and_both_guest_modes_are_in_installation(self):
        install=(ROOT/'os/platform/install-target.sh').read_text()
        self.assertIn('verification_scope.py',install)
        for filename in ('store-guest-test.py','remote-guest-test.py'):
            source=(ROOT/'os/platform'/filename).read_text();compile(source,filename,'exec')
            self.assertIn('verification_scope.wallet(',source)
            self.assertIn("report['wallet']='NOT_RUN'",source)


if __name__=='__main__':unittest.main()
