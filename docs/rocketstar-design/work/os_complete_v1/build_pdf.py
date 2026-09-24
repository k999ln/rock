from pathlib import Path
import json,re,html,math
R=Path(__file__).resolve().parents[2]
exec((R/'work/colony_v1/build_pdf.py').read_text().split('\nassets=')[0])
from reportlab.platypus import CondPageBreak
WOR=R/'work/os_complete_v1';PACK=R/'outputs/RockstarOS_Complete_Design_v1_0';STEM='RockstarOS_Complete_Design_v1_0'
styles['toc'].fontSize=9.2;styles['toc'].leading=14.3
class CompleteDoc(DesignDoc):
 def __init__(self,path):
  super().__init__(path);self.title='RockstarOS 設計書完全版 v1.0';self.author='RockstarOS / rocketstar System Design'
 def footer(self,c,doc):
  c.saveState()
  if doc.page==1:
   c.setFillColor(SILVER);c.rect(0,H-14,W,14,fill=1,stroke=0)
  else:
   c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
   c.setFont('JP',7);c.setFillColor(GRAY);c.drawString(LEFT,21,'ROCKSTAROS / DESIGN v1.0   |   2026.09.24   |   設計仕様・実機運用の受入は未完了')
   c.drawRightString(W-RIGHT,21,str(doc.page))
  c.restoreState()
def table(rows):
 n=len(rows[0]);weights={2:[.29,.71],3:[.25,.35,.40],4:[.12,.33,.12,.43],5:[.15,.22,.21,.20,.22]}[n]
 if rows[0][0]=='資料ID':weights=[.13,.39,.48]
 if rows[0][0]=='論理サービス':weights=[.24,.38,.38]
 def cell(v,i,j):
  s=rich(v)
  if i and j==0 and rows[0][0]=='遷移' and '→' in v and stringWidth(v,'JP',8.8)>BW*weights[0]-12:s=s.replace('→','→<br/>')
  return Paragraph(s,styles['headcell'] if i==0 else styles['cell'])
 data=[[cell(v,i,j) for j,v in enumerate(row)] for i,row in enumerate(rows)]
 t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=12)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,RULE)]));return t

def architecture():
 d=Drawing(BW,342)
 label(d,0,327,'機能と故障境界 / 物理配置・台数の確定図ではない',9,TEAL,'start')
 box(d,0,248,153,54,['avokado E3 / Shell','4 Towers + Edge Hub','入力・表示・現地の資格'])
 box(d,174,248,153,54,['A-LINK / 外部通信','蓄積転送・期限・宛先','回線断でも現地は継続'])
 box(d,348,248,153,54,['地球側 / 遠隔拠点','状態の複製・提案','現地で再判定'])
 box(d,0,143,327,65,['RockstarOS Operations Core','仕事・資源・資産・権限・履歴','Linux / Buildroot 継承'],SILVER)
 box(d,348,143,153,65,['rocketstar / 衛星管理','専用飛行計算機','cFS + RTEMS 評価候補'])
 arrow(d,76,248,76,208);arrow(d,250,248,250,208);arrow(d,424,248,424,208)
 arrow(d,327,175,348,175)
 box(d,0,56,153,51,['機器の局所制御','電力・空気・水・熱','機器ごとの認定profile'])
 box(d,174,56,153,51,['独立保護・現地警報','電源・バスも分離検証','OS／AI停止と切り離す'])
 box(d,348,56,153,51,['機上センサー・操作系','機体ごとの局所mission','地上の返事を待たない'])
 arrow(d,76,143,76,107);arrow(d,424,143,424,107)
 label(d,250,21,'共通化するもの：身元・型・状態・仕事・証拠・版。制御は各機器の側に置く。',9,TEAL)
 return d

def lifecycle():
 d=Drawing(BW,200)
 label(d,0,194,'指令状態と確認対象 / Workの状態とは別に保持',9,TEAL,'start')
 for i,t in enumerate([['提案を保存','PREPARED'],['承認を拘束','APPROVED'],['送信claimを保存','DISPATCH_CLAIMED']]):
  x=i*174;box(d,x,141,153,42,t)
  if i<2:arrow(d,x+153,162,x+174,162)
 box(d,348,63,153,50,['装置が判定・実行','ACCEPTED / EXECUTING','証拠が一致→SUCCEEDED'])
 arrow(d,424,141,424,113)
 box(d,174,63,153,50,['結果不明 / UNKNOWN','装置記録・現物を照合','executeの自動再送なし'])
 arrow(d,348,88,327,88)
 box(d,0,63,153,50,['送信前だけ','EXPIRED / CANCELLED','claim不存在を確認'])
 arrow(d,76,141,76,113)
 label(d,0,36,'拒否・確認済み失敗は理由付きで記録。受理・設定保存・物理作用を区別する。',9,INK,'start')
 label(d,0,16,'過去receiptだけで現在状態を証明しない。UNKNOWN中のWorkはactiveの照合待ち。',9,TEAL,'start')
 return d

