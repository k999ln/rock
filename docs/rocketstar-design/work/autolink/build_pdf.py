from pathlib import Path
base = Path(__file__).resolve().parents[1] / 'rocket_design/build_design.py'
exec(base.read_text().split('\ncore=')[0])
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from reportlab.graphics import renderSVG

WORK=ROOT/'work/autolink'
STEM='A-LINK_Avokado_Auto_Connect_Design_v0.3'

class AutoDoc(DesignDoc):
    def __init__(self,path):
        super().__init__(path)
        self.title='A-LINK / AVOKADO 自動接続 統合基本設計 v0.3'
    def footer(self,c,doc):
        if doc.page==1:return
        c.saveState();c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
        c.setFont('JP',7);c.setFillColor(GRAY);c.drawString(LEFT,21,'A-LINK / AVOKADO   0.3   |   基本設計・実機未検証')
        c.drawRightString(W-RIGHT,21,str(doc.page));c.restoreState()

def label(d,x,y,t,size=10,color=INK,anchor='middle'):
    d.add(String(x,y,t,fontName='JP',fontSize=size,fillColor=color,textAnchor=anchor))

def box(d,x,y,w,h,lines,fill=LIGHT):
    d.add(Rect(x,y,w,h,rx=5,ry=5,fillColor=fill,strokeColor=TEAL,strokeWidth=.8))
    for i,line in enumerate(lines): label(d,x+w/2,y+h/2+(len(lines)-1)*7-i*14-3,line)

def arrow(d,x1,y1,x2,y2,both=False):
    d.add(Line(x1,y1,x2,y2,strokeColor=TEAL,strokeWidth=1.1))
    def tip(x,y,ang):
        d.add(Polygon([x,y,x-6*math.cos(ang-.45),y-6*math.sin(ang-.45),x-6*math.cos(ang+.45),y-6*math.sin(ang+.45)],fillColor=TEAL,strokeColor=None))
    a=math.atan2(y2-y1,x2-x1);tip(x2,y2,a)
    if both:tip(x1,y1,a+math.pi)

def network():
    d=Drawing(BW,290)
    box(d,143,243,214,40,['配信・認証サービス'])
    box(d,0,157,140,46,['許可済みWi-Fi','ルーター・地上網'])
    box(d,180,157,140,46,['契約済み携帯回線','基地局・地上網'])
    box(d,360,157,140,46,['衛星ゲートウェイ','フィーダーリンク'])
    arrow(d,165,243,70,203,True);arrow(d,250,243,250,203,True);arrow(d,335,243,430,203,True)
    box(d,360,83,140,43,['A-LINK衛星','利用者リンク'])
    arrow(d,430,157,430,126,True)
    box(d,120,7,260,48,['avokado / 接続管理','認証・受信・保存・再開'])
    arrow(d,70,157,70,31,True);arrow(d,70,31,120,31)
    arrow(d,250,157,250,55,True)
    arrow(d,430,83,430,31,True);arrow(d,430,31,380,31)
    label(d,70,114,'優先 1',9,GRAY);label(d,250,113,'優先 2',9,GRAY);label(d,430,64,'優先 3 / 小データ',8,GRAY)
    return d

def satellite():
    d=Drawing(BW,328)
    blue=colors.HexColor('#254765');gold=colors.HexColor('#BEA579')
    label(d,0,308,'展開時の機能配置 / B-H1',11,TEAL,'start')
    # Antenna shown face-on. Other components are separated for clarity.
    d.add(Rect(194,231,112,35,fillColor=gold,strokeColor=NAVY))
    label(d,250,245,'機器区画',9)
    for x in [20,365]:
        d.add(Rect(x,163,115,61,fillColor=blue,strokeColor=NAVY))
        for q in range(1,6):d.add(Line(x+q*115/6,163,x+q*115/6,224,strokeColor=colors.HexColor('#86ABC1'),strokeWidth=.5))
        for yy in [183,203]:d.add(Line(x,yy,x+115,yy,strokeColor=colors.HexColor('#86ABC1'),strokeWidth=.5))
    d.add(Line(135,194,164,194,strokeColor=NAVY,strokeWidth=3));d.add(Line(336,194,365,194,strokeColor=NAVY,strokeWidth=3))
    d.add(Rect(164,151,172,86,fillColor=LIGHT,strokeColor=TEAL,strokeWidth=1.5))
    for x in [207,250,293]:d.add(Line(x,151,x,237,strokeColor=RULE,strokeWidth=.7))
    for yy in [172,194,216]:d.add(Line(164,yy,336,yy,strokeColor=RULE,strokeWidth=.7))
    label(d,250,197,'地球側の平面アンテナ',10)
    label(d,250,179,'面積・分割数は未確定',8,GRAY)
    label(d,77,236,'太陽電池',9);label(d,422,236,'太陽電池',9)
    label(d,355,282,'宇宙側：放熱面',9)
    d.add(Line(318,278,285,266,strokeColor=GRAY,strokeWidth=.7))
    arrow(d,250,151,250,117)
    label(d,250,101,'地球へ / avokadoとの通信',10,TEAL)
    d.add(Line(0,84,BW,84,strokeColor=RULE))
    label(d,0,65,'収納時',10,TEAL,'start')
    d.add(Rect(100,13,119,47,fillColor=gold,strokeColor=NAVY))
    d.add(Rect(89,13,9,47,fillColor=blue,strokeColor=NAVY))
    d.add(Rect(221,13,9,47,fillColor=blue,strokeColor=NAVY))
    d.add(Rect(99,8,121,7,fillColor=LIGHT,strokeColor=TEAL))
    label(d,159,32,'折り畳んで保持',9)
    label(d,259,46,'分離後に展開・固定',9,INK,'start')
    label(d,259,27,'収納包絡と干渉は詳細設計で確認',8,GRAY,'start')
    return d

