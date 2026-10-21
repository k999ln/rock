import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import torch
from model import Config, LanguageModel, decode, encode, load_model
from train import read_corpus, train
from infer import handler_for

FIXTURE = Path(__file__).with_name('fixture.jsonl')


class PretrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_unicode_tokenizer_roundtrip(self):
        for text in ['MiniとPro', '🥑\n許可', '\x00abc']:
            self.assertEqual(decode(encode(text)), text)

    def test_attention_cannot_see_future_tokens(self):
        torch.manual_seed(7)
        model = LanguageModel(Config(width=16, layers=1, heads=2, context=16)).eval()
        a = torch.tensor([[257, 1, 2, 3, 4]])
        b = torch.tensor([[257, 1, 2, 99, 88]])
        with torch.no_grad():
            torch.testing.assert_close(model(a)[:, :3], model(b)[:, :3], rtol=0, atol=1e-6)
            self.assertFalse(torch.equal(model(a)[:, 3:], model(b)[:, 3:]))

    def test_corpus_rejects_leakage_and_unapproved_data(self):
        rows = [json.loads(x) for x in FIXTURE.read_text().splitlines()]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/'bad.jsonl'
            for changes in [dict(text=rows[0]['text']), dict(permission='unknown'), dict(source='')]:
                bad = [*rows, {**rows[1], 'id': 'extra', **changes}]
                path.write_text('\n'.join(json.dumps(r) for r in bad))
                with self.assertRaises(ValueError):
                    read_corpus(path, 16)

    def test_real_learning_reload_and_exact_resume(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            config = Config(width=32, layers=1, heads=2, context=32)
            initial = train(FIXTURE, root/'first', 30, config=config)
            self.assertLess(initial['loss_after']['train'], initial['loss_before']['train'])
            self.assertLess(initial['loss_after']['validation'], initial['loss_before']['validation'])
            train(FIXTURE, root/'resumed', 10, config=config, resume=root/'first/checkpoint.pt')
            train(FIXTURE, root/'whole', 40, config=config)
            resumed, _ = load_model(root/'resumed/checkpoint.pt')
            whole, _ = load_model(root/'whole/checkpoint.pt')
            for key, value in whole.state_dict().items():
                torch.testing.assert_close(resumed.state_dict()[key], value, rtol=0, atol=0)
            self.assertEqual(resumed.generate('Mini', 8), whole.generate('Mini', 8))
            with self.assertRaises(ValueError):
                train(FIXTURE, root/'first', 1, config=config)
            with self.assertRaises(ValueError):
                train(FIXTURE, root/'bad', 1, config=Config(), resume=root/'first/checkpoint.pt')
            changed = root/'changed.jsonl'
            changed.write_text(FIXTURE.read_text()+'\n')
            with self.assertRaises(ValueError):
                train(changed, root/'bad', 1, config=config, resume=root/'first/checkpoint.pt')

    def test_generation_limits(self):
        model = LanguageModel(Config(width=16, layers=1, heads=2, context=16))
        for prompt, maximum in [('x'*16, 1), ('x', 0), ('x', 257), ('x', True), (None, 1)]:
            with self.assertRaises(ValueError):
                model.generate(prompt, maximum)
        with self.assertRaises(ValueError):
            Config(width=17, heads=4)

    def test_loopback_api_matches_cli_and_rejects_invalid_requests(self):
        model = LanguageModel(Config(width=16, layers=1, heads=2, context=16)).eval()
        server = HTTPServer(('127.0.0.1', 0), handler_for(model))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{server.server_port}'
        def request(body, headers=None):
            return urlopen(Request(url+'/generate', data=json.dumps(body).encode(),
                                   headers=headers or {'Content-Type': 'application/json'}), timeout=5)
        try:
            with urlopen(url+'/health') as response:
                self.assertFalse(json.load(response)['production_ready'])
            with request({'prompt': 'Mini', 'max_new': 4}) as response:
                result = json.load(response)
                self.assertEqual(result['text'], model.generate('Mini', 4))
                self.assertEqual(result['authority'], 'none')
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
            for body, headers, status in [
                ({'prompt':'x'*20}, None, 400),
                ({'prompt':'x','tool':'shell'}, None, 400),
                ({'prompt':'x'}, {'Content-Type':'text/plain'}, 415),
                ({'prompt':'x'}, {'Content-Type':'application/json', 'Origin':'https://example.com'}, 403),
                ({'prompt':'x'*5000}, None, 413),
            ]:
                with self.assertRaises(HTTPError) as error:
                    request(body, headers)
                self.assertEqual(error.exception.code, status)
                error.exception.close()
        finally:
            server.shutdown(); thread.join(); server.server_close()


if __name__ == '__main__':
    unittest.main()
