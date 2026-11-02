#!/usr/bin/env python3
"""P3.1 printable assembly drawings. No device access; BOM/netlist is authoritative."""
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
p.add_argument('--output', default=str(ROOT / 'output/pdf/mii-portable-p3-wiring.pdf'))
p.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
a = p.parse_args()
d = json.loads((HERE / 'bom-netlist.json').read_text())
pdfmetrics.registerFont(TTFont('JP', a.font))
W, H = landscape(A3)
INK, BLUE, POWER, SIGNAL, AMBER, MUTED, PALE = map(HexColor, ['#172D3B','#1268A1','#B63232','#137B69','#94600E','#566B78','#F1F5F7'])
styles = {name: ParagraphStyle(name, fontName='JP', fontSize=size, leading=lead, textColor=INK, wordWrap='CJK') for name,size,lead in [('body',11,17),('small',9,13),('tiny',8,11)]}
out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=(W,H), invariant=1)
c.setTitle('mii portable P3 | integrated LTE NTN Wi-Fi conditional wiring')
c.setAuthor('RockstarOS / mii engineering')

def label(x,y,s,size=11,color=INK):
 c.setFillColor(color); c.setFont('JP',size); c.drawString(x,y,str(s))
def para(x,top,width,s,sty='body'):
 q=Paragraph(s,styles[sty]); _,h=q.wrap(width,2000);q.drawOn(c,x,top-h);return h
def box(x,y,w,h,title,lines=(),color=BLUE):
 c.setFillColor(white);c.setStrokeColor(color);c.setLineWidth(1.3);c.roundRect(x,y,w,h,7,fill=1,stroke=1)
 label(x+12,y+h-25,title,13,color)
 para(x+12,y+h-37,w-24,'<br/>'.join(escape(str(s)) for s in lines),'small')
def path(points,color=BLUE,width=2,arrow=False):
 c.setStrokeColor(color);c.setLineWidth(width);z=c.beginPath();z.moveTo(*points[0])
 for pt in points[1:]:z.lineTo(*pt)
 c.drawPath(z)
 if arrow:
  import math
  x,y=points[-1];xx,yy=points[-2];angle=math.atan2(y-yy,x-xx)
  for off in [-0.45,0.45]:c.line(x,y,x-8*math.cos(angle+off),y-8*math.sin(angle+off))
