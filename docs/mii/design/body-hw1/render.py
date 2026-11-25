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
p.add_argument('--output', default=str(ROOT / 'output/pdf/mii-body-hw1-wiring.pdf'))
p.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
a = p.parse_args()
d = json.loads((HERE / 'bom-netlist.json').read_text())
pdfmetrics.registerFont(TTFont('JP', a.font))
W, H = landscape(A3)
INK, BLUE, POWER, SIGNAL, AMBER, MUTED, PALE = map(HexColor, ['#172D3B','#1268A1','#B63232','#137B69','#94600E','#566B78','#F1F5F7'])
styles = {name: ParagraphStyle(name, fontName='JP', fontSize=size, leading=lead, textColor=INK, wordWrap='CJK') for name,size,lead in [('body',11,17),('small',9,13),('tiny',8,11)]}
out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(out), pagesize=(W,H), invariant=1)
c.setTitle('mii body HW1 | parts, connectors and assembly wiring')
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
 label(40,H-39,'mii  /  BODY HARDWARE  /  HW1',12,white)
 label(40,H-77,title,24,white)
 para(40,H-130,W-80,subtitle)
 c.setStrokeColor(MUTED);c.setLineWidth(.4);c.line(40,40,W-40,40)
 label(40,23,'2026-11-02  |  モジュール組立設計・未通電  |  正本: 19-body-hardware.md + body-hw1/bom-netlist.json',8,MUTED)
 label(W-115,23,f'{page} / 7',9,MUTED)

def nextpage():c.showPage()

head(1,'4 Tower + 専用Hub + 表示部','Macを常用演算機にしない本体構成。青線はEthernet/映像、赤線は電源。部品の能力と、共通OSを含む実機受入を分ける。')
for i,y in enumerate([570,440,310,180]):
 box(45,y,245,96,f'Tower T{i+1}', ['OAK-D Pro W PoE + Teensy 4.1','2 mic / radar / IMU / temp / SE','USW-Flex port1: 1GbE + PoE++'])
 path([(290,y+48),(360+i*18,y+48),(360+i*18,590-i*32),(455,590-i*32)],arrow=True)
 label(301,y+65,f'E01 / port{17+i}',9,BLUE)
box(455,440,315,205,'PSE  USW-Pro-24-PoE',['port17–20 → T1–T4 / 60W枠×4','400W PoE budget（消費の実測値ではない）','port25: SFP+ / UACC-CM-RJ45-MG-US','10GBASE-T / Cat6A 2m → HUB J17','AC: 付属cord / 接地を保持'])
box(845,415,300,230,'HUB  AGX Orin 64GB Dev Kit',['J17: 10GbE sensor LAN','J1: Samsung 980 PRO 1TB NVMe','J24: 同梱USB-C PD PSU','J18: DisplayPort（映像出口）','J33: 専用WAN adapter → 7枚目','共通OS / mii I/O adapter','BSP / adapter / firmwareの実機受入は別'])
path([(770,520),(845,520)],arrow=True);label(779,535,'10G',10,BLUE)
box(845,180,300,130,'PJ  BenQ TK710STi',['J18 → DP2HD4K60S → HDMM2M','HDMI1 / 初期1920×1080 60Hz','投影は壁1面、空中像ではない','AC: メーカー付属cord'])
path([(995,415),(995,310)],arrow=True);label(1011,358,'DP → HDMI',11,BLUE)
box(455,180,315,175,'HW1の運用境界',['sensor LANは隔離、IP forwarding OFF','CAMとTeensyは別endpoint','SE搭載だけでCAM認証済みとしない','Tower停止: upstreamを抜く / PSE OFF','cameraだけOFFではmic/RADは停止しない'],AMBER)
para(45,115,W-90,'4本のraw/encoded混在streamをHubへ集約する。初期payload予算は合計1.0343296Gbps。1Gbpsへfallbackした場合は4本streamを開始しない。120Hz同期、閉箱の放熱、転倒、光学4条件、実機での保存/復旧は未受入。','small')
nextpage()