figures={'{{NETWORK_DIAGRAM}}':(network(),'A-LINK_network_v0.3.svg','三経路の構成図。双方向の通信を想定し、衛星経路はゲートウェイと端末の同時可視を必要とする。'),
         '{{SATELLITE_DIAGRAM}}':(satellite(),'A-LINK_B-H1_layout_v0.3.svg','非縮尺の配置検討図。背面要素をずらして示す。パネル数、寸法、展開機構、部品の性能は未確定。')}

original_table=table
def table(rows):
    n=len(rows[0]);weights={2:[.30,.70],3:[.32,.32,.36],4:[.19,.24,.35,.22]}[n]
    if rows[0][0]=='ID':weights=[.12,.23,.65]
    if n==3 and '下り' in rows[0][1]:weights=[.50,.25,.25]
    if n==3 and '本体内' in rows[0][1]:weights=[.40,.22,.38]
    cell=styles['cell'];head=styles['headcell']
    if n==4:
        cell=ParagraphStyle('statecell',parent=cell,fontSize=8.3,leading=13)
        head=ParagraphStyle('statehead',parent=head,fontSize=8.3,leading=13)
    data=[[Paragraph(rich(v),head if i==0 else cell) for v in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=12)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,RULE)]))
    return t

text=(WORK/'assembled.md').read_text()
md=text
for token,(drawing,name,caption) in figures.items():
    renderSVG.drawToFile(drawing,str(OUT/name))
    svg=(OUT/name).read_text().replace("font-family: JP", "font-family: 'Arial Unicode MS', sans-serif")
    (OUT/name).write_text(svg)
    md=md.replace(token,f'![{caption}]({name})\n\n{caption}')
assert '{{' not in md
(OUT/(STEM+'.md')).write_text(md)

story=[Spacer(1,32),Paragraph('A-LINK',styles['big']),Paragraph('AVOKADO AUTO CONNECT',styles['sub']),Spacer(1,40),Paragraph('衛星・携帯回線・Wi-Fi<br/>自動切替 統合基本設計',styles['big']),Spacer(1,27),Paragraph('電源を入れる。使える回線を探す。<br/>つながり直して、受信を続ける。',styles['sub']),Spacer(1,28)]
story.append(table([['採用した方針','本版の内容'],['接続','許可Wi-Fi → 携帯 → 衛星小データを自動選択'],['端末','Mini200 E1へ通信機能・アンテナ・再開処理を追加設計'],['衛星','B-H1平面通信面の配置 / 初期2機は通信実証'],['輸送','RETURN-1の両段回収・再使用という要件を継続'],['設計段階','基本設計。実機受信、実ネットワーク、飛行は未検証']]))
story.extend([Spacer(1,18),Paragraph('Version 0.3  |  2026.09.21',styles['caption']),Paragraph('全経路が届かない場所では受信待ちになる。具体的な切替条件、通信予算、衛星配置の比較、受入試験を収録する。',styles['body']),PageBreak(),Paragraph('内容',styles['h2'])])
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.extend([toc,Spacer(1,18),Paragraph('採用した構成、試作の仮設定、計算結果、未検証の性能を区別する。ロケットの基礎検討はRETURN-1統合設計v0.1を参照し、通信方針は本版を優先する。',styles['caption'])])

lines=text[text.index('## 01 '):].splitlines();i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line in figures:
        drawing,_,caption=figures[line];story.extend([drawing,Spacer(1,7),Paragraph(caption,styles['caption'])]);i+=1
    elif line.startswith('## '):
        story.append(PageBreak());p=Paragraph(rich(line[3:]),styles['h2']);p.chapter='chapter-'+line[3:5];story.append(p);i+=1
    elif line.startswith('### '):
        story.append(Paragraph(rich(line[4:]),styles['h3']));i+=1
    elif line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            raw=[x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch('[-: ]+',x) for x in raw):rows.append(raw)
            i+=1
        assert len({len(r) for r in rows})==1
        story.append(table(rows))
    else:
        para=[]
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','{{')):
            para.append(lines[i].strip());i+=1
        s=' '.join(para);style=styles['caption'] if re.match(r'^\[S\d+\]|^\[L1\]',s) else styles['body']
        story.append(Paragraph(rich(s),style))

pdfpath=OUT/(STEM+'.pdf');doc=AutoDoc(pdfpath);doc.multiBuild(story)
reader=PdfReader(pdfpath);texts=[p.extract_text() or '' for p in reader.pages]
(WORK/'chapter_pages.json').write_text(json.dumps(doc.chapter_pages,ensure_ascii=False,indent=2))
(WORK/'pdf_page_text.json').write_text(json.dumps(texts,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdfpath),'pages':len(texts),'characters':len(md),'chapters':doc.chapter_pages,'page_characters':[len(x) for x in texts]},ensure_ascii=False,indent=2))
