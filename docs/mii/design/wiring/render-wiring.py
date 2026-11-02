#!/usr/bin/env python3
"""Render W1 assembly drawings from the scoped BOM; no device access."""
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
parser = argparse.ArgumentParser()
parser.add_argument('--output', default=str(ROOT / 'output/pdf/mii-prototype-wiring.pdf'))
parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
args = parser.parse_args()
bom = json.loads((HERE / 'bom.json').read_text())
pdfmetrics.registerFont(TTFont('JP', args.font))
W, H = landscape(A3)
NAVY, BLUE, GREEN, AMBER, GRAY = map(HexColor, ['#132C40','#136FAD','#137B69','#A45609','#556575'])
style = ParagraphStyle('body', fontName='JP', fontSize=11, leading=17, textColor=NAVY, wordWrap='CJK')
small = ParagraphStyle('small', parent=style, fontSize=9, leading=13)
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(output), pagesize=(W,H), invariant=1)
c.setTitle('mii W1 - parts and assembly wiring')
c.setAuthor('RockstarOS mii design')

def text(x, y, s, size=12, color=NAVY):
    c.setFillColor(color); c.setFont('JP', size); c.drawString(x,y,s)

def para(x,y,w,s,sty=style):
    p=Paragraph(s,sty); _,h=p.wrap(w,H); p.drawOn(c,x,y-h); return h

def header(n,title,subtitle):
    c.setFillColor(NAVY); c.rect(0,H-105,W,105,fill=1,stroke=0)
    text(40,H-38,'mii  /  W1  /  2026-11-02',12,white)
    text(40,H-73,title,25,white)
    para(40,H-122,W-80,subtitle)
    c.setStrokeColor(HexColor('#D5DFE7')); c.line(40,44,W-40,44)
    text(40,26,'配線設計 / 実機未試験  |  正本: docs/mii/design/18-parts-wiring.md  |  市販完成品の端子間接続',9,GRAY)
    text(W-90,26,f'{n} / 3',10,GRAY)

def box(x,y,w,h,title,lines,color=BLUE):
    c.setFillColor(HexColor('#F3F7FA')); c.setStrokeColor(color); c.setLineWidth(1.5)
    c.roundRect(x,y,w,h,8,fill=1,stroke=1)
    text(x+16,y+h-28,title,16,color)
    para(x+16,y+h-43,w-32,'<br/>'.join(escape(line) for line in lines))

def line(points,color=BLUE,dashed=False):
    c.setStrokeColor(color); c.setLineWidth(2)
    c.setDash(5,4) if dashed else c.setDash()
    p=c.beginPath();p.moveTo(*points[0])
    for xy in points[1:]:p.lineTo(*xy)
    c.drawPath(p); c.setDash()
    for x,y in (points[0],points[-1]):
        c.setFillColor(color);c.circle(x,y,3,fill=1,stroke=0)

