import unittest
from model_output import allowed_output

class ModelOutputTests(unittest.TestCase):
    def test_explicit_internal_reasoning_is_not_saved(self):
        value,excluded=allowed_output('<think>private internal steps</think>{"action":"respond"}')
        self.assertTrue(excluded);self.assertNotIn('private internal steps',value);self.assertIn('{"action":"respond"}',value)
    def test_unclosed_reasoning_suffix_cannot_become_final_output(self):
        value,excluded=allowed_output('<analysis>private internal steps {"action":"tool"}')
        self.assertTrue(excluded);self.assertNotIn('"action"',value)
        self.assertEqual(allowed_output('{"message":"short answer"}'),('{"message":"short answer"}',False))

if __name__=='__main__':unittest.main()
