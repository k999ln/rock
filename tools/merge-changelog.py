"""CHANGELOG.md の merge のぶつかりを直す。

枝に main を merge した時に使う。枝の行（ours）を先に、main の新しい行（theirs）を後に置き、両方を残す。
CHANGELOG.md 以外のファイルがぶつかった時は使わない（止めて報告する）。
"""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'CHANGELOG.md'
text = open(path, encoding='utf-8').read()


def keep_both(match):
    ours, theirs = match.group(1), match.group(2)
    ours_lines = set(ours.split('\n'))
    extra = ''.join(line + '\n' for line in theirs.split('\n') if line and line not in ours_lines)
    return ours + extra


text, count = re.subn(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', keep_both, text, flags=re.S)
if '<<<<<<<' in text or '>>>>>>>' in text or '\n=======\n' in text:
    raise SystemExit('conflict markers remain')
open(path, 'w', encoding='utf-8').write(text)
print(f'{count} conflict hunks resolved in {path}')
