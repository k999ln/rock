from pathlib import Path
import shutil, csv, hashlib, zipfile
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
BASE = (ROOT/'work/rocket_design/build_design.py').read_text()
exec(BASE.split('\ncore=')[0])
from reportlab.platypus import Image
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Polygon, Ellipse, Path as GPath
from reportlab.graphics import renderSVG

WORK=ROOT/'work/design_freeze'
PACK=ROOT/'outputs/RETURN-1_C1_package'
PACK.mkdir(exist_ok=True)
STEM='RETURN-1_C1_Integrated_Design_Baseline'
LABELS={'requirement_locked':'要求固定','architecture_selected':'方式選定','analysis_assumption':'解析仮定','open':'未確定','certified':'認定証拠あり'}

def rich(s):
    s=html.escape(str(s))
    s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:f'<link href="{m.group(2)}" color="#087E83">{m.group(1)}</link>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'\1',s)
    return s

class C1Doc(DesignDoc):
    def __init__(self,path):
        super().__init__(path)
        self.title='RETURN-1 C1 統合設計基準書'
        self.author='RETURN-1 Design Study'
    def footer(self,c,doc):
        if doc.page==1:return
        c.saveState();c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
        c.setFont('JP',7);c.setFillColor(GRAY)
        c.drawString(LEFT,21,'RETURN-1  /  C1    |    外観・方式の基準案    |    製造・飛行 未承認')
        c.drawRightString(W-RIGHT,21,str(doc.page));c.restoreState()

def table(rows):
    n=len(rows[0]);weights={2:[.30,.70],3:[.24,.34,.42],4:[.26,.24,.25,.25],5:[.18,.2,.2,.2,.22]}[n]
    if rows[0][0]=='ID':weights=[.10,.41,.49]
    if rows[0][0]=='台帳ID':weights=[.14,.31,.17,.38]
    if rows[0][0]=='配分':weights=[.31,.19,.5]
    cell=styles['cell'];head=styles['headcell']
    data=[[Paragraph(rich(v),head if i==0 else cell) for v in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=12)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,RULE)]))
    return t

def label(d,x,y,t,size=10,color=INK,anchor='middle'):
    d.add(String(x,y,t,fontName='JP',fontSize=size,fillColor=color,textAnchor=anchor))
def box(d,x,y,w,h,lines,fill=LIGHT):
    d.add(Rect(x,y,w,h,rx=4,ry=4,fillColor=fill,strokeColor=TEAL,strokeWidth=.8))
    for i,t in enumerate(lines):label(d,x+w/2,y+h/2+(len(lines)-1)*7-i*14-3,t,9)
def arrow(d,x1,y1,x2,y2,both=False):
    d.add(Line(x1,y1,x2,y2,strokeColor=TEAL,strokeWidth=1.0))
    def tip(x,y,a):d.add(Polygon([x,y,x-5*math.cos(a-.45),y-5*math.sin(a-.45),x-5*math.cos(a+.45),y-5*math.sin(a+.45)],fillColor=TEAL,strokeColor=None))
    a=math.atan2(y2-y1,x2-x1);tip(x2,y2,a)
    if both:tip(x1,y1,a+math.pi)

def rocket_layout():
    d=Drawing(BW,346)
    label(d,0,328,'機能配置基準 / 非縮尺・内部形状は未設計',10,TEAL,'start')
    x=88;y=24;w=58
    d.add(Rect(x,y,w,162,fillColor=colors.HexColor('#E7E6E0'),strokeColor=NAVY))
    d.add(Rect(x,186,w,10,fillColor=TEAL,strokeColor=NAVY))
    d.add(Rect(x,196,w,80,fillColor=LIGHT,strokeColor=NAVY))
    d.add(Polygon([x,276,x+10,293,x+29,310,x+48,293,x+58,276],fillColor=LIGHT,strokeColor=NAVY))
    # Functional regions only; not tanks, bulkheads or structural stations.
    label(d,x+w/2,245,'上段',11);label(d,x+w/2,99,'第1段',11)
    label(d,x+w/2,12,'同径案',8,GRAY)
    for yv,txt in [(286,'衛星室・保持式扉'),(219,'上段の推進・電装'),(191,'機体側に保持する段間部'),(123,'第1段の推進・電装'),(49,'着陸装置・点検アクセス')]:
        d.add(Line(146,yv,184,yv,strokeColor=GRAY,strokeWidth=.7));label(d,190,yv-3,txt,9,INK,'start')
    d.add(Line(335,24,335,308,strokeColor=RULE))
    label(d,423,293,'上段・断面の考え方',9,TEAL)
    d.add(Ellipse(423,236,46,29,fillColor=LIGHT,strokeColor=NAVY))
    d.add(Line(379,228,388,211,strokeColor=NAVY,strokeWidth=6))
    d.add(Line(388,211,414,207,strokeColor=NAVY,strokeWidth=6))
    d.add(Line(414,207,440,209,strokeColor=NAVY,strokeWidth=6))
    label(d,423,184,'風上：熱防護面',9)
    label(d,423,273,'風下：搭載扉側',9)
    label(d,423,133,'径・長さ・厚さ',9,GRAY)
    label(d,423,117,'翼面・脚の形と数',9,GRAY)
    label(d,423,101,'エンジン型式・個数',9,GRAY)
    label(d,423,76,'実解析で決める',10,TEAL)
    return d

