"""Small random-initialized causal language model. Research only, no tool authority."""
from dataclasses import asdict, dataclass
import torch
from torch import nn

BOS, EOS, VOCAB = 257, 256, 258


def encode(text):
    return list(text.encode('utf-8'))


def decode(tokens):
    return bytes(t for t in tokens if 0 <= t < 256).decode('utf-8', errors='replace')


@dataclass(frozen=True)
class Config:
    width: int = 64
    layers: int = 2
    heads: int = 4
    context: int = 128

    def __post_init__(self):
        if not (16 <= self.width <= 128 and 1 <= self.layers <= 4 and
                1 <= self.heads <= 8 and self.width % self.heads == 0 and
                16 <= self.context <= 256):
            raise ValueError('prototype model limits exceeded')


class Block(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.norm1 = nn.LayerNorm(c.width)
        self.attention = nn.MultiheadAttention(c.width, c.heads, batch_first=True, dropout=0)
        self.norm2 = nn.LayerNorm(c.width)
        self.mlp = nn.Sequential(nn.Linear(c.width, 4*c.width), nn.GELU(), nn.Linear(4*c.width, c.width))

    def forward(self, x, mask):
        n = self.norm1(x)
        x = x + self.attention(n, n, n, attn_mask=mask, need_weights=False)[0]
        return x + self.mlp(self.norm2(x))


class LanguageModel(nn.Module):
    def __init__(self, config=Config()):
        super().__init__()
        self.config = config
        self.tokens = nn.Embedding(VOCAB, config.width)
        self.positions = nn.Embedding(config.context, config.width)
        self.blocks = nn.ModuleList([Block(config) for _ in range(config.layers)])
        self.norm = nn.LayerNorm(config.width)
        self.output = nn.Linear(config.width, VOCAB, bias=False)
        self.output.weight = self.tokens.weight
        self.apply(self._initialize)

    @staticmethod
    def _initialize(module):
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, mean=0, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(self, ids):
        length = ids.shape[1]
        if not 1 <= length <= self.config.context:
            raise ValueError('context length exceeded')
        x = self.tokens(ids) + self.positions(torch.arange(length, device=ids.device))
        mask = torch.ones(length, length, device=ids.device, dtype=torch.bool).triu(1)
        for block in self.blocks:
            x = block(x, mask)
        return self.output(self.norm(x))

    @torch.no_grad()
    def generate(self, prompt, max_new=64):
        if not isinstance(prompt, str) or len(encode(prompt)) > self.config.context-1:
            raise ValueError('prompt must fit the byte context')
        if type(max_new) is not int or not 1 <= max_new <= 256:
            raise ValueError('max_new must be 1..256')
        self.eval()
        ids = [BOS] + encode(prompt)
        generated = []
        for _ in range(max_new):
            logits = self(torch.tensor([ids[-self.config.context:]], dtype=torch.long))[0, -1].clone()
            logits[BOS] = -float('inf')
            token = int(logits.argmax())
            if token == EOS:
                break
            generated.append(token)
            ids.append(token)
        return decode(generated)


def load_model(path):
    data = torch.load(path, map_location='cpu', weights_only=True)
    if data.get('format') != 'avokado-byte-lm/1' or data.get('initialization') != 'random':
        raise ValueError('unsupported checkpoint')
    model = LanguageModel(Config(**data['config']))
    model.load_state_dict(data['model'], strict=True)
    model.eval()
    return model, data