head(2,'Tower 1本のEthernet / 電源配線','T1〜T4は同一。cameraは1GbE経路、controlは100Mbps経路。Ethernet/PoE内部接点は加工せず、指定の完成ケーブルを使う。')
box(45,495,265,165,'FLEX  USW-Flex / 底部',['port1 ← Hub port17/18/19/20','port2 → CAM / PoE + 1GbE','port3 → SPL / PoE + 100Mbps','port4/5: NC / 無効化'])
box(445,565,330,95,'CAM  OAK-D Pro W PoE',['A00574 / IMX378 / M12 X-coded 8pin','M8 aux: cap、全pin NC / IR初期OFF'])
path([(310,610),(445,610)],arrow=True);para(321,650,118,'E02 / 純正M12–RJ45 / 2m','small')
box(445,395,330,105,'SPL  Adafruit 3785',['PoE IN ← FLEX port3','RJ45 OUT: data only / 100Mbps','MicroUSB OUT: 5V 2.4A'])
path([(310,535),(365,535),(365,447),(445,447)],arrow=True);label(317,480,'E03 / Cat6A 2m',9,BLUE)
box(885,520,260,135,'ETH + MCU Ethernet',['PJRC ETHERNET_KIT','RJ45 OUT → MagJack','純正ribbon → 2×3 / 2mm header','Teensy 4.1 Ethernet PHY版 / 着脱socket'])
path([(775,475),(820,475),(820,580),(885,580)],arrow=True)
box(885,345,260,105,'USB  Adafruit 1833',['Micro-B receptacle','VBUS (pin1) / GND (pin5)','D+ / D− / ID: NC'],POWER)
path([(775,415),(885,415)],POWER,arrow=True)
box(45,185,265,135,'+5V_NODE / P01',['VBUS → F1 RXEF110 → +5V_NODE','MCU VIN / SW VIN','RLOAD 43Ω 2W → GND','CIN 100µF + 100nF → GND'],POWER)
path([(1000,345),(1000,330),(180,330),(180,320)],POWER,arrow=True)
box(445,185,330,135,'SW  Pololu 2810 → RAD',['VIN = +5V_NODE / GND共通','VOUT = +5V_RADAR → SEN0623 VIN','VOUTに10µF + 100nF → GND','slide OFF固定 / ON = MCU pin3'],POWER)
path([(310,250),(445,250)],POWER,arrow=True)
box(885,165,260,155,'3.3V / P03 + 共通GND',['MCU 3.3V → mic L/R・SE・TMP','mic R SEL → 3.3V','mic L SEL → GND','MCU外部3.3V負荷予算50mA','全低圧moduleのGNDを接続'],SIGNAL)
para(45,135,730,'F1は5V枝のPPTC。PoE線へ入れない。RLOADは最小負荷100mA対策、約0.58W発熱。難燃2W品を樹脂/基板から10mm浮かせる。電解capacitorの+は5V側。低圧電源AWG22、信号AWG26。','small')
para(885,135,260,'外部VINとPC USBを同時接続しない。全給電OFF後、Teensyをsocket/ribbonから外してMCU単体で書込。','small')
nextpage()

head(3,'Teensy GPIO / マイク / I2C / レーダー','数字はGPIO番号であり物理pinの通し番号ではない。全信号3.3V。signal harnessは100mm以内。MIC DOUT共有時は左右SELを必ず分ける。')
box(45,450,290,210,'MIC-L / MIC-R  Adafruit 3421',['L/R 3V ← MCU 3.3V / GND共通','L SEL → GND / R SEL → 3.3V','L/R BCLK ← MCU 21','L/R LRCL ← MCU 20','L/R DOUT → MCU 8','44.1kHz / 32bit slot / 2ch','BCLK 2.8224MHzを実測'])
box(455,425,275,235,'MCU  Teensy 4.1',['VIN ← +5V_NODE','3.3V → sensors / GND共通','21 BCLK / 20 LRCLK / 8 IN1','18 SDA / 19 SCL','3 radar enable / 4 presence','13 onboard LED（状態表示）','23 MCLK: NC'])
for i,s in enumerate(['21 → BCLK','20 → LRCL','8 ← DOUT']):
 y=595-i*44;path([(335,y),(455,y)],SIGNAL);label(345,y+9,s,9,SIGNAL)
box(850,480,295,180,'SE + TMP / I2C 100kHz',['SE: Adafruit 4314 / ATECC608','TMP: Adafruit 1782 / MCP9808','VIN=3.3V / GND共通','MCU18 → SDA / MCU19 → SCL','TMP 0x18 / SE IDを実物で照合','5V pullup禁止 / 鍵lock未実施'])
path([(730,575),(850,575)],SIGNAL);label(756,589,'18 / SDA',10,SIGNAL)
path([(730,535),(850,535)],SIGNAL);label(756,549,'19 / SCL',10,SIGNAL)
box(455,170,275,145,'SW  Pololu 2810',['MCU3 → ON / 100kΩ→GND','slide OFF固定','VIN=5V / VOUT→RAD VIN','reset / lease喪失でOFF','安全用の非常遮断器ではない'],POWER)
path([(570,425),(570,315)],SIGNAL);label(585,365,'3 / ENABLE',10,SIGNAL)
box(850,170,295,230,'RAD  DFRobot SEN0623',['VIN ← SW VOUT / GND共通','IO2 → MCU4 / 100kΩ→GND','IO2: 3.3V presence / fall mode','TX / RX / IO1: NC','工場mode・IO2の実動作を確認','初回はT1だけ有効、T2〜4 OFF','4台TDM・位置・速度は未実装'])
path([(730,265),(850,265)],POWER);label(756,278,'5V_RADAR',9,POWER)
path([(850,365),(790,365),(790,450),(730,450)],SIGNAL);label(745,410,'IO2 → 4',9,SIGNAL)
table(45,390,290,[['実装条件','初回確認'],['mic底面の孔','カバー/接着剤で塞がない'],['I2S wiring','左右channel / 符号 / bit alignment'],['I2C pullup','合成抵抗 / rise time'],['status LED','認識/有効/異常を区別'],['NC pin','浮いた線を付けず絶縁']],[.38,.62])
para(45,115,W-90,'Tower内の左右micは共通I2S clock。4 Tower間の8ch位相同期は未成立。camera M8 FSYNCは本図に接続しない。GPIOへ5Vやcamera同期端子を直結しない。機械可読正本にはP00〜P04・S01〜S07の全12 netを収録。','small')
nextpage()

