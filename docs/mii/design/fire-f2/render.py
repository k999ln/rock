#!/usr/bin/env python3
"""Print the F2 evaluation wiring package. No hardware access."""
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
p = argparse.ArgumentParser()
p.add_argument('--output', default=str(ROOT / 'output/pdf/mii-fire-f2-wiring.pdf'))
p.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
a = p.parse_args()
d = json.loads((HERE / 'bom-netlist.json').read_text())
pdfmetrics.registerFont(TTFont('JP', a.font))
W,H = landscape(A3)
INK, BLUE, GREEN, RED, AMBER, PALE, GRAY = map(HexColor, ['#163341','#246A92','#177B66','#AD3636','#986013','#EEF4F5','#647780'])
styles = {n:ParagraphStyle(n,fontName='JP',fontSize=s,leading=l,textColor=INK,wordWrap='CJK') for n,s,l in [('body',12,19),('small',10,15),('tiny',9,13)]}
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(out),pagesize=(W,H),invariant=1)
c.setTitle('mii F2 | 後付け消防ユニット評価配線')
c.setAuthor('RockstarOS / mii engineering')
def txt(x,y,s,size=12,color=INK):
 c.setFillColor(color);c.setFont('JP',size);c.drawString(x,y,str(s))
def para(x,top,width,s,style='body'):
 q=Paragraph(s,styles[style]);_,h=q.wrap(width,2000);q.drawOn(c,x,top-h);return h
def box(x,y,w,h,title,lines,color=BLUE):
 c.setFillColor(white);c.setStrokeColor(color);c.setLineWidth(1.2);c.roundRect(x,y,w,h,8,fill=1,stroke=1)
 txt(x+14,y+h-28,title,14,color)
 used=para(x+14,y+h-42,w-28,'<br/>'.join(escape(t) for t in lines),'small')
 if used > h-52:raise ValueError('Box overflow: '+title)
def line(points,color=BLUE,dash=False):
 c.setStrokeColor(color);c.setLineWidth(2);c.setDash(5,4) if dash else c.setDash()
 z=c.beginPath();z.moveTo(*points[0])
 for pt in points[1:]:z.lineTo(*pt)
 c.drawPath(z);c.setDash()
def table(top,rows,widths,style='small'):
 cells=[[Paragraph(escape(str(v)).replace('\n','<br/>'),styles[style]) for v in r] for r in rows]
 t=Table(cells,colWidths=widths)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,GRAY),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
 _,h=t.wrap(W-80,2000)
 if top-h<62:raise ValueError('Table overflow')
 t.drawOn(c,40,top-h);return top-h
def head(n,title,sub):
 c.setFillColor(INK);c.rect(0,H-104,W,104,fill=1,stroke=0)
 txt(40,H-32,'mii  /  FIRE HARDWARE  /  F2',12,white)
 txt(40,H-77,title,25,white)
 para(40,H-122,W-80,sub)
 line([(40,43),(W-40,43)],GRAY)
 txt(40,25,'2026-11-02 | 評価設計 / 消防検定・実機・施工受入 未完了 | 正本: 25-retrofit-fire-hardware.md',9,GRAY)
 txt(W-95,25,f'{n} / 5',9,GRAY)

