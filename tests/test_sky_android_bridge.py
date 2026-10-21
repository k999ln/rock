import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('pixel_bridge', Path(__file__).resolve().parents[1] / 'toolkits/sky-linux-local/android-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class PixelBridgeBoundaryTests(unittest.TestCase):
    def test_only_the_private_default_gateway_is_used(self):
        route = 'Iface Destination Gateway Flags\nenp0s13 00000000 C0F3B30A 0003\n'
        with patch.object(Path, 'read_text', return_value=route):
            self.assertEqual(bridge.gateway(), '10.179.243.192')
        for row in ['enp0s13 00000000 08080808 0003', 'enp0s13 00000000 0100007F 0003', 'enp0s13 00000000 C0F3B30A 0001']:
            with patch.object(Path, 'read_text', return_value='header\n' + row):
                with self.assertRaises(ValueError):
                    bridge.gateway()

    def test_proxy_environment_cannot_move_local_calls_to_a_remote_host(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"schema":"sky.private-linux-deployment/1"}'
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(bridge.urllib.request, 'build_opener', return_value=opener) as create:
            self.assertEqual(bridge.request({'action': 'status'})['schema'], 'sky.private-linux-deployment/1')
            self.assertEqual(create.call_args.args[0].proxies, {})
            request = opener.open.call_args.args[0]
            self.assertEqual(request.full_url, 'http://127.0.0.1:5199/__sky/linux')
            self.assertEqual(request.get_header('Origin'), 'http://127.0.0.1:5199')
            self.assertEqual(json.loads(request.data), {'action': 'status'})

    def test_oversized_input_never_reaches_the_local_api(self):
        with patch.object(bridge.urllib.request, 'build_opener') as create:
            with self.assertRaises(ValueError):
                bridge.request({'input': 'x' * 32000})
            create.assert_not_called()

    def test_oversized_results_are_rejected(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'x' * (bridge.LIMIT + 1)
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(bridge.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(ValueError):
                bridge.request({'action': 'status'})


if __name__ == '__main__':
    unittest.main()
