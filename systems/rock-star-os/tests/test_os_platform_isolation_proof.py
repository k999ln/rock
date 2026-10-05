"""Scoped guest entry/proof guards; synthetic tests are not guest acceptance."""
import ast
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('platform_isolation_proof',Path(__file__).resolve().parents[1]/'os/verify-platform.py')
host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)


class ScopedProof(unittest.TestCase):
    def setUp(self):
        self.value={'schema':'rock-os-platform-isolation/1','status':'PASS_SCOPED','scope':'game-isolation',
            'checks':['actual peer boundary'],'wallet_financial_assertions':'NOT_RUN; separate online acceptance'}
    def raw(self): return json.dumps(self.value)
    def log(self): return 'ROCK_PLATFORM_ISOLATION_GUEST_PASS '+self.raw()+'\n'
    def test_live_and_stopped_scoped_proofs_match(self): self.assertEqual(self.value,host.scoped_proof(self.log(),self.raw()))
    def test_legacy_or_duplicate_marker_is_rejected(self):
        for log in ('ROCK_PLATFORM_GUEST_PASS '+self.raw(),self.log()*2):
            with self.subTest(log=log),self.assertRaisesRegex(RuntimeError,'exactly one'):host.scoped_proof(log,self.raw())
    def test_financial_pass_cannot_be_inferred_from_partial_proof(self):
        for field,value in (('status','PASS'),('scope','local-full'),('wallet_financial_assertions','PASS'),('checks',[])):
            old=self.value[field];self.value[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'scoped'):host.scoped_proof(self.log(),self.raw())
            self.value[field]=old
    def test_stopped_record_must_equal_observed_serial(self):
        raw=self.raw();self.value['checks'].append('unobserved claim')
        with self.assertRaisesRegex(RuntimeError,'differs'):host.scoped_proof(self.log(),raw)


class FirstGuestEffect(Exception):
    """Stops the production entrypoint before any real command or IPC."""


class GuestEntryGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).resolve().parents[1] / 'os/platform/guest-test.py'
        tree = ast.parse(source.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in ('main', 'check')]
        if len(functions) != 2:
            raise AssertionError('expected production guest main and check functions')
        # Do not import guest-only service code or access a host /proc path.
        cls.entry_code = compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec')

    def invoke(self, cmdline, *, uid=0, machine='aarch64', read_error=None):
        reader = Mock(return_value=cmdline, side_effect=read_error)
        path = Mock(return_value=SimpleNamespace(read_text=reader))
        effects = {name: Mock(side_effect=FirstGuestEffect) for name in
                   ('subprocess', 'request', 'call', 'denied_as', 'owner_call', 'authenticate', 'chmod')}
        namespace = {'Path': path, 'checks': [],
                     'os': SimpleNamespace(geteuid=lambda: uid, uname=lambda: SimpleNamespace(machine=machine),
                                           chmod=effects['chmod']),
                     'subprocess': SimpleNamespace(run=effects['subprocess']),
                     **{name: effects[name] for name in ('request', 'call', 'denied_as', 'owner_call', 'authenticate')}}
        exec(self.entry_code, namespace)
        output, caught, selected_scope = io.StringIO(), None, None
        try:
            with redirect_stdout(output):
                namespace['main']()
        except (ValueError, AssertionError, OSError, FirstGuestEffect) as error:
            caught = error
            trace = error.__traceback__
            while trace:
                if trace.tb_frame.f_code.co_name == 'main':
                    selected_scope = trace.tb_frame.f_locals.get('game_isolation')
                trace = trace.tb_next
        path.assert_called_once_with('/proc/cmdline')
        reader.assert_called_once_with()
        return caught, output.getvalue(), effects, selected_scope

    def assert_refused(self, cmdline, *, error_type=ValueError, **kwargs):
        error, output, effects, _ = self.invoke(cmdline, **kwargs)
        self.assertIsInstance(error, error_type)
        self.assertEqual(output, '')
        for effect in effects.values():
            effect.assert_not_called()

    def test_enable_flag_is_required_before_effects_or_pass_output(self):
        for cmdline in ('', 'console=ttyAMA0', 'rock.platform.verify', 'rock.platform.verify=',
                        'rock.platform.verify=0', 'rock.platform.verify=false', 'rock.platform.verify=true',
                        'rock.platform.verify=01', 'rock.platform.verify=2', 'rock.platform.verify==1',
                        'rock.platform.verify="1"', 'rock.platform.verify=1x', 'rock.platform.verify =1',
                        'rock.platform.verify= 1', 'rock.platform.verify\x001'):
            with self.subTest(cmdline=cmdline):
                self.assert_refused(cmdline)

    def test_duplicate_conflicting_or_bare_enable_tokens_fail_closed(self):
        for suffix in ('rock.platform.verify=1', 'rock.platform.verify=0', 'rock.platform.verify=',
                       'rock.platform.verify=false', 'rock.platform.verify', 'rock.platform.verify==1'):
            for cmdline in ('rock.platform.verify=1 ' + suffix, suffix + ' rock.platform.verify=1'):
                with self.subTest(cmdline=cmdline):
                    self.assert_refused(cmdline)

    def test_scope_token_does_not_enable_direct_invocation(self):
        for prefix in ('', 'rock.platform.verify=0 '):
            with self.subTest(prefix=prefix):
                self.assert_refused(prefix + 'rock.platform.verify_scope=game-isolation')

    def test_existing_scope_validation_precedes_effects_or_pass_output(self):
        for scope in ('rock.platform.verify_scope=', 'rock.platform.verify_scope=unknown',
                      'rock.platform.verify_scope=local-full',
                      'rock.platform.verify_scope=game-isolation rock.platform.verify_scope=game-isolation',
                      'rock.platform.verify_scope=game-isolation rock.platform.verify_scope=other'):
            with self.subTest(scope=scope):
                self.assert_refused('rock.platform.verify=1 ' + scope)

    def test_one_exact_flag_preserves_default_and_game_isolation_scopes(self):
        for cmdline, expected_scope in (
            ('console=ttyAMA0 rock.platform.verify=1 root=/dev/vda', False),
            ('rock.platform.verify=1 rock.platform.verify_scope=game-isolation', True),
            ('rock.platform.verify_scope=game-isolation\trock.platform.verify=1\n', True),
        ):
            with self.subTest(scope=expected_scope):
                error, output, effects, selected_scope = self.invoke(cmdline)
                self.assertIsInstance(error, FirstGuestEffect)
                self.assertIs(selected_scope, expected_scope)
                self.assertEqual(output, 'PASS root test orchestrator in actual ARM64 guest\n')
                effects['subprocess'].assert_called_once_with(
                    ['/usr/bin/python3', '-I', '-B', '/usr/lib/rock-platform/guest-inventory.py'],
                    capture_output=True, timeout=10)
                for name, effect in effects.items():
                    if name != 'subprocess':
                        effect.assert_not_called()

    def test_root_and_arm64_guards_remain_required(self):
        for uid, machine in ((1000, 'aarch64'), (0, 'x86_64'), (1000, 'x86_64')):
            with self.subTest(uid=uid, machine=machine):
                self.assert_refused('rock.platform.verify=1', uid=uid, machine=machine, error_type=AssertionError)

    def test_unreadable_boot_arguments_cannot_reach_effects_or_pass_output(self):
        self.assert_refused('', read_error=OSError('synthetic unreadable boot arguments'), error_type=OSError)


if __name__=='__main__':unittest.main()