def table(x,top,width,rows,ratios,sty='small'):
 converted=[[Paragraph(escape(str(v)).replace('\n','<br/>'),styles[sty]) for v in row] for row in rows]
 t=Table(converted,colWidths=[width*r for r in ratios],hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),0.9,MUTED),('LINEBELOW',(0,1),(-1,-1),0.3,HexColor('#D6E1E7')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
 _,h=t.wrap(width,2000)
 if top-h<55:raise ValueError(f'table exceeds page: bottom {top-h}')
 t.drawOn(c,x,top-h);return h

def head(page,title,subtitle):
 c.setFillColor(INK);c.rect(0,H-112,W,112,fill=1,stroke=0)
 label(40,H-39,'mii  /  PORTABLE CORE  /  P3.1',12,white)
 label(40,H-77,title,24,white)
 para(40,H-130,W-80,subtitle)
 c.setStrokeColor(MUTED);c.setLineWidth(.4);c.line(40,40,W-40,40)
 label(40,23,'2026-11-02  |  調達HOLD・R01〜04未解決  |  正本: 22-integrated-radio.md + portable-p3/bom-netlist.json',8,MUTED)
 label(W-115,23,f'{page} / 6',9,MUTED)

def nextpage():c.showPage()

head(1,'同じ本体で切り替える LTE / Wi-Fi / 衛星','電池・共通OS・全radio・GNSSを一緒に持ち出す。LTE/衛星は共用modem。アプリ経路とmodem網維持を分離。RF/USB電力の条件が閉じるまで最終調達・送信承認図ではない。')
c.setStrokeColor(BLUE);c.setDash(6,4);c.roundRect(385,150,755,500,12);c.setDash()
label(406,625,'取り外す mii Core 一式',17,BLUE)
box(40,450,280,180,'固定dock / 指定charger',['UPS Module 3S用 12.6V 2A','DC5521を外すと単体運転','指定charger付属optionを選択','銘板・極性・国別表示は受領照合','電池区画を開放して監視充電'],POWER)
box(420,475,300,115,'UPS Module 3S + P28A ×3',['メーカー3S holder / 保護 / 均等化','INPUT=12.6V / 出力5V→Pi USB-C','電池・UPS・配線はCoreに残す'],POWER)
path([(320,535),(420,535)],POWER,arrow=True);label(328,550,'12.6V',10,POWER)
box(420,255,300,160,'Pi 4B 4GB / 共通OS',['64GB microSD / fan','CYW43455 Wi-Fiは基板内接続','内蔵Wi-Fi: STAまたはAP','OS契約は14章を継承','P3 BSP/adapterは未実機受入'])
path([(570,475),(570,415)],POWER,arrow=True)
box(820,440,280,155,'Murata Type 1SC-NTN',['LBAD0XX1SC-DMSB-EVK-B','Soracom kit 4573326593342','UART0 Mini-B / CP210x','3FF SIM / SMA kit antenna','LTE-M と NTN は切替'],SIGNAL)
c.setDash(5,3);path([(720,365),(775,365),(775,515),(820,515)],arrow=True);c.setDash();label(820,610,'USB / R04条件付き',10,AMBER)
box(820,245,280,120,'GNSS / BU-353N5',['USB-A直付 / 内蔵受信patch','現在位置をCoreで取得','初号NTNは静止設置時'],SIGNAL)
path([(720,300),(820,300)],arrow=True)
box(40,240,280,140,'任意RJ45 / dataのみ',['初回有線管理、固定worker','単体運転には不要','PC / phone のWAN中継不要','光学・音声I/Oは別設計'])
path([(320,310),(420,310)],arrow=True)
para(40,112,W-80,'P2から除去: SIM7080G / RockBLOCK9704-ANT / LTE FPC / SC0218。P3はLTE・衛星共用化で別無線機の組合せを減らす。Wi-Fiとの同居評価は残る。電源・無線を含む実機合格や200mm筐体成立を示す図ではない。','small')
nextpage()
head(2,'電源配線 / 12.6V充電と5V出力を分離','メーカーのUPS・指定charger・付属cableを使用。INPUT / BAT / 5Vの同形socketを取り違えない。電池とUPSは本体に残る。')
box(40,500,260,130,'PSU / kit指定charger',['12.6V / 2A 充電器option','DC5521 → 純正C-IN 約15cm','DC5521がdock着脱点','単品MPN / 銘板はR04で照合'],POWER)
box(395,450,325,180,'UPS / Waveshare Module 3S',['INPUT ← C-IN / 12.6V充電専用','5V → 付属XH2.54–Type-C','SWITCH ← 付属self-lock switch','BAT出力はNC / 3.3Vも給電しない','P28A ×3 / 純正holderと保護を保持'],POWER)
path([(300,565),(395,565)],POWER,arrow=True)
box(820,450,320,180,'Core / Pi 4B USB-C',['純正C-PWR 約20cmで給電','GPIOへの二重給電なし','UPS header2 SDA → Pi J8-3','UPS header1 SCL → Pi J8-5','UPS header5 GND → Pi J8-9','I2C levelは3.3V / Adafruit266'],POWER)
path([(720,540),(820,540)],POWER,arrow=True);label(735,560,'5V',10,POWER)
rows=[['5V負荷の受入枠','A','注意'],['Pi本体 / Wi-Fi・SD含む','1.50','重いLLM・camera集約なし'],['Murata EVK USB','1.00','最大/突入/USB契約はR04未解決'],['GNSS USB / FAN','0.10 / 0.18','GNSS42mAはtyp、0.10Aは設計枠'],['合計 / USB合計','2.78 / 1.10','Pi給電枠3A / USB全port1.2A']]
table(40,405,640,rows,[.52,.18,.30])
box(740,185,400,220,'電源・電池の受入条件',['UPS基板5A ≠ 全cable/connector 5A','Pi端rail 4.85〜5.25V / 過渡も測定','P28A: 新品同一lot3本 / 極性照合','65.2mm < holder67mm / 3S','4.2V ×3 = 12.6V / 標準充電2.8A','kit2A充電器・各cell電圧/温度を測る','PiSugar + SC0218/DDR案は除去'],AMBER)
para(40,195,640,'10.8V × 2.8Ah × 効率85% × 使用率80% = 約20.56Wh、6W平均で約3.4時間の仮定。実測ではない。指定chargerでも過渡・接点温度・低電池shutdown・各cellの適合検査は必要。','small')
para(40,103,W-80,'初号は電池点検口を開け、20〜30°Cの不燃台上で監視充電。セル45°C/温度異常で停止。INA219は温度センサーではない。密閉/無人充電は未受入。P28Aへのはんだ付け、BMS迂回、別pack並列接続はしない。','small')
nextpage()
head(3,'USB / GPIO / RF の端子間接続','EVKの給電契約が閉じていないU01は条件付き。USB2の合計能力と、個々のUSB2 deviceの許容電流を区別する。')
box(40,485,320,155,'CORE / 黒いUSB2 2段口',['上段（基板から遠い）= MODEM','下段（基板に近い）= GNSS','青USB3×2 = NC / USB-CはUPS給電','実USB ID / serial / portで識別','ttyUSB0を固定値にしない'])
box(510,500,630,140,'U01 / EVK付属 A → Mini-B 1本',['UART0 / AT CMDのMini-Bへ / UART1はNC','A1 VBUS → Mini1 / A2 D− → Mini2 / A3 D＋ → Mini3','A4 GND → Mini5 / Mini4 ID = NC','CP210x / 115200 8N1 / SW2手動起動 / R04条件付き'],AMBER)
c.setDash(5,3);path([(360,568),(510,568)],arrow=True);c.setDash()
box(510,310,630,125,'U02 / GNSS BU-353N5',['直付USB-A → CORE下段 / 4800 8N1 / NMEA 0183','patchを上面へ。約1.52m cableを切らず、RFから離して保持','phoneのGPSや固定都市の座標を使わず、同一Coreで現在位置取得'])
path([(360,520),(465,520),(465,370),(510,370)],arrow=True)
table(40,445,390,[['J8物理pin','接続'],['3 / 5 / 9','UPS header2 SDA / 1 SCL / 5 GND'],['4 / 6 / 8','FAN 赤5V / 黒GND / 青BCM14'],['他の外部GPIO','NC / modem UART直結なし']],[.34,.66])
box(510,130,630,130,'RF / SIM',['kit付属NTN antenna → 主RF SMA。RP-SMAやGNSS口と混同しない','3FF micro SIM → EVK slot。plan01s標準 + planNT1、国内LTE planX1','未確認: antenna単品MPN・gain・band・長さ / exact board rev・FW','付属antenna以外へ交換した場合はR03とRF評価をやり直す'],SIGNAL)
para(40,220,390,'USB1Aという設計枠はUSB2 bus-power許可ではない。EVKの最大/列挙前電流とhost条件が判明するまでは通電releaseしない。外部5Vの二重給電やYケーブルは禁止。','small')
para(40,90,W-80,'USB上限を超える場合は、メーカー指定の外部給電・逆流防止回路で改版する。既存公開資料から未知のheader番号を推測していない。SMA/USB/電池/電源端子の変更は無通電で行う。','small')
nextpage()
head(4,'接続維持と経路選択 / P3.1訂正','Wi-Fi時modem OFFの前提を撤回。通常route変更でdetach/電源断をしない。網維持中のWi-Fi同居条件を確認する。')
rows=[['アプリroute','modem / Wi-Fi','単体での役割'],['LOCAL','アプリ停止 / modem網維持は別状態','queue保持。物理的な無送信を意味しない'],['WIFI','Wi-Fi + modem制御面の重複があり得る','STAまたはAP / BT OFF / hotspot用途外'],['LTE','modem地上網 / Wi-Fi OFF案','有限socket message / PPP一般WANは未受入'],['NTN','modem衛星網 / Wi-Fi OFF案','屋外静止・有効GNSS・有限UDP']]
table(40,660,W-80,rows,[.13,.39,.48])
box(40,250,530,200,'日本 / 認証 / 調達HOLD',['planNT1日本提供は確認 / 利用は窓口申込み','Murata v1.1のTELEC番号はNTNの証明ではない','日本の周波数・FW・指定antenna原本が必要','BG770A-SN-TE-B-KITは代替照会候補','YECN028AAは225mm → 200mm外形と衝突','候補を現BOMへ自動置換しない'],AMBER)
box(620,250,520,200,'provider要件と共通OS',['Skylo: detach / 本体動作中modem OFFに制限','地上網優先 / 共用RFは10分周期等で再確認','維持費と正式停止を予算契約へ収める','不明の間は接続を開始しない','GNSS / 静止 / UDP1024B / 再送2回 / TTL15分','ACKは配送、仕事完了ではない'])
para(40,195,W-80,'通常の経路変更でCFUN=0やUSB抜去を行う旧手順は廃止。SIM subscription切替・初期化・終了の正式手順は回答待ち。本人停止・低電池・予算到達の契約を弱めず、異常時は本体全体を安全停止する。','small')
para(40,125,W-80,'根拠: skylo.tech/knowledge-base/device-conformance-document §2.4。詳細・Soracom/Quectel確認文: 23-japan-procurement.md。認証・antenna・給電条件の原本回答後に最終部品と配線をreleaseする。通信/実機受入は未実施。','small')
nextpage()
head(5,'選定部品表 / Core 1台と固定dock','単品MPN非公開の付属antenna/cableはkit SKUで指定。antennaの実品仕様はR03、USB給電はR04。未確認の型番を作らない。')
rows=[['ID','型番 / variant','端子・備考']]
for q in d['parts']:rows.append([q['id'],q['model'],q['connector']])
h=table(40,660,W-80,rows,[.11,.40,.49],sty='tiny')
para(40,660-h-20,W-80,'固定側は指定chargerと任意LAN。本体側はCORE / UPS / P28A×3 / 全通信部品 / fan / SW / C-IN / C-PWR / C-I2C。MECHは加工品番号。kit付属品は単品MPNを推測せずkit内容で固定。購入/契約/開通は未実施。','small')
nextpage()
head(6,'release条件 / 組立・単体受入','静的整合PASSは、実機動作・RF適合・製造releaseを意味しない。R01〜R04を閉じてからP3-A01〜07を同一実機で記録する。')
rows=[['条件','閉じるための証拠','現在'],['R01','Pi4 + modem網維持/Wi-Fi同居、国別RF/人体距離、必要追加試験','OPEN'],['R02','日本NTN認証・band/FW、回線料金、provider接続維持/停止手順','OPEN'],['R03','exact kit、SMA antenna MPN/gain/bands/寸法、FW/board rev','OPEN'],['R04','EVK USB電力契約、指定charger/セル、5V過渡/逆流/接点温度','OPEN']]
table(40,660,W-80,rows,[.10,.75,.15])
rows=[['受入','同じCoreで確認すること','現在'],['P3-A01','電源dummy load → Core → GNSS → R04解決後EVK、波形/温度','NOT_RUN'],['P3-A02','antenna/cable込み200mm外形、保持/放熱/監視充電','NOT_RUN'],['P3-A03','単体GNSS、stale/移動/不正NMEAで許可を閉じる','NOT_RUN'],['P3-A04','国/fw/SIM/OS同一組のWi-Fi/LTE/NTN往復、認証ACKとjob保存','NOT_RUN'],['P3-A05','経路/網状態を分離、正式停止、無断課金・二重実行0','NOT_RUN'],['P3-A06','dock10回着脱、phone/PC/LANなしで単体通信、1時間目標','NOT_RUN'],['P3-A07','共通OSの承認/停止/保存/再起動/読戻し、光学C-02は別','NOT_RUN']]
table(40,440,W-80,rows,[.10,.75,.15])
para(40,125,W-80,'設計正本: docs/mii/design/22-integrated-radio.md。再生成: python3 docs/mii/design/portable-p3/render.py。静的検査: 同dir check.py。次の担当は4条件の原本回答を取得して必要箇所を改版する。調達・開通・無線送信・OS flashは未実施。問い合わせの送信状況は23章を参照。','small')
c.save();print(str(out))
