"""The expiry fixture must not consume clocks belonging to other threads."""
from contextlib import contextmanager
import io
import threading
import time
import unittest
from unittest.mock import patch
import test_contract_runtime_lifetime as lifetime


class ClockFixtureIsolation(unittest.TestCase):
    def test_unrelated_clock_reader_cannot_consume_expiry_fixture_values(self):
        ready, finished = threading.Event(), threading.Event()
        clock = time.monotonic
        observations = []
        def unrelated_reader():
            ready.wait()
            observations.append((time.monotonic is clock, time.monotonic()))
            finished.set()
        observer = threading.Thread(target=unrelated_reader)
        observer.start()
        original_patch = lifetime.patch
        def scheduled_patch(target, *args, **kwargs):
            if target not in ('wallet_backend.contract_runtime.time',
                              'wallet_backend.contract_runtime.time.monotonic'):
                return original_patch(target, *args, **kwargs)
            @contextmanager
            def scheduled():
                with original_patch(target, *args, **kwargs) as value:
                    # The existing test owns its clock double here. Force an
                    # unrelated real thread to read its clock before proceeding.
                    ready.set()
                    self.assertTrue(finished.wait(2))
                    yield value
            return scheduled()
        scheduled_patch.object = original_patch.object
        try:
            case = lifetime.RuntimeLifetimeTests('test_expiry_after_waiting_for_admission_never_dispatches')
            with patch.object(lifetime, 'patch', scheduled_patch):
                output = io.StringIO()
                result = unittest.TextTestRunner(stream=output).run(case)
        finally:
            ready.set()
            observer.join(2)
        self.assertFalse(observer.is_alive())
        self.assertTrue(result.wasSuccessful(), output.getvalue())
        self.assertEqual(len(observations), 1)
        self.assertTrue(observations[0][0], 'Fixture changed the unrelated thread clock')
        self.assertIs(time.monotonic, clock)


if __name__ == '__main__':
    unittest.main()
