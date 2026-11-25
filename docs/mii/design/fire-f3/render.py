#!/usr/bin/env python3
"""Print the F3 evaluation wiring package. No hardware access."""
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
p.add_argument('--output', default=str(ROOT / 'output/pdf/mii-fire-f3-wiring.pdf'))
p.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
a = p.parse_args()
d = json.loads((HERE / 'bom-netlist.json').read_text())
compat = json.loads((HERE / 'compatibility.json').read_text())
pdfmetrics.registerFont(TTFont('JP', a.font))
W,H = landscape(A3)
INK, BLUE, GREEN, RED, AMBER, PALE, GRAY = map(HexColor, ['#163341','#246A92','#177B66','#AD3636','#986013','#EEF4F5','#647780'])
styles = {n:ParagraphStyle(n,fontName='JP',fontSize=s,leading=l,textColor=INK,wordWrap='CJK') for n,s,l in [('body',12,19),('small',10,15),('tiny',9,13)]}
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
c=canvas.Canvas(str(out),pagesize=(W,H),invariant=1)
c.setTitle('mii F3 | 後付け消防ユニット評価配線')
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
 txt(40,H-32,'mii  /  FIRE HARDWARE  /  F3',12,white)
 txt(40,H-77,title,25,white)
 para(40,H-122,W-80,sub)
 line([(40,43),(W-40,43)],GRAY)
 txt(40,25,'2026-11-03 | 評価設計 / 消防検定・実機・施工受入 未完了 | 正本: 26-fire-certification-power.md',9,GRAY)
 txt(W-95,25,f'{n} / 7',9,GRAY)


head(1,'消防と共通OSの電源を独立させる','F3評価配線。完成miiの検定・天井取付・日本NTN・全負荷受入は未完了。既設消防設備を外さず、開放した机上で評価する。')
box(40,480,275,155,'PB / Anker A1289',['C1 → Pi USB-C（5V）','C2 → Hub POWER（5V）','C1/C2各3A / USB-AはNC','CP1/CP2: USB2CC50CM'],BLUE)
box(440,500,300,135,'CORE / Pi4B 4GB',['SC0194 / revision1.2以降','共通RockstarOS・Wi-Fi・SD','fan含む設計枠 2.50A'],BLUE)
box(440,290,300,150,'HUB / SC1636',['USB-C外部給電 / 設計枠1.50A','直付A upstream → Pi青USB3下段','U1/U2/U3は貼付ラベル / U4 NC'],BLUE)
box(860,475,285,160,'MODEM + GNSS',['U1 → 付属A–MiniB → UART0','LBAD0XX1SC-DMSB-EVK-B','U2 → BU-353N5','LTE/NTN共用・USB/RF条件HOLD'],AMBER)
box(860,270,285,150,'消防読取 / 絶縁',['U3 → 3017_1 → 3060_0','device A → 3017_1 → 1018_3','DI0/G ← FSOJ001B-S純正線','固定消防側は独立した専用電池'],GREEN)
line([(315,590),(440,590)],BLUE)
line([(315,525),(355,525),(355,350),(440,350)],BLUE)
line([(590,440),(590,500)],BLUE)
line([(740,375),(800,375),(800,555),(860,555)],AMBER)
line([(740,325),(860,325)],GREEN)
para(40,220,1100,'設計合計20.0W。Pi USBの1.2A上限へ全負荷を直結する構成を解消する。1Aのmodem設計枠はUSB2の許容電流ではない。供給能力、電力契約、過渡・逆流・温度の受入を分ける。')
para(40,150,1100,'A1289は約632g・0〜35℃。天井用の完成製品電池には採用しない。停止・切離し後だけA2663115と付属ケーブルでC1から充電。Core持出し・電池切れでも固定消防側の警報を継続する。')
c.showPage()
head(2,'端子間の全接続 / 20本','RUNとCHARGE_ONLYは排他。HOLD行は部品照合・メーカー条件の確認前に実機接続／送信へ進めない。U番号、ケーブルA/Bは設計管理名。')
rows=[['Net','接続元','接続先','ケーブル / 条件']]
for n in d['connections']:
 note=n.get('via','factory/direct')+' / '+n['mode']
 if n['held']:note+=' / HOLD'
 rows.append([n['id'],n['fromPort'],n['toPort'],note])
table(H-180,rows,[100,330,330,W-840],'tiny')
c.showPage()
for page,start,end,title in [(3,0,12,'消防入力と演算部'),(4,12,24,'電源と通信部')]:
 head(page,'部品表 / '+title,'型番・刻印・board版と原本を受領時に照合。未取得のOEM完成品をこの評価BOMで代替しない。独立した日本消防検定・実物件受入は未完了。')
 rows=[['ID/数量','型番','使用端子','採用範囲']]
 for p in d['bom'][start:end]:
  rows.append([p['id']+' / '+str(p['quantity']),p['model'],' / '.join(p['ports']),p['role']])
 bottom=table(H-180,rows,[85,325,360,W-850],'small')
 para(40,bottom-25,W-80,'F-Hの専用電池は純正コネクタだけ。H4移報接点→I1 DI0/G、I2を跨ぐGND配線なし。H4接点OPENは正常・解除を意味しない。接点の微小負荷保証は未取得。','small')
 c.showPage()