assets={'{{ARCHITECTURE}}':(architecture(),'architecture.svg','5つの配備profile。図の矢印は許可された契約経路で、任意操作の許可を表さない。'),'{{COMMAND_FLOW}}':(lifecycle(),'command_lifecycle.svg','機器証明のないときはBrokerの照会状態を返す。機器resultを補作しない。')}
for dr,name,cap in assets.values():
 renderSVG.drawToFile(dr,str(PACK/name));p=PACK/name;p.write_text(p.read_text().replace('font-family: JP',"font-family: 'Arial Unicode MS', sans-serif"))
text=(WOR/'assembled.md').read_text();markdown=text
for token,(_,name,cap) in assets.items():markdown=markdown.replace(token,f'![{cap}]({name})\n\n{cap}')
assert '{{' not in markdown
(PACK/(STEM+'.md')).write_text(markdown)
cover=Drawing(BW,78);cover.add(Rect(0,4,BW,66,rx=8,ry=8,fillColor=SILVER,strokeColor=None));cover.add(Rect(20,14,36,46,rx=12,ry=12,fillColor=NAVY,strokeColor=None))
for yy in [24,37,50]:cover.add(Circle(38,yy,2.2,fillColor=CYAN,strokeColor=None))
label(cover,78,41,'ONE OPERATING FOUNDATION',12,NAVY,'start');label(cover,78,21,'rocketstar / A-LINK / avokado / colony',10,INK,'start')
story=[Spacer(1,15),Paragraph('ROCKSTAROS',styles['big']),Paragraph('COMPLETE DESIGN / v1.0',styles['sub']),Spacer(1,22),cover,Spacer(1,24),Paragraph('設計書完全版',styles['big']),Paragraph('基盤OS・機上ソフト・現地運用<br/>接続・権限・保存・復旧・検証',styles['sub']),Spacer(1,21)]
story.append(table([['設計の範囲','この版に収録するもの'],['32章の基準書','5配備profile、13論理サービス、60要求と受入条件'],['機体と衛星','rocketstar各段・A-LINK管理系と通信系の接続境界'],['操作と拠点','avokado E3、現地の設備・仕事・資源・貨物'],['実装へ渡す付録','7型schema、合成例、5表DDL、台帳、一次資料'],['検証の到達点','43/43の構造・DDL検査。旧35件模型試験を別管理']]))
story.extend([Spacer(1,13),Paragraph('2026.09.24 / OS・システムソフトの設計基準',styles['caption']),Paragraph('機体製造・飛行制御・有人居住の認定仕様は、機器とミッションの入力を確定し、実装・実機試験で閉じる。',styles['caption']),PageBreak(),Paragraph('内容',styles['h2'])])
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.extend([toc,Spacer(1,13),Paragraph('読む順序：01–04 全体、05–14 基盤と指令、15–19 通信・認証、20–24 機上と設備、25–32 運用・受入・根拠。付属ファイルの構成はREADMEを参照。',styles['caption'])])
lines=text[text.index('## 01'):].splitlines();i=0
while i<len(lines):
 s=lines[i].strip()
 if not s:i+=1;continue
 if s in assets:
  dr,_,cap=assets[s];story.extend([dr,Spacer(1,5),Paragraph(cap,styles['caption'])]);i+=1
 elif s.startswith('## '):
  story.append(PageBreak());p=Paragraph(rich(s[3:]),styles['h2']);p.chapter='chapter-'+s[3:5];story.append(p);i+=1
 elif s.startswith('### '):story.extend([CondPageBreak(90),Paragraph(rich(s[4:]),styles['h3'])]);i+=1
 elif s.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   raw=[x.strip() for x in lines[i].strip().strip('|').split('|')]
   if not all(re.fullmatch('[-: ]+',x) for x in raw):rows.append(raw)
   i+=1
  assert len({len(r) for r in rows})==1,rows;story.append(table(rows))
 else:
  para=[s];i+=1
  while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','{{')):
   para.append(lines[i].strip());i+=1
  story.append(Paragraph(rich(' '.join(para)),styles['body']))
pdf=PACK/(STEM+'.pdf');doc=CompleteDoc(pdf);doc.multiBuild(story)
reader=PdfReader(pdf);pages=[p.extract_text() or '' for p in reader.pages];whole='\n'.join(pages)
for expected in ['43/43','OSR-060','cFS','RTEMS','DISPATCH_CLAIMED','deviceResult','44.91','5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0']:assert expected in whole,expected
assert '{{' not in whole and len(doc.chapter_pages)==32
(WOR/'qa/pdf_content.json').write_text(json.dumps({'pages':len(pages),'chapters':doc.chapter_pages,'pageCharacters':[len(p) for p in pages],'textAssertions':'PASS'},ensure_ascii=False,indent=2))
(WOR/'qa/pdf_page_text.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdf),'pages':len(pages),'chapters':len(doc.chapter_pages),'shortPages':[(i+1,len(p)) for i,p in enumerate(pages) if len(p)<250]},ensure_ascii=False))
