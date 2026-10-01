import json,sys
from pathlib import Path
root=Path('/opt/rockstaros-preview/native');sys.path[:0]=[str(root/'os/desktop'),str(root/'os'),str(root/'src')]
import game_authority_observer as o
from game_exchange import sandbox
c=sandbox.load(Path('/var/tmp/rockstaros-preview-authority/sandbox.json'));s=sandbox.snapshot(c);o.validate(s,c['authority_id']);empty=o.empty_baseline(s)
for game in ('a','b'):
 tables={t['name']:t for t in s['databases']['game-'+game+'/game.sqlite3']['tables']}
 assert all(tables[n]['row_count']==0 for n in ('grant_decisions','asset_postings'))
print(json.dumps({'snapshot':s,'empty_baseline':empty},sort_keys=True))
