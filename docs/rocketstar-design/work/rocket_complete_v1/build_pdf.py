from pathlib import Path
import json,re,html,math
R=Path(__file__).resolve().parents[2]
exec((R/'work/colony_v1/build_pdf.py').read_text().split('\nassets=')[0])
from reportlab.platypus import CondPageBreak,Image
WOR=R/'work/rocket_complete_v1';PACK=R/'outputs/rocketstar_Complete_Design_R1_0';STEM='rocketstar_Complete_Design_R1_0'
styles['toc'].fontSize=9.1;styles['toc'].leading=14
styles['body'].fontSize=9.8;styles['body'].leading=16.2
styles['cell'].fontSize=8.5;styles['cell'].leading=13.3
styles['headcell'].fontSize=8.5;styles['headcell'].leading=13.3

class CompleteDoc(DesignDoc):
 def __init__(self,p):
  super().__init__(p);self.title='rocketstar ロケット完全版設計書 R1.0';self.author='rocketstar System Design'
 def footer(self,c,doc):
  c.saveState()
  if doc.page==1:
   c.setFillColor(SILVER);c.rect(0,H-14,W,14,fill=1,stroke=0)
  else:
   c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
   c.setFont('JP',7);c.setFillColor(GRAY);c.drawString(LEFT,21,'rocketstar / R1.0   |   2026.09.24   |   統合システム設計・製造/飛行リリース未取得')
   c.drawRightString(W-RIGHT,21,str(doc.page))
  c.restoreState()

def table(rows):
 n=len(rows[0]);weights={2:[.32,.68],3:[.25,.35,.40],4:[.19,.28,.22,.31],5:[.22,.17,.17,.17,.27]}[n]
 if rows[0][0]=='要求ID / 章':weights=[.135,.31,.14,.415]
 if rows[0][0]=='資料ID':weights=[.12,.42,.46]
 if rows[0][0]=='ICD / 接続':weights=[.25,.26,.49]
 if rows[0][0]=='未確定の入力':weights=[.50,.32,.18]
 if rows[0][0]=='区分' and rows[0][1]=='旧比較点の扱い':weights=[.20,.25,.55]
 if rows[0][0]=='状態' and n==5:weights=[.32,.16,.16,.11,.25]
 data=[[Paragraph(rich(v),styles['headcell'] if i==0 else styles['cell']) for v in row] for i,row in enumerate(rows)]
 t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=11)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,RULE)]));return t

def ecosystem():
 d=Drawing(BW,269)
 label(d,0,254,'搭載・制御・通信・回収の境界 / 接続方式を示す機能図',9,TEAL,'start')
 box(d,0,183,153,48,['rocketstar 第1段','自段の機上制御・帰還'])
 box(d,174,183,153,48,['rocketstar 第2段','衛星搭載・投入・帰還'])
 box(d,348,183,153,48,['A-LINK衛星','放出後は軌道で運用'])
 arrow(d,153,207,174,207);arrow(d,327,207,348,207)
 box(d,0,96,153,48,['海上回収・整備','同じ機番の再飛行'])
 box(d,174,96,153,48,['陸上回収・整備','同じ機番の再飛行'])
 box(d,348,96,153,48,['地上ゲートウェイ / E3','利用者通信・操作'])
 arrow(d,76,183,76,144);arrow(d,250,183,250,144);arrow(d,424,183,424,144)
 box(d,0,15,501,49,['RockstarOS / 管制・運用・構成・履歴','機上の局所制御と独立。avokadoの電源ボタンを飛行操作にしない。'],SILVER)
 for x in [76,250,424]:arrow(d,x,96,x,64)
 return d