def satellite_layout():
    d=Drawing(BW,267);blue=colors.HexColor('#254765');gold=colors.HexColor('#BEA579')
    label(d,0,249,'B-H1 / 配置を選定、寸法・性能は未確定',10,TEAL,'start')
    for x in [20,371]:
        d.add(Rect(x,130,110,63,fillColor=blue,strokeColor=NAVY))
        for q in range(1,6):d.add(Line(x+q*110/6,130,x+q*110/6,193,strokeColor=colors.HexColor('#86ABC1'),strokeWidth=.5))
        d.add(Line(x,161,x+110,161,strokeColor=colors.HexColor('#86ABC1'),strokeWidth=.5))
    d.add(Line(130,161,166,161,strokeColor=NAVY,strokeWidth=2));d.add(Line(335,161,371,161,strokeColor=NAVY,strokeWidth=2))
    d.add(Rect(194,205,113,20,fillColor=gold,strokeColor=NAVY));label(d,250,212,'機器区画',8)
    d.add(Rect(166,121,169,85,fillColor=LIGHT,strokeColor=TEAL))
    label(d,250,165,'地球側の通信面',11);label(d,250,147,'面積・分割数は未確定',8,GRAY)
    label(d,75,204,'太陽電池',9);label(d,426,204,'太陽電池',9)
    label(d,381,222,'宇宙側：放熱面',9)
    arrow(d,250,121,250,90);label(d,250,72,'地球へ',9,TEAL)
    label(d,0,40,'収納：展開物を折り畳んで保持。衛星放出後に展開・固定。',9,INK,'start')
    label(d,0,22,'包絡・電力・熱・指向・分離を同じ構成で成立させる。',9,GRAY,'start')
    return d

def network_layout():
    d=Drawing(BW,267)
    label(d,0,249,'自前衛星網と、先行する端末実証は別系統',10,TEAL,'start')
    box(d,0,164,142,48,['A-LINK 衛星','自前網・開発対象'])
    box(d,180,164,141,48,['地上ゲートウェイ','配信・認証サービス'])
    box(d,361,164,140,48,['許可 Wi-Fi／携帯','地上網'])
    arrow(d,142,188,180,188,True);arrow(d,321,188,361,188,True)
    box(d,0,74,142,48,['自前網の端末無線機','周波数・波形未確定'])
    arrow(d,71,164,71,122,True)
    box(d,180,74,141,48,['E3 Edge Hub','受信・保存・自動切替'])
    arrow(d,142,98,180,98,True);arrow(d,431,164,431,98);arrow(d,431,98,321,98)
    label(d,251,52,'4本の Motion Tower',9)
    d.add(Line(0,39,BW,39,strokeColor=RULE))
    label(d,0,20,'別系統の実証：Hub - 別筐体9704 - Iridium - Cloudloop',9,TEAL,'start')
    return d

def mass_chart():
    d=Drawing(BW,190);x0=155;x1=477;mn=8500;mx=10500
    def xp(v):return x0+(v-mn)/(mx-mn)*(x1-x0)
    vals=[('旧 B0',10323.645203),('D20 / R4.9 / Isp低下',9660.9),('D22 / R6 / 公称',9576.1),('D24 / R8 / Isp低下',8906.9)]
    # Values obtained again from the recorded JSON to avoid chart transcription.
    calc=json.loads((WORK/'mass_study.json').read_text())
    requests=[(18,4,330,370),(20,4.9,320,360),(22,6,330,370),(24,8,320,360)]
    for k,req in enumerate(requests):
        row=next(r for r in calc['sensitivity'] if (r['s2_dry_t'],r['s2_return_t'],r['isp1_s'],r['isp2_s'])==req and r['propellant_mode']=='ascent_fixed_150t')
        vals[k]=(vals[k][0],row['dv_total_m_s'])
    for t in [8500,9000,9500,10000,10500]:
        d.add(Line(xp(t),29,xp(t),156,strokeColor=RULE,strokeWidth=.5));label(d,xp(t),13,f'{t:,}',8,GRAY)
    for i,(name,v) in enumerate(vals):
        yy=141-i*30
        label(d,x0-9,yy-3,name,8,INK,'end')
        d.add(Rect(x0,yy-7,xp(v)-x0,14,fillColor=TEAL if i==0 else GRAY,strokeColor=None))
        label(d,min(xp(v)+6,486),yy-3,f'{v:,.0f}',8,INK,'start')
    d.add(Line(xp(10290),29,xp(10290),165,strokeColor=colors.HexColor('#AD5339'),strokeWidth=1.1,strokeDashArray=[3,2]))
    label(d,xp(10290),176,'比較条件 10,290 m/s',8,colors.HexColor('#AD5339'))
    return d

