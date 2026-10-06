"""Bounded CPU pretraining. Corpus is explicit JSONL; no network or pretrained model."""
import argparse
from dataclasses import asdict
import hashlib
import json
import math
from pathlib import Path
import time
import unicodedata

import torch
from torch.nn import functional as F
from model import BOS, EOS, Config, LanguageModel, encode, load_model


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_corpus(path, context):
    raw = Path(path).read_bytes()
    if len(raw) > 2_000_000:
        raise ValueError('prototype corpus limit is 2 MB')
    splits = {'train': [], 'validation': []}
    seen_ids, seen_text = set(), set()
    counts = {key: 0 for key in splits}
    for line in raw.decode('utf-8').splitlines():
        row = json.loads(line)
        if (not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'] or
            not isinstance(row.get('text'), str) or not row['text'].strip() or
            not isinstance(row.get('source'), str) or not row['source'].strip() or
            row.get('split') not in splits or row.get('permission') != 'synthetic_fixture_only'):
            raise ValueError('only documented synthetic fixtures accepted in this prototype')
        normalized = ' '.join(unicodedata.normalize('NFKC', row['text']).split())
        if row['id'] in seen_ids or normalized in seen_text:
            raise ValueError('duplicate ID or normalized text; split leakage rejected')
        seen_ids.add(row['id']); seen_text.add(normalized)
        splits[row['split']] += [BOS] + encode(row['text']) + [EOS]
        counts[row['split']] += 1
    if any(len(s) <= context for s in splits.values()):
        raise ValueError('train and validation must each exceed context length')
    return {k: torch.tensor(v, dtype=torch.long) for k, v in splits.items()}, counts


@torch.no_grad()
def evaluate(model, tokens):
    model.eval()
    context = model.config.context
    total, count = 0., 0
    for start in range(0, len(tokens)-1, context):
        n = min(context, len(tokens)-1-start)
        logits = model(tokens[start:start+n].unsqueeze(0))
        total += float(F.cross_entropy(logits[0], tokens[start+1:start+n+1], reduction='sum'))
        count += n
    return total / count


def train(corpus, output, steps=100, seed=41, batch=8, config=Config(), resume=None):
    if type(steps) is not int or not 1 <= steps <= 2000 or not 1 <= batch <= 16:
        raise ValueError('bounded run requires 1..2000 additional steps and batch 1..16')
    output = Path(output)
    if output.exists():
        raise ValueError('output must be a new directory; existing artifacts are immutable')
    torch.set_num_threads(2)
    torch.manual_seed(seed)
    tokens, counts = read_corpus(corpus, config.context)
    corpus_sha = sha(corpus)
    start, parent = 0, None
    if resume:
        model, data = load_model(resume)
        if data['config'] != asdict(config) or data['corpus_sha256'] != corpus_sha or data['batch'] != batch:
            raise ValueError('resume config/corpus/batch mismatch')
        start, parent = data['steps'], sha(resume)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.003)
        optimizer.load_state_dict(data['optimizer'])
        torch.set_rng_state(data['rng'])
    else:
        model = LanguageModel(config)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.003)
    before = {k: evaluate(model, v) for k, v in tokens.items()}
    started = time.monotonic()
    model.train()
    for _ in range(steps):
        starts = torch.randint(len(tokens['train'])-config.context, (batch,))
        x = torch.stack([tokens['train'][i:i+config.context] for i in starts])
        y = torch.stack([tokens['train'][i+1:i+config.context+1] for i in starts])
        optimizer.zero_grad(set_to_none=True)
        logits = model(x)
        loss = F.cross_entropy(logits.flatten(0, 1), y.flatten())
        if not torch.isfinite(loss):
            raise ValueError('non-finite loss; no artifact published')
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
        optimizer.step()
    after = {k: evaluate(model, v) for k, v in tokens.items()}
    if not all(math.isfinite(v) for v in after.values()):
        raise ValueError('non-finite evaluation; no artifact published')
    output.mkdir(parents=True)
    checkpoint = output / 'checkpoint.pt'
    torch.save({'format': 'avokado-byte-lm/1', 'initialization': 'random',
                'config': asdict(config), 'model': model.state_dict(), 'optimizer': optimizer.state_dict(),
                'rng': torch.get_rng_state(), 'steps': start+steps, 'batch': batch,
                'corpus_sha256': corpus_sha}, checkpoint)
    report = {'format': 'avokado-pretraining-report/1', 'research_only': True, 'production_ready': False,
              'initialization': 'random', 'pretrained_weights_used': False, 'runtime': 'host_cpu',
              'device_accepted': False, 'cloud_deployed': False, 'additional_paid_compute': 0,
              'config': asdict(config), 'parameters': sum(p.numel() for p in model.parameters()),
              'torch': str(torch.__version__), 'seed': seed if not resume else None, 'records': counts,
              'corpus_sha256': corpus_sha, 'checkpoint_sha256': sha(checkpoint),
              'parent_checkpoint_sha256': parent, 'total_steps': start+steps, 'run_steps': steps,
              'run_tokens': steps*batch*config.context, 'unique_split_tokens': {k: len(v) for k,v in tokens.items()},
              'loss_before': before, 'loss_after': after, 'seconds': round(time.monotonic()-started, 3),
              'limits': ['Synthetic fixture metrics only; no general language, product knowledge or safety acceptance.',
                         'UTF-8 byte tokenizer may generate invalid UTF-8, decoded with replacement characters.',
                         'No Android/GGUF export, Mini physical acceptance or cloud deployment.']}
    (output / 'report.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--corpus', type=Path, default=Path(__file__).with_name('fixture.jsonl'))
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--steps', type=int, default=100)
    p.add_argument('--resume', type=Path)
    a = p.parse_args()
    print(json.dumps(train(a.corpus, a.output, a.steps, resume=a.resume), indent=2))