def vehicle_layout():
 d=Drawing(BW,339)
 label(d,0,323,'機能配置 / 縮尺なし・断面寸法なし・機器個数を示さない',9,TEAL,'start')
 # Two schematic views of the upper stage: no inferred dimensions from artwork.
 x=46;wid=103
 d.add(Rect(x,130,wid,165,rx=30,ry=30,fillColor=SILVER,strokeColor=TEAL,strokeWidth=1))
 d.add(Rect(x+24,207,55,60,rx=10,ry=10,fillColor=NAVY,strokeColor=None))
 for yy in [221,237,253]:d.add(Circle(x+51.5,yy,2.1,fillColor=CYAN,strokeColor=None))
 d.add(Line(x,191,x+wid,191,strokeColor=TEAL,strokeWidth=.8))
 label(d,x+wid/2,176,'推進・電装',9);label(d,x+wid/2,160,'機能領域',9)
 d.add(Rect(x,111,wid,19,fillColor=LIGHT,strokeColor=TEAL,strokeWidth=.8));label(d,x+wid/2,116,'段間・分離',8)
 d.add(Rect(x,23,wid,88,rx=6,ry=6,fillColor=SILVER,strokeColor=TEAL,strokeWidth=1));label(d,x+wid/2,75,'第1段',10);label(d,x+wid/2,55,'推進・電装',9);label(d,x+wid/2,39,'回収機能',9)
 label(d,97,303,'風下面 / 上段と第1段',9,TEAL)
 label(d,174,267,'上段衛星室',9,INK,'start');label(d,174,251,'保持式扉',9,INK,'start');arrow(d,169,257,125,250)
 label(d,174,122,'段間構造は保持',9,INK,'start');arrow(d,170,125,147,122)
 label(d,174,56,'脚・舵面・エンジン',9,INK,'start');label(d,174,41,'個数・寸法は未定',9,INK,'start')
 xx=361
 d.add(Rect(xx,130,103,165,rx=30,ry=30,fillColor=NAVY,strokeColor=TEAL,strokeWidth=1))
 label(d,412,234,'第2段',10,colors.white);label(d,412,211,'連続する',10,colors.white);label(d,412,192,'熱防護面',10,colors.white)
 label(d,412,303,'上段風上面',9,TEAL)
 label(d,412,104,'扉は風下面側',9,TEAL);label(d,412,86,'材料・厚さ・取付は',8.5);label(d,412,70,'熱/構造設計で決定',8.5)
 return d

def lifecycle():
 d=Drawing(BW,286)
 label(d,0,271,'ミッションの進行と再使用の証拠 / 飛行実行手順ではない',9,TEAL,'start')
 box(d,0,204,153,45,['製造・受入・搭載','機番・構成・実測'])
 box(d,174,204,153,45,['結合飛行・段分離','各段の状態を確認'])
 box(d,348,204,153,45,['投入・衛星放出','機番・離隔・受領'])
 arrow(d,153,226,174,226);arrow(d,327,226,348,226)
 box(d,174,123,153,47,['第1段の帰還','海上回収・機体確保'])
 box(d,348,123,153,47,['第2段の帰還','貨物/TPS/扉の状態'])
 arrow(d,250,204,250,170);arrow(d,424,204,424,170)
 box(d,174,37,153,47,['点検・修理・寿命','次便への適合判定'])
 box(d,348,37,153,47,['同じ両段で再飛行','再投入・再回収の証拠'])
 arrow(d,250,123,250,84);arrow(d,424,123,424,101);arrow(d,424,101,290,84);arrow(d,327,60,348,60)
 label(d,0,146,'放出後の衛星は',9,INK,'start');label(d,0,130,'軌道運用を継続',9,INK,'start')
 label(d,0,62,'着陸と再飛行適合を',9,TEAL,'start');label(d,0,46,'別の成功判定にする',9,TEAL,'start')
 label(d,0,8,'残留衛星・扉異常・損傷不明は、正常帰還可能と自動判定しない。',9,TEAL,'start')
 return d

assets={
 '{{SYSTEM_DIAGRAM}}':(ecosystem(),'rocketstar_system.svg','衛星が軌道で運用を続け、ロケット両段が帰還する。管制通信と利用者通信は別仕様。'),
 '{{VEHICLE_LAYOUT}}':(vehicle_layout(),'rocketstar_functional_layout.svg','設計領域の配置を示す模式図。実際の区画位置・機器数・タンク形状を確定する図ではない。'),
 '{{LIFECYCLE_DIAGRAM}}':(lifecycle(),'rocketstar_reuse_lifecycle.svg','飛行・回収・再飛行の状態と証拠の関係。矢印は自動実行の許可を表さない。')}
for dr,name,cap in assets.values():
 renderSVG.drawToFile(dr,str(PACK/name));p=PACK/name;p.write_text(p.read_text().replace('font-family: JP',"font-family: 'Arial Unicode MS', sans-serif"))