reg=json.loads((WORK/'design_register.json').read_text())
items=reg['items'];ids=[r['id'] for r in items]
assert len(ids)==len(set(ids))==40
assert not reg['manufacturing_release'] and not reg['flight_release']
assert not any(r['status']=='certified' for r in items)
for r in items:
    assert all(x in ids for x in r['dependencies'])
counts=Counter(r['status'] for r in items)
assert all(counts[k]==v for k,v in reg['status_counts'].items())

assets={
 '{{ROCKET_LAYOUT}}':(rocket_layout(),'RETURN-1_C1_functional_layout.svg','機能配置図。寸法・タンク境界・翼面形状を定義する製造図ではない。'),
 '{{SATELLITE_LAYOUT}}':(satellite_layout(),'A-LINK_C1_functional_layout.svg','非縮尺。アンテナ・パネル・放熱面の面積と収納包絡は未確定。'),
 '{{NETWORK_LAYOUT}}':(network_layout(),'A-LINK_E3_C1_network.svg','自前衛星網と既存衛星サービスでの実証を区別した構成図。'),
 '{{MASS_CHART}}':(mass_chart(),'RETURN-1_C1_mass_comparison.svg','仮定からの理想速度増分。横軸の起点は8,500 m/s。帰還成立の確認は含まない。'),
}
for dr,name,cap in assets.values():
    renderSVG.drawToFile(dr,str(PACK/name))
    s=(PACK/name).read_text().replace('font-family: JP',"font-family: 'Arial Unicode MS', sans-serif")
    (PACK/name).write_text(s)

text=(WORK/'main.md').read_text()
intro='台帳は40項目。要求固定'+str(counts['requirement_locked'])+'、方式選定'+str(counts['architecture_selected'])+'、解析仮定'+str(counts['analysis_assumption'])+'、未確定'+str(counts['open'])+'、認定証拠あり0。製造・飛行の承認はない。'
rows=[['台帳ID','設計項目','状態','必要成果物の例']]
for r in items:rows.append([r['id'],r['title'],LABELS[r['status']],'／'.join(r['required_deliverables'][:2])])
regmd='\n'.join(['| '+' | '.join(r)+' |' for r in [rows[0],['---']*4]+rows[1:]])
text=text.replace('{{REGISTER_INTRO}}',intro).replace('{{REGISTER_TABLE}}',regmd)
md=text
for token,(dr,name,cap) in assets.items():md=md.replace(token,f'![{cap}]({name})\n\n{cap}')
imgname='RETURN-1_C1_external_concept.png'
md=md.replace('{{EXTERIOR_IMAGE}}',f'![RETURN-1 C1 外観意匠図]({imgname})')
assert '{{' not in md
(PACK/(STEM+'.md')).write_text(md)

