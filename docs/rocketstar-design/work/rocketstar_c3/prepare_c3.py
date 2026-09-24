from pathlib import Path
import json, shutil

ROOT=Path(__file__).resolve().parents[2]
OLD=ROOT/'work/design_freeze'
WORK=ROOT/'work/c3_review'
PACK=ROOT/'outputs/RETURN-1_C3_package'

for n in ['mass_study.md','mass_study.json','mass_study.py','payload_interfaces.md','payload_interfaces.json','interface_crossrefs.json']:
    shutil.copy2(OLD/n,WORK/n)

text=(OLD/'main.md').read_text().replace('C1','C3')
text=text.replace('2026-09-23 / 外観・方式の選定、必要設計の台帳、成立性の再評価','2026-09-23 / C1の基本方式を継承し、C2の外観更新をC3として本文・図・台帳へ統合')
text=text.replace('本版 C3 は外観と開発を進める構成を一本化する設計基準である。','本版 C3 は外観と開発を進める構成を一本化する設計基準である。前回C2は外観画像と別添メモだけの更新だった。本版でPDF本文、色指定、機能図、台帳の参照を更新し、C1との文書上のずれを修正した。')
text=text.replace('淡色の同径胴体、上段の暗色風上面、風下面の搭載扉、青緑の識別色','銀サテンの同径胴体、暗色風上面、風下面の黒い縦長意匠、細いシアン線')
start=text.index('## 02 ');end=text.index('## 03 ')
appearance='''## 02 外観・意匠の適用

{{EXTERIOR_IMAGE}}

C3はavokado Motion Towerの銀色円筒、縦長の黒い面、3つの小さいシアン点、精密な細い継ぎ目を、ロケットの風下面へ展開した外観案である。正面の銀色と背面の暗色熱防護を分け、両方を同じ図で示した。

| 要素 | 本版の意匠指定 | 指定の意味 |
| --- | --- | --- |
| 主面 | 冷たい銀色のサテン調。表示色の基準 #B8C0C5 | 合金・表面処理の材料指定ではない |
| 黒い縦面 | 風下面の扉表面に、細長く角を丸めた #111619 の面 | 非開口の外装グラフィック。窓やレンズではない |
| シアン | #19C8E4 の小さい平面3点と細い周方向線 | 光源を追加しない。黒い縦面の下側に線を置く |
| 姿勢の見せ方 | 風下正面・風上背面・外装拡大の3図 | 縮尺・寸法・機構の図面に代用しない |

{{APPEARANCE_PAGEBREAK}}

### 外観を機能と対応させる

| ID／対象 | 配置と見た目のルール | 設計との対応 |
| --- | --- | --- |
| EX-01 全体 | 直線的な円筒を主役にし、2段の境界を細い暗色の継ぎ目で示す | RDR-003／007。外装の細線を追加の分離段・伸縮部にしない |
| EX-02 先端 | 丸みのある流線形の先端から銀色の胴体へ連続させる | RDR-007／018。半径、曲率、角度は空力・熱・収納から確定する |
| EX-03 搭載扉 | 風下面に扉を保持し、その外面に黒い縦長意匠を置く | RDR-011。実際の扉境界と可動範囲は別の機構図で管理する |
| EX-04 3点 | 黒い面の中央軸上に小さいシアン点を縦に並べる | RDR-008。意匠上の点。センサー穴、ガラス、光源、配線を新設しない |
| EX-05 細い線 | 上部の黒い縦面より下と下部の外装に、細いシアンの周方向線を置く | RDR-008／011。シール・可動隙間を埋める実施工指定ではない |
| EX-06 熱防護 | 風上面は連続した暗色の熱防護面として示す | RDR-018。意匠を理由に銀色へ変更しない。材質と厚さは未確定 |
| EX-07 可動部 | 舵面と脚の外形を胴体の簡潔な線にそろえる | RDR-012／020。画像の個数、取付、格納断面は未承認の候補形状 |
| EX-08 継ぎ目 | 少数の細い水平線、控えめな縁の反射で精密さを表す | RDR-007／009。外装の模様から溶接・接合位置を決めない |

画像中の黒い面と3点は、上表EX-03／04に従って読む。新しいカメラ・窓・LEDの搭載を仕様に追加していない。画像にある反射や縁取りを実部品の証拠としない。機体に必要な実センサーは航法・制御側の要求から別途選定する。

### 寸法・素材を確定する際の扱い

全長、直径、扉寸法、翼面、脚、熱防護範囲を画像から採寸しない。構造・収納・空力・熱・着陸条件から決まった形状へ、EX-01～08の見た目を適用する。意匠を維持するために部品の収納や熱防護を省かない。制約と意匠が衝突した箇所は、該当するEXとRDRを同時に改訂する。

画像の正面・背面・拡大図では、銀色の正面、暗色の風上面、3つの平面点、点より下の細線を照合した。この目視照合はCAD上の同一形状保証ではない。製造図として形状が一致することは、共通CADを起点とした図面発行で確認する。

'''
text=text[:start]+appearance+text[end:]
text=text.replace('淡色胴体','銀色胴体')
text=text.replace('本書、意匠画像、機能配置図、設計台帳、搭載品の接続条件、再現可能な質量計算を C3 パッケージへまとめた。','本書、C3意匠画像、機能配置図、更新した設計台帳、搭載品の接続条件、再現可能な質量計算を C3 パッケージへまとめた。C1の計算・接続条件は変更履歴を維持して継承し、外観の修正を性能改善や詳細設計完了として計上していない。')
text=text.replace('同梱 design_register.md／.json／.csv を参照する。','同梱 design_register.md／.json／.csv を参照する。C3で追加した意匠EX-01～08と各RDRの対応は第02章と外観定義ファイルに記録した。')
(WORK/'main.md').write_text(text)