head(5,'検定へ提出する完成形と数値条件','e-Gov原文・JFEII R8.4.1を確認。主要条項の抜粋。適用全条項・試験点・供試数はOEMと検定機関が確定する。実機検定はNOT_RUN。')
rows=[['対象','設計入力','完成形で必要な証拠'],
 ['住宅 第3条','音圧: 前方1mで70dB以上、1分以上。電池下限電圧で実施。','Core装着/離脱、最大音声・fan中の現場警報。公称音圧が高い場合はその値。'],
 ['住宅 第3条','電池下限・自動試験異常: 72時間以上通知。監視復旧15分以内等。','固定消防側で成立。単純接点からfault/lowBatteryを推測しない。'],
 ['住宅 第4/5条','有害な附属装置なし。0〜40℃、40℃/95%RHで4日等。','A1289の0〜35℃は完成品の適合にならない。煙流・熱・RF・荷重を含む。'],
 ['住宅 光電2種 第7条','K=10%/m、風速20〜40cm/s。1.5Kで60秒以内、0.5Kで5分不作動。','認定試験器・所定前処理、最終筐体と全動作状態で試験。'],
 ['ビル 光電2種 第17条','非蓄積: 1.5Kで30秒以内、0.5Kで5分不作動。','住宅用60秒をビル用に転用しない。感知器共通規格・接続適合も確認。'],
 ['型式/製造検定','JFEII R8.4.1。住宅明細書2号の6の1、最終部品・構造・電池・無線・FW。','附表3の住宅50個等は型式適合検定の最低受検数。型式試験供試数ではない。']]
b=table(H-180,rows,[170,450,W-700],'body')
para(40,b-25,W-80,'附属装置、絶縁、耐力、振動・衝撃、粉塵・外光、無線連動、表示等も26章へ対応付け。3060_0の1kVDC仕様を消防完成品の絶縁試験と同一視しない。','small')
c.showPage()
head(6,'ビル互換・工事不要・残る受入','物件受入0件。共通OSは維持。既設設備の型番・回路・下地・交換区分が決まるまで万能の取付／交換図として使わない。')
rows=[['対象','確認した範囲','判定'],
 ['住宅','FSKJ226-M/C＋FSOJ001B-S。専用電池と同一無線family。','机上評価用。店舗・ビルの法定自火報へ転用しない。'],
 ['小規模施設','FDKJ235-M/C等、一警戒区域。FSOJ001B-Kは原則火災通報装置向け。','miiへの外部接続許可と物件適用が必要。'],
 ['一般ビル / base','FDK246＋FZBJ014-R-2。L・S+ / C・S−。旧適合baseは26章表参照。','適合headの基準。新しいmii headの完成／検定ではない。'],
 ['受信機','NOHMI N-13/B-10以降（B-11/15除外）、Rは指定中継器経由。','現物回路・終端・台数・感度・予備電源・脱落/復旧を照合。'],
 ['無工事','既設配線と適合台を維持。新規AC100V・天井内工事なし。','重量・保持・落下防止・煙流・音響を評価。資格/届出不要とは別。']]
b=table(H-180,rows,[155,470,W-705],'body')
para(40,b-30,W-80,'未完了: F-E01接点、F-E02電源実測と製品電池、F-E03最終機構、F-E04実物件/施設接続、F-E05 OEM完成品検定。R01〜04もOPEN。Quectel回答でYECN028AAを除外し、YECT003AAを照合第一候補に変更。日本NTN承認は未確定。')
para(40,b-115,W-80,'再現: python3 docs/mii/design/fire-f3/check.py / render.py。原本URL・詳細な受入手順は26章。購入・追加送信・回線契約・通電・施工・認定は未実施。PDFの配線静的合格を実機の成功へ変換しない。','small')
c.showPage()
head(7,'4社・8系列 / 既設head・baseの照合','メーカー公開資料で既製品の組合せを確認。共通CoreとOSを保持し、固定消防部は系列別に設計する。新miiの互換受入・検定・物件受入はいずれも0件。')
rows=[['メーカー / head','指定base','端子・回路の確認範囲','OEM miiへ残る条件']]
for f in compat['families']:
 rows.append([f['manufacturer']+' / '+f['head'],' / '.join(f['bases']),f['terminals']+'\n'+f['receiverScope'],f['remaining']])
b=table(H-180,rows,[210,250,360,W-900],'small')
para(40,b-25,W-80,'端子の記号確認と、取付接触片の製造図・耐力・プロトコル・認証は別。L/C/S/PからCoreへ直接給電／GPIO接続しない。BVK4010等の共通base、66.7mmの共通ピッチだけで相互交換を承認しない。','small')
para(40,b-88,W-80,'原本: 26章[B1–B10]とfire-f3/compatibility.json。ホーチキ2026–27、ニッタン2026-05-08新旧表・CK2B機器図、パナソニック2025–27カタログを照合。既設の回路版・台数・終端・用途・下地と有資格者による交換区分の確認を残す。','small')
c.showPage()
c.save()
print(out)