story=[Spacer(1,8),Paragraph('RETURN-1',styles['big']),Paragraph('C1 / INTEGRATED DESIGN BASELINE',styles['sub']),Spacer(1,15),Image(str(PACK/imgname),width=BW,height=BW*2/3),Spacer(1,20),Paragraph('両段再使用ロケット<br/>統合設計基準書',styles['big']),Spacer(1,10),Paragraph('外観と構成を一本化する。<br/>製造へ進むための根拠を追跡する。',styles['sub']),Spacer(1,13),Paragraph('2026.09.23  |  小型衛星輸送・A-LINK・avokado E3',styles['caption']),Paragraph('本版は外観・方式の基準案。製造仕様の凍結、実機性能の保証、飛行承認は未完了。',styles['body']),PageBreak(),Paragraph('内容',styles['h2'])]
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.extend([toc,Spacer(1,18),Paragraph('本書はC1で選んだ構成と、未確定の製造・性能項目を区別する。詳細な根拠、依存関係、計算データは同梱パッケージを参照。',styles['caption'])])
lines=text[text.index('## 01 '):].splitlines();i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line=='{{EXTERIOR_IMAGE}}':
        story.extend([Image(str(PACK/imgname),width=BW,height=BW*2/3),Spacer(1,9)]);i+=1
    elif line in assets:
        dr,_,cap=assets[line];story.extend([dr,Spacer(1,7),Paragraph(cap,styles['caption'])]);i+=1
    elif line.startswith('## '):
        story.append(PageBreak());p=Paragraph(rich(line[3:]),styles['h2']);p.chapter='chapter-'+line[3:5];story.append(p);i+=1
    elif line.startswith('### '):
        story.append(Paragraph(rich(line[4:]),styles['h3']));i+=1
    elif line.startswith('|'):
        rr=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            raw=[x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch('[-: ]+',x) for x in raw):rr.append(raw)
            i+=1
        assert len({len(r) for r in rr})==1
        story.append(table(rr))
    else:
        parts=[]
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','{{')):
            parts.append(lines[i].strip());i+=1
        s=' '.join(parts);style=styles['caption'] if re.match(r'^\[S\d+\]',s) else styles['body']
        story.append(Paragraph(rich(s),style))

pdfpath=ROOT/'outputs'/(STEM+'.pdf')
doc=C1Doc(pdfpath);doc.multiBuild(story)
reader=PdfReader(pdfpath);page_texts=[p.extract_text() or '' for p in reader.pages]
(WORK/'qa/page_text.json').write_text(json.dumps(page_texts,ensure_ascii=False,indent=2))
(WORK/'qa/chapter_pages.json').write_text(json.dumps(doc.chapter_pages,ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdfpath),'pages':len(page_texts),'chapters':doc.chapter_pages,'page_chars':[len(t) for t in page_texts],'registry_status':dict(counts)},ensure_ascii=False,indent=2))

for name in ['design_register.md','design_register.json','mass_study.md','mass_study.json','mass_study.py','payload_interfaces.md','payload_interfaces.json','interface_crossrefs.json']:
    assert (WORK/name).exists(),name
    shutil.copy2(WORK/name,PACK/name)
with (PACK/'design_register.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.writer(f);writer.writerow(['ID','分野','項目','状態','必要成果物','現状','不足情報','検証方法','依存ID','製造承認'])
    for r in items:writer.writerow([r['id'],r['category'],r['title'],LABELS[r['status']],'\n'.join(r['required_deliverables']),r['current_disposition'],'\n'.join(r['inputs_to_close']),'\n'.join(r['verification_method']),','.join(r['dependencies']),False])
shutil.copy2(pdfpath,PACK/pdfpath.name)
readme='''# RETURN-1 C1 パッケージ

2026-09-23。外観と方式の基準案です。製造・飛行の承認版ではありません。

最初に RETURN-1_C1_Integrated_Design_Baseline.pdf を開いてください。

- PDF / Markdown：決定した構成、機能図、質量評価、必要設計台帳。
- RETURN-1_C1_external_concept.png：画像生成による意匠図。寸法を測って製造に使わないでください。
- SVG：非縮尺の機能配置図、通信構成図、理想性能の比較図。
- design_register.md / .json / .csv：40項目の状態、必要な根拠、依存関係。
- payload_interfaces.md / .json：13件の接続条件、6件の地上試験案。
- interface_crossrefs.json：接続条件と設計台帳の対応。
- mass_study.md / .json / .py：計算の仮定・全結果・再現用スクリプト。
- image_prompt.txt：意匠画像の最終生成指示。生成手段は image_gen。
- SHA256SUMS：ファイルの整合確認用ハッシュ。

質量計算の再現：Python 3で mass_study.py を実行すると、同じ場所のmass_study.md/jsonを再生成します。標準ライブラリだけを使用します。計算は理想式であり、飛行経路・構造・熱・エンジンの成立確認を含みません。

旧618.6 t等は比較用の仮定です。全長、直径、推力、エンジン数、板厚、材料、熱防護、脚、製造工程を確定した意味ではありません。参照文書内のローカルパスは原本所在の記録で、他PCでは自動解決しません。

別提供のA-LINK v0.4は通信ソフトの試作です。そのテスト合格はロケット・衛星・電波通信の実証ではありません。C1はこれらの実機が存在することを主張しません。
'''
(PACK/'README.md').write_text(readme)
files=sorted(p for p in PACK.rglob('*') if p.is_file() and p.name!='SHA256SUMS')
(PACK/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(PACK))+'\n' for p in files))
zip_path=ROOT/'outputs/RETURN-1_C1_package.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(PACK.rglob('*')):
        if p.is_file():z.write(p,str(Path(PACK.name)/p.relative_to(PACK)))
print(json.dumps({'package':str(zip_path),'file_count':len(files)+1,'bytes':zip_path.stat().st_size},ensure_ascii=False))
