from pathlib import Path
import re, math, json, html
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable, KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'work/rocket_design'
OUT=ROOT/'outputs'
OUT.mkdir(exist_ok=True)
pdfmetrics.registerFont(TTFont('JP', '/Library/Fonts/Arial Unicode.ttf'))
pdfmetrics.registerFontFamily('JP',normal='JP',bold='JP',italic='JP',boldItalic='JP')
NAVY=colors.HexColor('#18323F'); TEAL=colors.HexColor('#087E83'); INK=colors.HexColor('#233B48')
LIGHT=colors.HexColor('#EEF6F6'); GRAY=colors.HexColor('#62747D'); RULE=colors.HexColor('#D7E1E5')
W,H=A4; LEFT=47; RIGHT=47; BW=W-LEFT-RIGHT
styles={
 'body':ParagraphStyle('body',fontName='JP',fontSize=10,leading=16.8,textColor=INK,spaceAfter=9,wordWrap='CJK'),
 'h2':ParagraphStyle('h2',fontName='JP',fontSize=17,leading=25,textColor=NAVY,spaceAfter=17,keepWithNext=True,wordWrap='CJK'),
 'h3':ParagraphStyle('h3',fontName='JP',fontSize=11.2,leading=18,textColor=TEAL,spaceBefore=10,spaceAfter=7,keepWithNext=True,wordWrap='CJK'),
 'cell':ParagraphStyle('cell',fontName='JP',fontSize=8.8,leading=14,textColor=INK,wordWrap='CJK'),
 'headcell':ParagraphStyle('headcell',fontName='JP',fontSize=8.8,leading=14,textColor=colors.white,wordWrap='CJK'),
 'caption':ParagraphStyle('caption',fontName='JP',fontSize=8,leading=12.5,textColor=GRAY,spaceAfter=8,wordWrap='CJK'),
 'toc':ParagraphStyle('toc',fontName='JP',fontSize=9.8,leading=18,textColor=INK,wordWrap='CJK'),
 'big':ParagraphStyle('big',fontName='JP',fontSize=29,leading=41,textColor=NAVY,wordWrap='CJK'),
 'sub':ParagraphStyle('sub',fontName='JP',fontSize=15,leading=24,textColor=TEAL,wordWrap='CJK'),
}

def rich(s):
    # Escape first, then turn Markdown links into native PDF hyperlinks.
    s=html.escape(s)
    s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:f'<link href="{m.group(2)}" color="#087E83">{m.group(1)}</link>',s)
    return s

class DesignDoc(BaseDocTemplate):
    def __init__(self,path):
        super().__init__(str(path),pagesize=A4,leftMargin=LEFT,rightMargin=RIGHT,topMargin=49,bottomMargin=44,
            title='RETURN-1 / AVOKADO LINK 両段再使用ロケット統合設計書',author='Design Study',pageCompression=1)
        self.chapter_pages=[]
        self.addPageTemplates(PageTemplate(id='main',frames=[Frame(LEFT,44,BW,H-93,id='main',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.footer))
    def beforeDocument(self):
        self.chapter_pages=[]
    def footer(self,c,doc):
        if doc.page==1:return
        c.saveState();c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
        c.setFont('JP',7);c.setFillColor(GRAY);c.drawString(LEFT,21,'RETURN-1 / AVOKADO LINK   0.1   |   基本設計・未実証')
        c.drawRightString(W-RIGHT,21,str(doc.page));c.restoreState()
    def afterFlowable(self,flowable):
        if getattr(flowable,'chapter',None):
            title=flowable.getPlainText();key=flowable.chapter
            self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0,False)
            self.notify('TOCEntry',(0,title,self.page,key))
            self.chapter_pages.append({'title':title,'page':self.page})

class Overview(Flowable):
    def __init__(self):super().__init__();self.width=BW;self.height=400
    def draw(self):
        c=self.canv
        def box(x,y,w,h,label,fill=LIGHT):
            c.setFillColor(fill);c.setStrokeColor(TEAL);c.setLineWidth(.8);c.roundRect(x,y,w,h,6,fill=1,stroke=1)
            p=Paragraph(label,ParagraphStyle('diagram',parent=styles['cell'],alignment=1,fontSize=10,leading=16))
            pw,ph=p.wrap(w-18,h-10);p.drawOn(c,x+9,y+(h-ph)/2)
        def arrow(x1,y1,x2,y2):
            c.setStrokeColor(TEAL);c.setFillColor(TEAL);c.setLineWidth(1.2);c.line(x1,y1,x2,y2)
            a=math.atan2(y2-y1,x2-x1);p=c.beginPath();p.moveTo(x2,y2);p.lineTo(x2-7*math.cos(a-.45),y2-7*math.sin(a-.45));p.lineTo(x2-7*math.cos(a+.45),y2-7*math.sin(a+.45));p.close();c.drawPath(p,fill=1,stroke=0)
        box(0,307,142,70,'RETURN-1<br/>両段再使用ロケット')
        box(181,307,142,70,'550km参照軌道<br/>500kg級衛星 × 2')
        box(360,307,140,70,'衛星通信<br/>受信・中継・保存')
        arrow(142,342,181,342);arrow(323,342,360,342)
        box(0,192,142,70,'第1段を海上回収<br/>第2段を指定場へ回収')
        arrow(71,307,71,262)
        box(0,77,142,70,'点検・修理・認定<br/>同じ機体で再飛行')
        arrow(71,192,71,147)
        box(359,192,141,70,'アンテナ・無線機<br/>内蔵 / 屋外案を比較')
        arrow(430,307,430,262)
        box(359,77,141,70,'avocadoMini<br/>認証・保存・表示')
        arrow(430,192,430,147)
        box(181,192,142,70,'地上ゲートウェイ<br/>配信・ネット接続')
        arrow(252,262,252,307)
        box(181,77,142,70,'端末20cmの参照設計<br/>ゲーム・3眼・4マイク')
        arrow(323,112,359,112)
        c.setFont('JP',8);c.setFillColor(GRAY);c.drawString(0,41,'機能構成図。寸法・軌道・通信範囲を縮尺で表した図ではない。')
        c.drawString(0,24,'衛星は軌道で運用を継続する。帰ってくる対象はロケットの両段。')

def table(rows):
    n=len(rows[0]); weights={2:[.31,.69],3:[.26,.27,.47],4:[.19,.26,.26,.29]}[n]
    # Numeric budgets benefit from equal numeric columns.
    if n==3 and ('第1段' in rows[0][1] or '下り' in rows[0][1]):weights=[.50,.25,.25]
    if n==4 and rows[0][0] in ('条件','案'):weights=[.32,.18,.18,.32]
    if n==3 and rows[0][0] in ('ID','ICD'):weights=[.13,.27,.60]
    if n==4 and rows[0][0]=='案':weights=[.19,.26,.36,.19]
    data=[[Paragraph(rich(v),styles['headcell'] if i==0 else styles['cell']) for v in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=12)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),
        ('LINEBELOW',(0,-1),(-1,-1),.5,RULE),
    ]));return t