head(1,'新規の配線工事なしで取り付けるmii','共通OSを維持。固定消防ユニット＋着脱Coreの完成品を目指す。以下は方式と評価部品であり、完成miiの認定・全建物互換を示さない。')
box(40,420,350,220,'JP-H / 住宅',['電池式・無線連動','FSKJ226-M / FSKJ226-C','FSOJ001B-S → 絶縁USB入力','付属base / 適合する既設穴を使用','煙・警報・電池は固定側に残す','2地点で机上連携評価'],GREEN)
box(420,420,350,220,'JP-S / 適用対象の小規模施設',['FDKJ235-M / FDKJ235-C','専用電池・無線 / 建物配線なし','選定例は一警戒区域・一グループ','住宅用無線familyとは混在不可','FSOJ001B-K → miiは接続許可待ち','用途・区域・配置・届出を確認'],AMBER)
box(800,420,350,220,'JP-B / 一般店舗・ビル',['対応する既設base・回線を再利用','FDK246 + FZBJ014-R-2は照合例','完成mii headはOEM開発・検定が必要','受信機・音響・予備電源を維持','新しい受信機設置は初号対象外','無工事の全建物対応は未成立'],AMBER)
box(40,185,540,185,'固定側 / 火災監視を続ける',['独立した専用電源・検知・現場警報・必要な設備連動','Core持出し・OS停止・回線断・課金停止から独立','煙入口・音孔を覆わず、既設headにP3の荷重をかけない','量産では最終形状、装着／離脱、最大熱・RFで受入'],GREEN)
box(610,185,540,185,'取り外す側 / 同じRockstarOS',['演算・仕事・保存・Wi-Fi・LTE・衛星は共通P3系','消防機器へ制御線なし。USBは読取用の補助経路','Coreは別途充電。消防電池からは給電しない','屋内衛星通信・常時外部通知は保証しない'],BLUE)
para(40,152,W-80,'取付要件：既存台・穴位置・下地・荷重が適合すること。粘着剤だけで天井固定しない。既存AC100V直結機の撤去や、新規の壁内配線はこの方式に含めない。')
c.showPage()

head(2,'F-H / 住宅用の机上連携配線','対象：未改造の指定製品。A/Bは付属ハーネスの設計線名（無極性）。新しい製品pin番号ではない。初回はP3のmodem/GNSSを未接続にする。')
box(40,480,285,155,'H1 FSKJ226-M / H2 FSKJ226-C',['各器：CR17450E-N-CN10','煙検知＋警報 / 専用電池','指定手順で登録・単独／連動試験'],GREEN)
box(435,480,285,155,'H4 FSOJ001B-S',['CR17450E-N-2-CN1','背面「火災移報用コネクタ」','無電圧1a / DC50V・100mA'],GREEN)
line([(325,560),(435,560)],GREEN,True);txt(337,580,'指定無線',11,GREEN)
box(835,480,315,155,'I1 Phidgets 1018_3',['Digital Inputs 0 ← 純正線A','Digital Inputs G ← 純正線B','USB Mini-B / 出力は全て未接続'],BLUE)
line([(720,555),(835,555)],GREEN);txt(738,565,'F04 / A',10,GREEN)
line([(720,515),(835,515)],GREEN);txt(738,525,'F05 / B',10,GREEN)
box(835,250,315,135,'I2 Phidgets 3060_0',['device側 USB-A ↑ C2 3017_1','host側 Mini-B ← C1 3017_1','速度切替：Full Speed'],BLUE)
line([(990,480),(990,385)],BLUE);txt(1002,431,'F06 / C2',10,BLUE)
box(40,250,390,135,'mii Core / Raspberry Pi 4B',['青USB3-A下段（基板側）→ C1','USB-C給電：P3の独立した電池系','黒USB2 modem・GNSSは初回未接続'],BLUE)
line([(430,315),(835,315)],BLUE);txt(505,336,'F07 / C1 / 3017_1',12,BLUE)
txt(508,284,'USB電源・GND・dataの絶縁を維持',11,RED)
para(40,220,W-80,'F01/F02：各純正電池をその機器の電池用コネクタへ。F03：H4の火災移報コネクタへ純正ケーブルを挿す。電池コネクタと移報コネクタを取り違えない。5V線・GPIO線を火災側へ足さない。')
para(40,157,W-80,'読み取れる範囲：接点CLOSEのみ。OPENは正常・火災解除を意味しない。発報室・電池切れ・電波異常・断線は取得不可。H4は感知器ではない。接点の微小負荷と入力電圧はF-E01、全通信同時の給電はF-E02で未受入。','small')
c.showPage()

head(3,'型番と端子 / 発注前に現物・資料revisionを照合','数量は机上評価用。S/Bは用途の照合用であり、購入・施工releaseではない。純正電池・純正ハーネス・指定baseを使用する。')
rows=[['ID / 数量','型番','機能・端子']]
for part in d['bom']:
 if part['id'] in ('H3','S3','C2','HB1','HB2','CORE'):continue
 rows.append([f"{part['id']} / {part['quantity']}",part['model'],part['role']+'\n'+', '.join(part['ports'])])
