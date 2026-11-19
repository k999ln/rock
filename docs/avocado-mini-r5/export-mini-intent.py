from pathlib import Path
from argparse import ArgumentParser
import re

parser = ArgumentParser(description='Export the reviewed Mini idea Canvas to Markdown.')
parser.add_argument('canvas', type=Path)
args = parser.parse_args()
canvas = args.canvas
out = Path(__file__).with_name('mini-intent-1000-ideas.md')
s = canvas.read_text(encoding='utf-8')
group_src = s.split('const groups: Group[] = [', 1)[1].split('type Lens =', 1)[0]
lens_src = s.split('const lenses: Record<string, Lens> = {', 1)[1].split('type Bet =', 1)[0]
bet_src = s.split('const bets: Bet[] = [', 1)[1].split('const ideas:', 1)[0]
group_pat = r'    name: "([0-9]{2} [^"]+)",\n    stage: "([^"]+)",\n    lines: \[(.*?)\n    \]'
groups = []
for match in re.finditer(group_pat, group_src, re.S):
    name, stage, body = match.groups()
    rows = re.findall(r'^\s*"([^"\n|]+)\|([^"\n]+)",?$', body, re.M)
    assert len(rows) == 25, (name, len(rows))
    groups.append((name, stage, rows))
assert len(groups) == 40
fields = ('premise', 'evidence', 'handoff', 'limit', 'proof')
lenses = {}
for line in lens_src.splitlines():
    m = re.match(r'  "([0-9]{2} [^"]+)": \{ (.*) \},?$', line)
    if m:
        name, body = m.groups()
        lenses[name] = {f: re.search(r'\b' + f + r': "([^"]+)"', body).group(1) for f in fields}
assert set(lenses) == {g[0] for g in groups}
betfields = ('id','title','horizon','want','read','mini','whyMini','boundary','firstTest')
bets = []
for line in bet_src.splitlines():
    if line.lstrip().startswith('{ id: "'):
        bet = {f: re.search(r'\b' + f + r': "([^"]+)"', line).group(1) for f in betfields}
        bets.append(bet)
assert len(bets) == 20
titles = [title for _, _, rows in groups for title, _ in rows]
actions = [action for _, _, rows in groups for _, action in rows]
assert len(titles) == 1000 and len(set(titles)) == 1000
assert len(actions) == 1000 and len(set(actions)) == 1000

lines = [
'# Mini × Sky — 1,000の用途候補',
'',
'AvocadoMini R5と住宅CM30本の生活シーンから逆算した**提案集**。実装済み機能の一覧ではない。40領域×25件、計1,000件。前半12領域と最後の2領域の350件はゲーム、空間入力、仕事継続、携行、素材発明などMiniを中核に据え、残り650件は生活・創作・設備連携へ広げた。',
'',
'各案は「本人が何をしたいか → Miniと必要な外部機器がどう応えるか」で書いた。領域ごとに必要な手がかり、Sky/Zemaへの引き継ぎ、実行境界、最初の反証方法を付けた。優先20件にはスマホや既存の家電自動化との違いを説明する「Miniである理由」を追加した。',
'',
'**設計上の前提：** Mini R5は200mm以内の自律した着脱式coreを目指す設計段階。裸眼空間表示、精密3D入力、携行時の電池・WAN、直接衛星通信は実機で未検証。照度・温熱・水・設備位置などには現象の場所の外部センサーと実状態の応答が必要。部屋のセンサーだけで自由な思考は読めない。神経入力は任意の研究経路で、機器操作への許可は別に扱う。',
'',
'**設計の基点：** [製品基線とIP Studio](../product-baseline.md)、[R5設計](README.md)、[統合設計とセンサー/OS契約](package/integrated_design.md)、[ゲームの実行設計](game-runtime-design.md)、[着脱・携行・通信](embedded-portable-connectivity.md)、[RockstarOS・Sky・Zemaの全体設計](../rockstaros-avocado-mini-complete-design.md)、[Sky能力ルーティング](../sky-mcp-architecture.md)、[Material Invention Core](../material-invention-core.md)。住宅CMは /Users/kaiya/Documents/Codex/2026-10-13/new-chat/outputs/mini-kyoto-cm-design/blender-house/v3-researched-plan/camera_series_30.json を参照。映像上の動作を実機の証拠とは扱わない。',
'',
'**BCIの扱い：** EEGの想起発話やAIによる補助制御は限定タスクの研究段階であり、実環境の雑音と個人差がある。[限定語彙のEEG研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC13039726/)、[AI補助EEG-BCI研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC12599856/)、[実環境EEG評価](https://pubmed.ncbi.nlm.nih.gov/41406614/)を参照。手首[sEMG研究](https://www.nature.com/articles/s41586-025-09255-w)は筋活動からの入力であり、思考を直接読む技術ではない。',
'',
'## 優先する20の体験',
]
for b in bets:
    lines += [
        '',
        '### ' + b['id'] + ' ' + b['title'] + ' — ' + b['horizon'],
        '',
        '- 本人の願い：' + b['want'],
        '- 手がかり：' + b['read'],
        '- Mini × Sky × Zema：' + b['mini'],
        '- Miniである理由：' + b['whyMini'],
        '- 守る境界：' + b['boundary'],
        '- 初回実験：' + b['firstTest'],
    ]
lines += [
    '',
    '## まず通す4つの縦断実験',
    '',
    '1. **空間を編集する：** 一室の「この壁の反響」を対象特定、測定/未測定の区分、Sky案、Zema版、専門家相談まで進める。スマホと通常メモを比較対象にする。',
    '2. **粒子から素材の問いへ：** ゲームの結合を物質とは呼ばず、Material Invention Coreで物質ID・比率・工程・危険gate・証拠区分を一件通す。',
    '3. **同じ仕事を持ち運ぶ：** dock解除、別場所、再装着でjob IDを保ち、家の場所権限が漏れず、重複送信がないことを確認する。',
    '4. **思考に近いカーテン：** まず声/ボタンを基準に、起床文脈による候補と任意BCIの少数コマンドを比較。誤開幕、見逃し、取消時間、モーター実位置を測る。',
    '',
    '検証用の2D表示や外部センサーで価値と誤作動を先に試しても、R5の裸眼空間表示や携行hardwareの合格には読み替えない。',
    '',
    '## 40領域 × 25案',
]
n=1
for name, stage, rows in groups:
    lens=lenses[name]
    focus='Mini中核' if int(name[:2])<=12 or int(name[:2])>=39 else '生活・創作連携'
    lines += [
        '',
        '### ' + name + ' — ' + focus + ' / ' + stage,
        '',
        lens['premise'],
        '',
        '- 手がかり：' + lens['evidence'],
        '- Miniから先：' + lens['handoff'],
        '- 実行の境界：' + lens['limit'],
        '- 最初の証明：' + lens['proof'],
        '',
    ]
    for title, action in rows:
        lines.append(f'{n:03d}. **{title}** — {action}')
        n+=1
assert n==1001
out.write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(f'Exported {n-1} ideas, {len(groups)} groups, {len(bets)} priority bets to {out}')