def tab(x,top,width,rows,widths,font=small):
    cells=[[Paragraph(escape(str(v)),font) for v in row] for row in rows]
    t=Table(cells,colWidths=[width*v for v in widths],repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#E4EDF3')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),0.4,HexColor('#C7D4DD')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    _,h=t.wrap(width,H);t.drawOn(c,x,top-h);return h

header(1,'P0b  |  手持ちMac + カメラ・マイク','共通OSの仕事・権限・保存を維持。Macは開発hostとして使い、内蔵画面で確認する。P0aは内蔵camera/micだけでも着手可能。')
box(55,450,275,170,'C01  BRIO 500',['Logitech / Graphite','US MPN: 960-001493','camera + 内蔵mic','付属clipで固定 / shutterあり'])
box(465,405,360,235,'H01  MacBook Pro',['14-inch / November 2024','Apple M4 / 16GB','macOS Sequoia 15.7.4','U1: USB-C / Thunderbolt 4','内蔵画面・keyboard・battery','U1/U2は今回付ける配線ラベル'])
line([(330,535),(465,535)])
para(340,600,115,'W01<br/>固定USB-C<br/>1.5m<br/>映像 + 音声<br/>bus power',small)
box(900,435,235,135,'条件付き: projector',['型番・HDMI INを確認後','D01 / HDMM2M / 2m','初回は未接続'],AMBER)
line([(825,495),(900,495)],AMBER,True)
text(840,510,'W08',10,AMBER)
box(55,285,275,115,'給電',['P0はMac内蔵batteryで開始','充電器の型番・定格は未確認','適合確認後にMagSafe 3へ'],GREEN)
line([(330,342),(645,342),(645,405)],GREEN,True)
para(365,329,480,'別売USB Hub / USB micは不要。<br/>Mac充電器の仕様を画像から推測しない。',small)
tab(55,245,W-110,[['接続後に確認','合格との区別'],['指定camera / mic、権限、実解像度・fps、入力停止','現sourceは640×480・15fps ideal / 最大30fps。機材の60fps上限と別。'],['指先選択 → 内容確認 → 保存 → event読戻し → 再起動','同じowner / job / expected revision。今回実物での実行はNOT_RUN。'],['日本語端末内ASRのavailable / installed pack','非対応ならtext入力。mic認識だけで音声操作を合格にしない。'],['shutter / camera停止 / 音声停止 / USB切断','shutterだけではmic停止の証拠にならない。WorkJob停止とは別。']],[0.43,0.57])
para(55,83,W-110,'一次資料: Apple 121552 / Logitech BRIO 500 product data + setup guide（出典S01-S03）。Mac以外の所持、購入、通電は未確認。',small)
c.showPage()

header(2,'P1a  |  Pi 5 センサーノード 1台','市販ケーブルを指定端子へ接続する。端子の配置図ではないので、現物の印字と接点向きを照合する。同期・PoE・IR照明は含めない。')
box(45,535,240,115,'H01  Mac / U2',['空きUSB-C端子','W02: adapter固定plug','共通OS / WorkJob'])
box(365,535,270,115,'E01  Belkin',['F2CU040btBLK','USB-C → RJ45','Gigabit Ethernet'])
line([(285,590),(365,590)]); text(304,603,'W02',10)
box(365,250,375,195,'N01  Raspberry Pi 5 / 4GB',['RJ45: 1000BASE-T / dataのみ','USB-C POWER: P01専用電源','CAM/DISP1: 22pin / 0.5mm','FAN: 専用4pin / microSD: S01','GPIO / PCIe / CAM/DISP0: NC'])
line([(500,535),(500,445)]); para(517,510,255,'W03: E02 / N6PATC2MBK<br/>Cat6 2m / RJ45 - RJ45',small)
box(45,275,240,155,'P01  Pi公式 27W PSU',['US plug / 使用地適合を照合','USB-C固定cable','Pi用rail: 5.1V / 5A','Mac USBから給電しない'],GREEN)
line([(285,352),(365,352)],GREEN); text(305,366,'W04',10,GREEN)
box(865,285,275,170,'C02  GS Camera',['SC0715 / IMX296 / IR-cut','camera CSI: 15pin / 1mm','L01: 6mm CS-mount lens','M01: MTPIXI-B / 1/4-20','XTR / XVS / MAS: NC'])
line([(740,370),(865,370)]); para(752,436,105,'W05 / F01<br/>Camera Cable<br/>Standard-Mini<br/>200mm',small)
box(865,535,275,115,'T01  Active Cooler',['Pi 5用 / 同梱FAN cable','W06 → FAN 4pin','FFC装着後にcoolerを固定'],GREEN)
line([(1000,535),(1000,490),(680,490),(680,445)],GREEN)
text(805,505,'W06',10,GREEN)
box(365,105,375,90,'S01  microSD / 64GB A2',['W07: microSD slotへ / 無通電で挿抜','R01で準備した64-bit Pi OS / image版を記録'])
line([(550,195),(550,250)]);text(561,217,'W07',10)
para(45,220,255,'組立順<br/>1. 全給電を外す<br/>2. FFCをCAM/DISP1へ<br/>3. cooler / lens / 固定具<br/>4. SD / LAN<br/>5. 最後にP01を接続',small)
para(865,244,275,'FFC: 接点はlock flapと反対側。<br/>15-15同梱cableはPi 5に使わない。<br/>Display Cableと取り違えない。<br/><br/>trigger padsは未接続。<br/>3.3V GPIOを直結しない。',small)
para(45,79,W-90,'LAN接続だけではbrowserのcameraにならない。capture・認証・時刻/校正adapterは未実装/未受入。原寸RAW10/60fpsの無圧縮LAN送信は採用しない。',small)
c.showPage()

header(3,'BOM  |  部品照合と最初の確認','数量はP0b＋P1aを各1式。所持確認済みはH01のみ。型番が確認できない公式品は容量・長さ・地域variantまで照合する。')
rows=[['ID','選定品 / 型番・variant','数','接続 / 備考']]
for item in bom['parts']:
    rows.append([item['id'], item['model'],item['quantity'],item['summary']])
tab(40,665,W-80,rows,[0.055,0.42,0.045,0.48])
para(40,192,540,'<b>初期設定</b><br/>W09: R01のUSB-C側 → Mac空きport、S01 → readerのmicroSD slot。公式ImagerでPi 5 / 64-bit OS、本人user、SSH公開鍵、初期Wi-Fiを設定し、書込verify後にeject。SDをPiへ移す。OS書込は今回未実行。',small)
para(625,192,520,'<b>通電後の記録</b><br/>IMX296列挙・実画像・focus・fan・低電圧/温度・LAN link・切断復帰を確認。その後、16章の同一job保存/再起動試験へ。2台同期、最終光学4条件、独立発光停止は別gate。',small)
para(40,102,W-80,'一次資料URLと実行予定手順は18章S01-S18参照。主要資料: raspberrypi.com/products / documentation、logitech.com、belkin.com、media.startech.com、manfrotto.com。',small)
c.save()
print(output)