bottom=table(H-178,rows,[100,370,W-550])
para(40,bottom-19,W-80,'追加：C2も3017_1×1。H1/H2電池はCR17450E-N-CN10×2、H4電池はCR17450E-N-2-CN1×1（同梱品）。任意熱器：H3 FSLJ016-C、S3 FDLJ920-C。実台数は配置設計で決める。','small')
c.showPage()

head(4,'F-S / F-Bと、追加の配線工事を避ける条件','資格不要・届出不要・点検不要を一括して約束しない。消防機器の完成品検定と、建物ごとの設備受入は別の証拠で管理する。')
box(40,463,530,173,'F-S / 一グループの指定無線',['FDKJ235-M ⇄ FDKJ235-C / FDLJ920-C','各器は純正電池＋base。無線中継器なしを初号とする','FSOJ001B-Kは原則火災通報装置のみ接続可能','S4→mii配線は保留。住宅H用adapterで代用しない'],AMBER)
box(610,463,540,173,'F-B / 既設P型の照合例',['既設L/C → 既設FZBJ014-R-2 → FDK246','base刻印：L・S+ / C・S−。P型はL/Cとして照合','既設の送り・終端・受信機・地区音響・予備電源を維持','miiは回線へ接続しない。完成mii headはOEM検定待ち'],AMBER)
table(433,[['未解決','閉じるための証拠'],['F-E01 接点','微小負荷・OFF漏れ・ON抵抗・故障影響・接続条件、閉≤1V / 開≥1.8V'],['F-E02 電源','I1≤50mA / I2込みhost≤100mAを実測。P3全通信時はUSB1.2Aで余裕なし'],['F-E03 取付','既存台・穴・下地・荷重・落下防止・通気・点検空間の完成形試験'],['F-E04 施設','用途・区域・機器構成・S4外部接続許可・資格／届出の適用確認'],['F-E05 完成品','OEM完成head・筐体・電源・型式承認／型式適合検定・受信機対応表']],[190,W-270])
para(40,168,W-80,'国の案内：無線式連動型感知器のみの特小自火報と、中継器付き構成は資格条件が異なる。一般自火報の軽微工事も、甲種消防設備士の実施等と設置届の条件が残る。詳細は25章§6とL2/L5。','small')
para(40,115,W-80,'同じ既設台へ取り付くことだけではmiiの検定は成立しない。部品の検定番号は完成miiへ転記しない。F-G01～06 OPEN / F-A01～07 NOT_RUN。','small')
c.showPage()

head(5,'組立・確認の順番と根拠資料','この図は机上評価のための設計資料。建物の法定警報器を試作miiに置換する施工指示ではない。新たな問い合わせ・購入・実機試験は行っていない。')
bottom=table(H-180,[['順番','行うこと／残す記録'],['1 受領','モデル、検定表示、純正電池、取付台、説明書revision、コネクタ刻印を照合'],['2 独立警報','机上のH1/H2を正規登録し、各器の単独・連動テスト。実火を使わない'],['3 入力のみ','H4なしでI2/I1を接続。DI0–Gの仮接点でtrue/false、電流と電圧を測る'],['4 F-H連携','無給電で結線後、H4の移報テスト。接点・遅延・試験状態を記録'],['5 切離し','USB切断、Core停止・持出しで消防側が独立して警報することを確認'],['6 製品化','完成形の感知・音響・熱・RF・機構・寿命・検定・物件受入を個別に閉じる']],[150,W-230])
txt(40,bottom-34,'一次資料への入口（全URL・資料番号・制限は25章§8）',13,BLUE)
y=bottom-53
for sid in ['H1','H2','H3','I1','I2','B1','B2','L1','L2','L3','L5']:
 s=next(x for x in d['sources'] if x['id']==sid)
 short=s['url'].replace('https://','')
 para(40,y,W-80,f'<link href="{escape(s["url"])}" color="#246A92">{sid}  {escape(short)}</link>','tiny');y-=21
if y<57:raise ValueError('Source list overflow')
c.save()
print(out)
