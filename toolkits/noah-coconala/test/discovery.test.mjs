import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('discovery binds public links, a matching open listing and observed order rate before drafting', () => {
  const script = `
import read_only as r
from unittest.mock import patch

def card(href):
    return '<div class="c-searchItem"><div class="c-itemInfo_title"><a href="'+href+'">表作成</a></div><div class="c-itemTileContent_inner-remainingDays">あと3日</div></div>'

board=card('/requests/52')+card('https://other.example/requests/77')+card('/requests/51/send')
assert list(r.board_cards(board)) == ['52']
detail='<h1>表作成</h1><div class="c-requestOutlineRow"><b class="c-requestOutlineRow_heading">募集期限</b>あと3日</div><div class="c-detailRowContentText">表を作成します。</div><div class="c-infoRequesterTableColumn"><b class="c-infoRequesterTableColumn_heading">発注率</b><i class="c-infoRequesterTableColumn_body">90%</i></div>'
assert r.detail(detail, '別のタイトル') is None
assert r.detail(detail.replace('あと3日','終了'), '表作成') is None
assert r.detail(detail.replace('90%', '不明'), '表作成') is None
assert r.detail(detail, '表作成')[1] == 90
with patch.object(r, 'public_page', side_effect=lambda i=None: board if i is None else detail), patch.object(r,'generate',return_value=[{'request_id':'99','business_class':'submit_required','proposal_text':'提案' * 50,'reason':'別の案件です'}]):
    assert r.run(set(),0) == {'scanned':1,'drafts':[]}
with patch.object(r.http, 'open') as conn:
    for value in ['123/apply','/messages','//other.example','-1','0']:
        try: r.public_page(value)
        except ValueError: continue
        raise AssertionError(value)
    assert not conn.called
`;
  assert.doesNotThrow(() =>
    execFileSync('python3', ['-B', '-c', script], {
      cwd: fileURLToPath(new URL('../anicca/', import.meta.url)),
    }),
  );
});
