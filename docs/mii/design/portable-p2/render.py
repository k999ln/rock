#!/usr/bin/env python3
"""HW1 printable assembly drawings. No device access; BOM/netlist is authoritative."""
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
p.add_argument('--output', default=str(ROOT / 'output/pdf/mii-portable-p2-wiring.pdf'))
p.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
a = p.parse_args()
d = json.loads((HERE / 'bom-netlist.json').read_text())
pdfmetrics.registerFont(TTFont('JP', a.font))
W, H = landscape(A3)
INK, BLUE, POWER, SIGNAL, AMBER, MUTED, PALE = map(HexColor, ['#172D3B','#1268A1','#B63232','#137B69','#94600E','#566B78','#F1F5F7'])
styles = {name: ParagraphStyle(name, fontName='JP', fontSize=size, leading=lead, textColor=INK, wordWrap='CJK') for name,size,lead in [('body',11,17),('small',9,13),('tiny',8,11)]}
out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=(W,H), invariant=1)
c.setTitle('mii portable P2 | LTE Wi-Fi satellite and dock wiring')
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
 label(40,H-39,'mii  /  PORTABLE CORE  /  P2',12,white)
 label(40,H-77,title,24,white)
 para(40,H-130,W-80,subtitle)
 c.setStrokeColor(MUTED);c.setLineWidth(.4);c.line(40,40,W-40,40)
 label(40,23,'2026-11-02  |  組立設計・実機/RF未受入  |  正本: 21-portable-connectivity.md + portable-p2/bom-netlist.json',8,MUTED)
 label(W-115,23,f'{page} / 7',9,MUTED)

def nextpage():c.showPage()

head(1,'取り外して持ち出す通信Core','共通OSはCoreへ。電池と3種類の通信もCore内に保持する。青=data、赤=電源、緑=RF/制御。固定PC/スマホをWAN中継に必須としない。')
# Portable assembly boundary
c.setStrokeColor(BLUE);c.setDash(6,4);c.roundRect(365,140,780,530,12);c.setDash()
label(386,645,'持ち出す mii Core / P2',18,BLUE)
box(40,500,255,135,'固定dock / 充電',['SC0218 / 固定5.1V 3A','Type-CはUPSへ','充電時は電池区画を開放','手動plug抜去 + 保持strap解除'],POWER)
box(405,500,295,110,'UPS  PiSugar 3 Plus',['同梱5000mAh battery kit','純正背面接点: 5V/GND/I2C','電池ごとCoreに残る'],POWER)
path([(295,558),(405,558)],POWER,arrow=True);label(313,575,'P01',10,POWER)
box(405,280,295,155,'CORE  Pi 4B 4GB',['共通RockstarOS runtime + cache','64GB microSD / FAN','内蔵Wi-Fi + 基板antenna','仕事/権限/料金の契約は共通','P2 BSP/adapterは未実機受入'])
path([(552,500),(552,435)],POWER,arrow=True);label(562,466,'P02 / 純正接点',10,POWER)
box(40,280,255,145,'固定LAN / 任意',['RJ45 / 1GbE / dataのみ','管理router または固定worker','AGXは任意の空間演算worker','TowerのOSを複製しない'])
path([(295,352),(405,352)],arrow=True);label(312,368,'E01',10,BLUE)
box(810,485,290,125,'LTE  SIM7080G HAT',['Waveshare17693 / USBJ1 Micro-B','1.8V LTE-M IoT SIM','LTE1 → FXP14.07.0100A','初期Cat-M1 / GNSS OFF'])
path([(700,395),(748,395),(748,548),(810,548)],arrow=True);label(756,568,'U01',10,BLUE)
box(810,280,290,125,'SAT  RockBLOCK 9704-ANT',['USB-C / Iridium IMT','一体patch antenna → 空','default cap充電 / 0.5A枠','IP routerではない'])
path([(700,325),(810,325)],arrow=True);label(743,342,'U02',10,BLUE)
para(405,235,695,'取り外すのは外部給電P01とLAN E01だけ。USBモデム・antenna・battery・保存媒体は一緒に持ち出す。LTE圏外から衛星への無断有料切替はしない。','body')
para(40,106,W-80,'組立図の確定と、実機で通信できることは別。回線開通、P2 adapter、電源/熱、RF同居・国内外適合は未受入。音声I/Oと単体光学表示は本通信BOMに未搭載。C-02の表示4条件は維持。','small')
nextpage()