builder=(OLD/'build_package.py').read_text().replace("WORK=ROOT/'work/design_freeze'","WORK=ROOT/'work/c3_review'").replace('C1','C3')
builder=builder.replace("colors.HexColor('#E7E6E0')","colors.HexColor('#B8C0C5')")
builder=builder.replace("d.add(Rect(x,186,w,10,fillColor=TEAL,strokeColor=NAVY))","d.add(Rect(x,186,w,10,fillColor=NAVY,strokeColor=NAVY))")
builder=builder.replace("d.add(Rect(x,196,w,80,fillColor=LIGHT,strokeColor=NAVY))","d.add(Rect(x,196,w,80,fillColor=colors.HexColor('#B8C0C5'),strokeColor=NAVY))")
builder=builder.replace("fillColor=LIGHT,strokeColor=NAVY))\n    # Functional regions", "fillColor=colors.HexColor('#B8C0C5'),strokeColor=NAVY))\n    # Functional regions")
builder=builder.replace("label(d,x+w/2,245,'上段',11);label(d,x+w/2,99,'第1段',11)","label(d,x+w/2,220,'上段',11);label(d,x+w/2,99,'第1段',11)\n    d.add(Rect(x+23,239,12,38,rx=6,ry=6,fillColor=NAVY,strokeColor=None))\n    for yy in [249,257,265]: d.add(Ellipse(x+29,yy,1.4,1.4,fillColor=colors.HexColor('#19C8E4'),strokeColor=None))\n    d.add(Line(x,234,x+w,234,strokeColor=colors.HexColor('#19C8E4'),strokeWidth=1))")
builder=builder.replace("md=md.replace('{{EXTERIOR_IMAGE}}'", "md=md.replace('{{APPEARANCE_PAGEBREAK}}','')\nmd=md.replace('{{EXTERIOR_IMAGE}}'")
builder=builder.replace("    elif line in assets:","    elif line=='{{APPEARANCE_PAGEBREAK}}':\n        story.append(PageBreak());i+=1\n    elif line in assets:")
builder=builder.replace("'interface_crossrefs.json']:","'interface_crossrefs.json','consistency_review.md','appearance_definition.json']:")
builder=builder.replace("- image_prompt.txt：意匠画像の最終生成指示。生成手段は image_gen。","- image_prompt.txt / generation_record.json：参照画像、最終生成指示と修正記録。生成手段は内蔵 image_gen。\n- appearance_definition.json：外観EX-01〜08と設計台帳IDの対応。\n- revision_notes.md：C1/C2からの更新範囲と、文書照合の記録。\n- consistency_review.md：更新前のC1/C2の文書ずれと未解決の設計項目の監査。")
builder=builder.replace('2026-09-23。外観と方式の基準案です。','2026-09-23。C1の基本方式・計算を継承し、C2の別添だけだった外観変更を本文・図・台帳に統合したC3です。')
(WORK/'build_package.py').write_text(builder)