head(4,'本体への配置 / 寸法 / 初期表示','HW1は開放治具で先に組み、実物の配線・熱を確認してから閉箱へ進む。下図は配置・包絡であり、量産加工図や固定強度の認定ではない。')
# Front elevation, scale 0.44 pt/mm.
x0,y0,s=210,170,.44
c.setFillColor(PALE);c.setStrokeColor(BLUE)
c.rect(x0-160*s,y0,320*s,70*s,fill=1)
c.rect(x0-30*s,y0+70*s,60*s,710*s,fill=1)
c.rect(x0-90*s,y0+780*s,180*s,220*s,fill=1)
label(62,650,'Tower 正面 / 包絡',14,BLUE)
path([(105,y0),(105,y0+1000*s)],MUTED,1);path([(96,y0),(114,y0)],MUTED,1);path([(96,y0+1000*s),(114,y0+1000*s)],MUTED,1)
label(45,390,'1000mm',11)
for y,text in [(y0+980*s,'head 180×180×220'),(y0+830*s,'mic L/R: 60mm間隔'),(y0+500*s,'柱 Ø60 / 肉厚3'),(y0+430*s,'露出長710mm'),(y0+38*s,'base Ø320×70')]:
 path([(x0+90*s,y),(330,y)],MUTED,1);label(340,y-4,text,10)
label(120,140,'底鋼板 Ø320×6 / 約3.79kg（穴前）',9)
para(45,118,450,'baseは初回から剛性のある治具へ固定。床用Ø7穴×4、R140 / 90°間隔。自立安定性・閉箱・歩行環境での使用は未受入。','small')
box(560,460,585,200,'head内の配置 / 180×220mm取付面',['上部: CAM、レンズ/IR出射部を開放。メーカー取付部で固定','前面: MIC-L/Rを60mm離す。底面の孔に音路を確保','下部: RAD、正面に金属を置かない。RF窓は未選定','裏側: MCU、SE、TMP、PROTO、SPL。絶縁スペーサーで固定','I2S / I2C / SW–RAD ≤100mm。2m cable余長はbase側へ','固定穴とねじ長はメーカー図・実物に合わせる。CAMへ穴加工しない'])
box(560,275,585,145,'Hub取付面 / 600×400mm以上',['USW-Pro-24-PoE: 442.4×285.4×43.7mm','Jetson / factory PSU / switchを別固定、吸排気を開放','sensor LANはJ17、映像はJ18、電源はJ24','旧目標250×200×60mmの閉箱Hubではない'])
box(560,90,585,145,'表示の初期配置',['TK710STi: 像幅2m → lens–wall 1.38〜1.66m','J18 DP → active adapter → HDMI1 / 1080p60','台形補正OFF、影/視線/停止時発光を実物で確認','壁1面の投影。空中像・上下全域・低眩しさは別の受入'],AMBER)
nextpage()

head(5,'Tower 4本分の部品表','数量は4 Towerの合計。型番のない受動部品は表の値・許容差・定格を注文仕様にする。地域AC品・在庫・受領board版は別途照合。')
rows=[['ID','型番 / 注文照合キー','全数','用途 / 端子']]
for q in d['parts']:
 if q['group']=='tower': rows.append([q['id'],q['model'],q['total'],q['connection']])
table(40,674,W-80,rows,[.095,.425,.05,.43],'tiny')
para(40,88,W-80,'追加: AWG22電源線、AWG26信号線、絶縁・熱収縮、固定用スペーサー/ねじ、ケーブル保持、180×220mm head取付板、柱/固定base。機構の取付穴は現物転写。電源・Ethernetは指定完成品を使い、PoE接点を手配線しない。','small')
nextpage()