head(2,'電源経路 / バッテリー / 着脱','外部電源はUPSだけへ。Pi本体のUSB-C、UPS予備MicroUSB、SAT V_BATT、LTE P1/H1からの二重給電を禁止する。')
box(40,510,230,125,'PSU  SC0218',['5.1V / 3A能力','Type-C captive cable','UPS IN実測上限5.2V','付属AC plugの地域照合'],POWER)
box(360,510,330,125,'UPS  PiSugar 3 Plus',['Type-C IN ← P01','同梱battery → PH2.0純正harness','5V OUT 最大3A / I2C 0x57,0x68','純正裏面contact + ねじ4本'],POWER)
path([(270,572),(360,572)],POWER,arrow=True)
box(810,510,330,125,'CORE  5V_SYSTEM',['UPS → Pi4 GPIO裏面bus','J8 pin2/4 = 5V / pin6等 = GND','J8 pin3 = SDA / pin5 = SCL','追加の5Vジャンパは不要'],POWER)
path([(690,572),(810,572)],POWER,arrow=True)
rows=[['負荷 / 5V','試作受入枠','備考'],['Pi4本体 + Wi-Fi/SD','1.50A','重いlocal LLM / raw fusion除外'],['LTE USBJ1','0.50A','HAT USB入力で測定する'],['SAT USB-C','0.50A','default cap充電、800mA linkは開放'],['FAN','0.18A','純正3線型'],['合計 / USB合計','2.68A / 1.00A','UPS 3A / USB全port 1.2A以内']]
table(40,460,620,rows,[.45,.20,.35])
box(715,255,425,205,'電力の読み方',['合計13.4W / UPS余裕0.32A','USB余裕0.20A / USB3は未使用','LTE 0.5AはUSB最大のメーカー保証ではない','始動・圏外scan・電池lowで枠を測定','超過時は不合格、制限解除や二重給電不可'],AMBER)
para(40,210,620,'5000mAh×仮定3.7V = 18.5Wh。効率0.85×使用率0.8を仮定すると12.58Wh、平均6Wで約2.10時間。実測航続時間ではない。初号目標1時間、20%で新規job停止、10%で保存→shutdown。残量値を実機校正する。','small')
para(715,210,425,'充電は電池区画を完全に開放し、換気された不燃台上で行う。電池0〜40°C、初号20〜30°C。CPU負荷/送信時は充電停止設定から確認。本体3A＋充電3Aではない。','small')
para(40,112,W-80,'通常着脱: 取り外し要求 → 固定worker入力停止/保存 → 旧grant失効 → RJ45抜去 → UPS Type-C抜去 → strap解除。UPS入力有無bitは機械的dock検出ではない。予告なしのpower/link断でも旧grantを閉じるadapterは未実装。','small')
nextpage()

head(3,'端子間配線 / USBとGPIO','完成ケーブルを使い、USB-CのCCや基板内部RFを手配線しない。J8は物理pin番号、BCMはSoCのGPIO番号。')
box(40,465,300,165,'COREの黒いUSB2 2段口',['基板から遠い上段 = U-LTE','基板に近い下段 = U-SAT','本設計のラベル / メーカー番号でない','青いUSB3×2: NC','USB合計設計1.0A / 上限1.2A'])
box(500,520,640,110,'U01 / StarTech USBAUB50CMBK / 0.5m',['U-LTE Type-A male → LTE USBJ1 Micro-B male','A:1 VBUS → Micro:1 / A:2 D− → Micro:2 / A:3 D+ → Micro:3','A:4 GND → Micro:5 / Micro:4 ID = NC / shieldは完成品のまま'])
path([(340,572),(500,572)],arrow=True)
box(500,365,640,110,'U02 / StarTech USB2AC50CM / 0.5m',['U-SAT Type-A male → SAT USB-C','USB2 data + 5V / SAT16pin全NC / V_BATT未接続','230400 baud初期 / 実USB ID・serial・portで識別 / 固定ttyUSB0にしない'])
path([(340,508),(410,508),(410,420),(500,420)],arrow=True)
table(40,405,360,[['J8 physical','信号 / 接続'],['3 / 5','SDA / SCL → UPS純正背面bus'],['4','5V → FAN赤'],['6','GND → FAN黒'],['8 (BCM14)','3.3V制御 → FAN青']],[.32,.68])
box(500,160,640,155,'LTE jumper / 手動起動',['P2 header: 2–3のみjumper（VCC_UP→3V3）','P2 4–5（PWR→P7）は外す / P1・H1は全未接続','USB供給だけで使い、基板K1/PWRKEY約1秒で起動','GPS1はNC + GNSS OFF / LTE1だけにMHF I antennaを接続','USB 5Vとheader 5Vは同じbus。外部5Vを追加しない'],SIGNAL)
para(40,180,360,'Pi USB-CはNC。fanの青線をつなぐpin8はUART console/TXと兼用させない。端子変更は全電源OFF、battery保持状態も確認して行う。','small')
para(40,100,W-80,'USB/GPIO線を切って継ぎ足さない。PiSugarの純正contactは取り付け位置を現物revisionで照合。図のbus対応は新しいpogo配列の製造図ではない。SATはdefault充電、RDY/列挙まで初回約40秒を見込み、短周期でpower cycleしない。','small')
nextpage()