reg=json.loads((WORK/'design_register.json').read_text())
ids={i['id'] for i in reg['items']}
defs=[]
for row in appearance.splitlines():
    if row.startswith('| EX-'):
        cells=[c.strip() for c in row.strip('|').split('|')]
        import re
        linked=re.findall(r'RDR-\d{3}',cells[2])
        # Additional slash-shortened IDs are made explicit below.
        mappings={'EX-01':['RDR-003','RDR-007'],'EX-02':['RDR-007','RDR-018'],'EX-03':['RDR-011'],'EX-04':['RDR-008'],'EX-05':['RDR-008','RDR-011'],'EX-06':['RDR-018'],'EX-07':['RDR-012','RDR-020'],'EX-08':['RDR-007','RDR-009']}
        ident=cells[0][:5];linked=mappings[ident]
        assert all(i in ids for i in linked)
        defs.append({'id':ident,'title':cells[0][6:],'rule':cells[1],'engineering_boundary':cells[2],'design_register_ids':linked,'status':'visual_direction_selected_not_manufacturing_geometry'})
assert len(defs)==8
(WORK/'appearance_definition.json').write_text(json.dumps({'revision':'C3','rules':defs,'adds_cameras':False,'adds_windows':False,'adds_led_hardware':False,'manufacturing_release':False},ensure_ascii=False,indent=2))

record=json.loads((PACK/'generation_record.json').read_text())
(PACK/'image_prompt.txt').write_text(record['initial_prompt']+'\n\nFINAL CORRECTION\n'+record['correction_prompt'])
notes='''# C3 改訂記録

2026-09-23。C1とC2は履歴としてそのまま保持。

## 修正した文書のずれ

- C2が画像と変更メモだけだった状態を改め、C3の画像を本体PDFとMarkdownへ組み込んだ。
- 第01/02章の外観・色指定、機能配置図を銀サテン・黒縦面・細シアンへ更新した。
- EX-01〜08を追加し、外装グラフィックと実際の機器を明確に分け、台帳へ対応付けた。
- 台帳RDR-007/008/011/018へC3の意匠だけの根拠を追記した。
- 本文とRDR-038の段階番号をG0〜G5へそろえた。
- 拡大図のシアン線を黒い面の下へ修正し、全体図の意匠とのずれを減らした。

## 完成していない設計

外観更新は、部品・材料・寸法・エンジン・構造・熱防護・航法制御の詳細設計完成を意味しない。40項目の台帳状態はC1から変えていない。要求固定2、方式選定6、解析仮定4、未確定28、認定証拠0。製造・飛行未承認。

質量計算は旧比較点の成立余裕に不足があることを示した同じ検討結果を継承する。形や色を変えたことで性能が成立したとは扱わない。現在の文書から製造部品を全て発注することはできない。

## 確認範囲

参照画像をもとに内蔵image_genで作成し、全体図と拡大図の意匠を目視で確認。PDF本文・外観定義・台帳・同梱ファイルの整合を確認する。物理試験、CAD干渉検査、飛行解析の新しい結果は含めていない。
'''
(PACK/'revision_notes.md').write_text(notes)
print('C3 source and builder prepared; C1/C2 preserved.')