core=(WORK/'01_core.md').read_text()
mass=(WORK/'mass_section.md').read_text()
text=core.replace('{{MASS_SECTION}}',mass.strip())+'\n\n'+(WORK/'02_link.md').read_text()
assert '{{' not in text
mdpath=OUT/'RETURN-1_Avokado_Link_Design_v0.1.md';mdpath.write_text(text)

story=[Spacer(1,38),Paragraph('RETURN-1',styles['big']),Paragraph('AVOKADO LINK',styles['sub']),Spacer(1,36),
       Paragraph('両段再使用ロケット<br/>小型通信衛星<br/>avocadoMini 統合設計書',styles['big']),Spacer(1,31),
       Paragraph('打ち上げる。両段が帰る。<br/>衛星から、avokadoへ届ける。',styles['sub']),Spacer(1,30)]
story.append(table([['検討の基準','本版の構成'],['ロケット','約620t級 / 無人2段式 / 両段の回収・再飛行を要求'],['衛星','500kg級2機 / 高度550km・傾斜角53度を仮定'],['端末','Mini200 E1の20cm本体へ衛星通信を追加検討'],['設計段階','基本設計・机上評価。実機・実飛行の成立は未検証']]))
story.extend([Spacer(1,20),Paragraph('Version 0.1  |  2026.09.21',styles['caption']),Paragraph('帰還用推進剤、熱防護、整備寿命、試験、衛星通信と端末統合までを含む。数値の根拠と未確定事項は本文に記載する。',styles['body']),PageBreak()])
story.append(Paragraph('内容',styles['h2']))
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.extend([toc,Spacer(1,18),Paragraph('本文中の数値は「既存設計からの参照」「本案の目標・仮定」「仮定からの計算」を区別して読む。計算の整合は、構造・熱・通信・飛行性能の実証ではない。',styles['caption']),PageBreak(),Paragraph('全体構成と帰還の対象',styles['h2']),Overview(),Spacer(1,15),Paragraph('下り受信だけの配信と、上りを伴うインターネットを区別する。衛星2機は初期実証構成であり、常時接続を保証しない。外付けアンテナは比較候補として扱う。',styles['body'])])

body=text[text.index('## 01 '):]
lines=body.splitlines(); i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line.startswith('## '):
        story.append(PageBreak()); p=Paragraph(rich(line[3:]),styles['h2']);p.chapter='chapter-'+line[3:5];story.append(p);i+=1
    elif line.startswith('### '):
        if line=='### 感度と設計変更の判断':
            story.extend([PageBreak(),Paragraph('05 質量予算と上昇性能 / 続き',styles['h2'])])
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
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|')):
            para.append(lines[i].strip());i+=1
        s=' '.join(para)
        style=styles['caption'] if re.match(r'^\[S\d+\]|^\[L1\]',s) else styles['body']
        story.append(Paragraph(rich(s),style))

pdfpath=OUT/'RETURN-1_Avokado_Link_Design_v0.1.pdf'
doc=DesignDoc(pdfpath);doc.multiBuild(story)
reader=PdfReader(pdfpath)
page_texts=[p.extract_text() or '' for p in reader.pages]
(WORK/'pdf_page_text.json').write_text(json.dumps(page_texts,ensure_ascii=False,indent=2))
(WORK/'chapter_pages.json').write_text(json.dumps(doc.chapter_pages,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdfpath),'markdown':str(mdpath),'pages':len(reader.pages),'characters':len(text),'chapters':doc.chapter_pages,'page_characters':[len(t) for t in page_texts]},ensure_ascii=False,indent=2))