head(4,'LTE / Wi-Fi / 衛星のRF配線','LTEと衛星のantenna、SIM、USB portを混同しない。衛星は小容量メッセージ経路。部品認証だけで完成miiの適合とはしない。')
box(40,460,320,180,'LTE / Waveshare 17693',['SIM7080G / Cat-M1のみ初期有効','USBJ1 = Micro-B data/power','LTE1 = IPEX receptacle','GPS1 = NC / GNSS OFF','SIM_CARD1 = 1.8V IoT SIM','nano + carrier supplied 3FF frame'])
box(450,500,320,140,'LTE-ANT / Taoglas',['FXP14.07.0100A','I-PEX MHF I plug（U.FL互換）','100mm coax / FPC 70×20mm','中心RF / shell GND / 無通電着座'],SIGNAL)
path([(360,550),(450,550)],SIGNAL,arrow=True)
box(850,460,290,180,'Wi-Fi / CORE内蔵',['Cypress CYW43455 / 基板内SDIO','2.4/5GHz 802.11ac','STAかAPのどちらか','AP+STA同時は初号対象外','Bluetooth初期OFF','基板antenna / 外部RF端子なし'],SIGNAL)
box(40,240,320,155,'SAT / 9704-ANT',['一体patch / 空へ向ける','USB-C 5V/serial入力','16pin全NC / V_BATT NC','95×72×16.5mm最大側で配置','SMA版/APNT/9603へ代替不可'])
box(450,240,690,155,'無線を同居させる条件は未受入',['9704-SMA設置資料は、同じhousing内の他の送信機を禁止する。','9704-ANTへの適用範囲・一体miiの追加試験/地域適合は未確認。','ANTだから例外、時間分割だから適合、内部隔壁だから別housingとはしない。','配線/非送信組立は進める。exact版と国別条件の確認前は送信releaseしない。','必要なら可搬podへ改版し、単体電源/200mm包絡を再受入する。'],AMBER)
para(40,180,530,'LTE: 国内carrier/APN/利用承認を確定し、現物firmwareとUSB PPPを検証。Cat-M1の公称帯域は小さく、高速4G routerや音声品質の保証ではない。Wi-Fi断でLTEへbulkを自動転送しない。','small')
para(620,180,520,'衛星: IMT bridgeへ有限message。初号payload≤1024bytes、再送≤2回、TTL15分は設計値。送信前に料金枠を確認。配送ACKをTool完了にしない。IP/Web/video hotspotへ一般化しない。','small')
para(40,97,W-80,'根拠: Waveshare回路図 / Taoglas FXP14 datasheet / Ground Control 9704 hardware・installation・specification。詳細URLと適用範囲は21章・JSON sources。RF同居、地域条件、回線契約を未解決のまま「通信可能」と出荷表示しない。','small')
nextpage()

head(5,'部品表 / Core 1台','電池はPiSugar付属pack、衛星antennaは9704-ANT一体品、Wi-FiはPi4内蔵品。裸セルやRFの自作回路は今回の配線に含めない。')
rows=[['ID / 数','型番・variant','端子 / 用途']]
for q in d['parts']:
 rows.append([q['id']+' / '+str(q['quantity'])+(' (任意)' if q['optional'] else ''),q['model'],q['connector']])
table(40,660,W-80,rows,[.12,.37,.51],sty='small')
para(40,160,W-80,'別途: carrier供給の1.8V/LTE-M用IoT SIM（nano + socket適合保持枠）。キャリア/APN/契約SKUは未選定。3V専用SIM不可、SIM_CARD1の現物寸法と保持を確認。MII-P2-MECH-01は本設計の加工品番号で、完成筐体の販売型番ではない。','small')
para(40,105,W-80,'部品受領時は型番/board revision/firmware/電池表示/地域表示を記録。代替品は端子・RF・電源を再照合する。価格/在庫・購入・サービス開通・OS導入は今回の成果ではない。','small')
nextpage()