head(6,'Hub部品 / 組立順 / 受入','これは配線設計の成果物。部品購入、実通電、firmware/adapter実装、製造・光学・閉箱合格を意味しない。全出典と詳細手順は19章。')
rows=[['ID','型番 / 注文照合キー','数','接続']]
for q in d['parts']:
 if q['group']!='tower':rows.append([q['id'],q['model'],q['total'],q['connection']])
table(40,675,W-80,rows,[.09,.43,.04,.44],'small')
box(40,145,530,210,'組立と初回確認',['1. 受領BOM / board版 / 電源銘板を照合','2. 全給電を外し、12 netの導通/短絡・極性を確認','3. RLOADだけで5V枝 → MCU / 3.3V → mic / RAD','4. CAM M12 → Hub 10G → DP / HDMI1の順に確認','5. T1 → T2 → T4へ増設、PoE再起動・60分負荷・温度','6. 同一WorkJobの入力 / 確認 / 保存 / 停止 / 再起動'],BLUE)
box(610,145,540,210,'残る実装・受入',['HW-A01〜04: 現物 / 電源 / sensors / 同時stream → NOT_RUN','HW-A05: watchdog / lease / 旧frame拒否 → firmware待ち','HW-A06: 共通OS / Broker / 保存復旧 → adapter待ち','HW-A07〜08: 光学 / 熱 / 転倒 / 閉箱 → NOT_RUN','120Hz HW同期、8ch位相、4 radar TDMは未成立','単体携帯C-01と表示4条件C-02は継続'],AMBER)
para(40,112,W-80,'図面再生成: python3 docs/mii/design/body-hw1/render.py　|　静的照合: python3 docs/mii/design/body-hw1/check.py<br/>一次資料: Luxonis / PJRC / Adafruit / DFRobot / Ubiquiti / Pololu / Littelfuse / NVIDIA / Samsung / BenQ / StarTech。URL一覧は19章 §9、JSON sources。外部通信と追加2部品は7枚目/20章。静的照合は実機ERC・負荷/波形測定ではない。','small')
nextpage()

head(7,'通信の追加配線 / HW1-COM1','既存のmii通信要件を保持する。ここで接続を選定するのは専用有線WAN。LTE/SIM・Wi-Fi AP・衛星・携帯coreは別の実機受入を要する。')
box(45,480,290,165,'Tower / sensor LAN',['T1〜T4 → PoE switch','10GbE → HUB J17','10.77.0.0/24候補 / 隔離','default gatewayなし','家庭routerやguestへbridgeしない'])
box(455,440,275,205,'HUB / 共通RockstarOS',['J17: sensor interface','J33のUSB-A空口: COM1と付番','USB NIC = WAN interface','interface名は現物を読戻す','既存Broker / job / quota / 保存','IP forwarding OFFから開始'])
path([(335,560),(455,560)],BLUE,arrow=True)
box(850,480,295,165,'WAN-NIC / USB31000S',['J33 COM1 → USB-A male','ASIX AX88179A / 実SKU照合','5V USB bus power / 4.5W枠','RJ45 / 1GbE','Jetson BSP driver認識は実機で確認'])
path([(730,560),(850,560)],BLUE,arrow=True);label(750,579,'USB',10,BLUE)
box(850,260,295,145,'既存router / 許可済みWAN',['WAN-NIC RJ45 → router LAN','NLBL-2M-CAT6A-PATCH / 2m','subnet衝突・IP/DNS/route確認','新規回線契約 / 設定変更は未実施'])
path([(995,480),(995,405)],BLUE,arrow=True)
box(45,210,685,185,'未選定 / 未配線のradio拡張',['LTE: 日本、LTEのみ、IoT data SIM、試作nano SIM。carrier / APN / modem SKUを固定してから接続','Wi-Fi: STAとAPを別能力で受入。radio / antenna未選定、APはOFF','衛星: 日米の小容量si / message / file。9704 / NB-NTNは既存の比較候補','SIM登録 ≠ 本人利用権 ≠ cloud成功。配送ACK ≠ Tool完了','切断時は保存/停止、回復時は同じIDで照会。無断の有料fallback・job再送をしない'],AMBER)
para(45,160,W-90,'携帯C-01: 別Hubに演算/通信を残したままでは、Towerを外して単独通信できない。可搬coreに演算・保存・本人性・電池・modem・Wi-Fi・antennaを収める後続設計と、同一閉箱の実測が必要。19章HW1の成功で携帯要求を達成扱いにしない。','small')
para(45,99,W-90,'正本: 20-connectivity.md / body-hw1/communications.json。既存実装: tethering/controller・LinuxPacketGate・ManagedAP・NetworkQuota・MessageAdapter/Service。COM-A01〜06は実機未受入。購入・開通・無線送信は行っていない。','small')
c.save()
print(json.dumps({'output':str(out),'pages':7,'revision':d['revision'],'communicationsRevision':'HW1-COM1'},ensure_ascii=False))