text=(WOR/'assembled.md').read_text();markdown=text
for token,(_,name,cap) in assets.items():markdown=markdown.replace(token,f'![{cap}]({name})\n\n{cap}')
art='reference_c3/rocketstar_C3_external_concept.png'
markdown=markdown.replace('{{EXTERIOR_IMAGE}}',f'![C3保存済み外観参考・生成意匠図]({art})')
assert '{{' not in markdown
(PACK/(STEM+'.md')).write_text(markdown)
sects=json.loads((PACK/'sections.json').read_text())['items'];req=json.loads((PACK/'requirements.json').read_text())['items']
cover=Drawing(BW,74);cover.add(Rect(0,3,BW,66,rx=8,ry=8,fillColor=SILVER,strokeColor=None));cover.add(Rect(20,13,36,46,rx=12,ry=12,fillColor=NAVY,strokeColor=None))
for yy in [23,36,49]:cover.add(Circle(38,yy,2.2,fillColor=CYAN,strokeColor=None))
label(cover,80,40,'TWO STAGES. RETURN. REUSE.',12,NAVY,'start');label(cover,80,21,'rocketstar / A-LINK / RockstarOS / avokado',10,INK,'start')
story=[Spacer(1,18),Paragraph('rocketstar',styles['big']),Paragraph('COMPLETE SYSTEM DESIGN / R1.0',styles['sub']),Spacer(1,22),cover,Spacer(1,28),Paragraph('ロケット完全版設計書',styles['big']),Paragraph('両段再使用・無人小型衛星輸送<br/>機体・飛行・回収・整備の統合設計',styles['sub']),Spacer(1,25)]
story.append(table([['収録範囲','R1.0の内容'],[f'{len(sects)}章の統合設計','構造、推進、熱防護、飛行力学、電装、搭載品、地上設備、再使用'],['設計を追跡する付録',f'{len(req)}要求・18全体接続・40設計項目・13衛星ICD'],['質量・性能の監査','原本再現、4,790数値照合、衛星残留と帰還量の比較'],['採用済み要求','第1段・第2段を回収し、同じ機体を再使用'],['本版の到達点','統合システム設計。製造図面・実機性能・飛行認定は未完了']]))
story.extend([Spacer(1,18),Paragraph('2026.09.24 / R1.0  |  C3機体基準 + OS v1.0 接続境界',styles['caption']),Paragraph('618.6t・819.7tは過去の比較計算値。打上げ能力や機体寸法の確定値として採用していない。',styles['caption']),PageBreak(),Paragraph('内容',styles['h2'])])
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.append(toc)
lines=text[text.index('## 01'):].splitlines();i=0
while i<len(lines):
 s=lines[i].strip()
 if not s:i+=1;continue
 if s in assets:
  dr,_,cap=assets[s];story.extend([dr,Spacer(1,5),Paragraph(cap,styles['caption'])]);i+=1
 elif s=='{{EXTERIOR_IMAGE}}':
  story.extend([Image(str(PACK/art),width=BW,height=BW*2/3),Spacer(1,7)]);i+=1
 elif s.startswith('## '):
  story.append(PageBreak());p=Paragraph(rich(s[3:]),styles['h2']);p.chapter='chapter-'+s[3:5];story.append(p);i+=1
 elif s.startswith('### '):story.extend([CondPageBreak(85),Paragraph(rich(s[4:]),styles['h3'])]);i+=1
 elif s.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   vals=[v.strip() for v in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch('[-: ]+',v) for v in vals):rows.append(vals)
   i+=1
  assert len({len(r) for r in rows})==1,rows;story.append(table(rows))
 else:
  para=[s];i+=1
  while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','{{')):
   para.append(lines[i].strip());i+=1
  story.append(Paragraph(rich(' '.join(para)),styles['body']))
pdf=PACK/(STEM+'.pdf');doc=CompleteDoc(pdf);doc.multiBuild(story)
reader=PdfReader(pdf);pages=[p.extract_text() or '' for p in reader.pages];whole='\n'.join(pages)
for expected in ['4,790','RSR-060','RDR-040','上段だけ','軌道離脱前','cFS','RTEMS','10,290','819.656','同じ個体','未完了']:assert expected in whole,expected
assert '{{' not in whole and len(doc.chapter_pages)==len(sects)
(WOR/'qa/pdf_content.json').write_text(json.dumps({'pages':len(pages),'chapters':doc.chapter_pages,'pageCharacters':[len(p) for p in pages],'textAssertions':'PASS'},ensure_ascii=False,indent=2))
(WOR/'qa/pdf_page_text.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdf),'pages':len(pages),'chapters':len(doc.chapter_pages),'shortPages':[(i+1,len(p)) for i,p in enumerate(pages) if len(p)<300]},ensure_ascii=False))