head(6,'機械配置 / 充電点検口 / dock','180×160×90mmは部品配置の割当。200mm包絡の成立、穴位置、ケーブル曲げ、熱、RFの実機合格を表す製造図ではない。')
# Allocation top-view, approximate millimetre scale
x0,y0,s=70,200,2.5
c.setFillColor(PALE);c.setStrokeColor(BLUE);c.rect(x0,y0,180*s,160*s,fill=1,stroke=1)
label(x0,625,'上面配置枠 / 単位mm（模式図）',14,BLUE)
# upper sat in north band; lower main and LTE to east
box(x0+15*s,y0+87*s,95*s,68*s,'SAT / 上段',['最大95×72×16.5枠','patch↑ / 上方無金属','穴はメーカーCAD照合'],SIGNAL)
box(x0+15*s,y0+12*s,95*s,62*s,'CORE + UPS / 下段',['Pi4 + battery + fan','約95×70×35の基礎枠','fan/plugは別に余裕確保'])
box(x0+122*s,y0+15*s,45*s,75*s,'LTE',['65×30.5','SIM点検','USB接続'],SIGNAL)
label(x0+127*s,y0+128*s,'FPC側面',10,SIGNAL)
path([(x0+147*s,y0+121*s),(x0+147*s,y0+95*s)],SIGNAL,arrow=True)
label(x0+70*s,y0-25,'W = 180',12,BLUE)
label(x0+185*s,y0+80*s,'D = 160',12,BLUE)
box(650,450,490,180,'初号frame / MII-P2-MECH-01',['上下: 非導電板180×160×3mm ×2','角から10mm / φ3.2穴 / M3 nylon支柱80mm×4','batteryを圧迫しないretainer、露出pin guard','SAT下面5mm以上の絶縁間隔は設計目標','USB/同軸の曲げ・干渉は現物で照合','防水/IP等級なし / アンテナ上方に金属なし'])
box(650,235,490,170,'開放dock / 手動接続',['受け面184×164mm以上 + 保持strap','AC/DCは完成PSU、USB-C plug → UPS','RJ45は任意。両plugを外してからstrap解除','充電時: 点検口と電池区画を完全に開放','密閉袋/閉じた3D caseで充電しない','Core本体USB-CはNCのまま'],AMBER)
para(40,120,W-80,'配置の20mm離隔や絶縁5mmは本設計の目標値であり、RF認証条件を代用しない。電池/heatsink/USB shield/ねじをantenna直上に置かない。初号は非送信組立を先行し、RF同居条件が解決するまで閉箱送信releaseを保留する。','small')
nextpage()

head(7,'組立順 / 同一実機で確認すること','静的照合の合格は、電気試験・通信成功・共通OS受入ではない。作業再開時は本体/board/firmware/回線/OS imageの同じ組を記録する。')
rows=[['ID','確認すること','現在'],['P2-A01','型番/revision、電池、SIM寸法、端子、NC、配線、機構','NOT_RUN'],['P2-A02','low/full battery・cold start・scan・cap充電・CPU/Wi-Fi/fanで電圧/電流。UPS入力≤5.2V','NOT_RUN'],['P2-A03','10回着脱。boot ID継続、保存欠落0、二重job0、旧grant復活0。PC/phone WAN中継なし','NOT_RUN'],['P2-A04','国内LTE-M module/SIM/APN/RF、PPP/IP/DNS/TLS、切断復旧とusage','CARRIER / RF待ち'],['P2-A05','STA/APの個別受入、端末間分離、無許可転送0、共有quota/網側条件','NOT_RUN'],['P2-A06','ANT同居・日米条件、衛星往復、ACK喪失/TTL/重複/byte上限とJob保存','COLOCATION / PROVIDER待ち'],['P2-A07','記録profileで1時間、温度/電圧/電流、20%/10%停止と復旧。充電時区画開放','NOT_RUN'],['P2-A08','共通OSの作成/承認/停止/保存/再起動/結果照会、CoreとAGXの二重実行0','NOT_RUN']]
table(40,660,W-80,rows,[.11,.69,.20])
para(40,282,W-80,'組立: 無通電照合 → UPS/電池 → Pi/SD → fan → 許可された条件でLTE → 同居条件確認後SAT。5V railは4.75〜5.25V、UPS入力はメーカー上限5.2Vを別に測る。PSUの公称5.1Vだけで上限内と断定しない。USB/UPSの割当超過やbrownout時は改版する。','small')
para(40,210,W-80,'共通OS: 14章の仕事/本人性/権限/予算/保存を継承。Pi用BSP、電池/detach、USB PPP、実AP、9704 bridgeはP2実機adapterとして未実装/未受入。既存tethering・LinuxPacketGate・MessageAdapterを再利用する。account正本、端末cacheの原則は同じ。','small')
para(40,138,W-80,'資料: 21-portable-connectivity.md / portable-p2/bom-netlist.json / targets/mii-portable-p2/README.md。再生成: python3 docs/mii/design/portable-p2/render.py。静的照合: python3 docs/mii/design/portable-p2/check.py。全てローカル設計作業で、購入/契約/問い合わせ/無線送信/OS書込みは未実施。','small')
c.save()
print(str(out))
