from pathlib import Path
import json,re,html,math,hashlib,zipfile
R=Path(__file__).resolve().parents[2]
exec((R/'work/rocket_design/build_design.py').read_text().split('\ncore=')[0])
from reportlab.graphics.shapes import Drawing,Rect,Line,String,Polygon,Circle
from reportlab.graphics import renderSVG
WOR=R/'work/colony_v1';PACK=R/'outputs/RockstarOS_Colony_C0_1'
STEM='RockstarOS_Colony_C0_1_Integrated_Design'
TEAL=colors.HexColor('#087E83');SILVER=colors.HexColor('#CCD4D7');CYAN=colors.HexColor('#0FC5DE')

def rich(s):
    s=html.escape(str(s))
    s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:f'<link href="{m.group(2)}" color="#087E83">{m.group(1)}</link>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    return s.replace('`','')
class ColonyDoc(DesignDoc):
    def __init__(self,p):
        super().__init__(p);self.title='RockstarOS Colony C0.1 統合設計書';self.author='RockstarOS Colony Design Study'
    def footer(self,c,doc):
        c.saveState()
        if doc.page==1:
            c.setFillColor(SILVER);c.rect(0,H-14,W,14,fill=1,stroke=0)
        else:
            c.setStrokeColor(RULE);c.setLineWidth(.5);c.line(LEFT,32,W-RIGHT,32)
            c.setFont('JP',7);c.setFillColor(GRAY)
            c.drawString(LEFT,21,'ROCKSTAROS COLONY  /  C0.1    |    統合基本設計 + SIM_ONLY    |    実機・居住・飛行 未実証')
            c.drawRightString(W-RIGHT,21,str(doc.page))
        c.restoreState()
def table(rows):
    n=len(rows[0]);weights={2:[.27,.73],3:[.23,.36,.41],4:[.10,.31,.15,.44]}[n]
    if rows[0][0]=='要求ID':weights=[.10,.33,.15,.42]
    if rows[0][0]=='資料':weights=[.08,.47,.45]
    if rows[0][0]=='場面':weights=[.30,.35,.35]
    data=[[Paragraph(rich(v),styles['headcell'] if i==0 else styles['cell']) for v in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=[BW*x for x in weights],repeatRows=1,hAlign='LEFT',spaceBefore=3,spaceAfter=12)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,LIGHT]),('LINEBELOW',(0,-1),(-1,-1),.5,RULE)]))
    return t

def label(d,x,y,text,size=9,color=INK,anchor='middle'):
    d.add(String(x,y,text,fontName='JP',fontSize=size,fillColor=color,textAnchor=anchor))
def box(d,x,y,w,h,lines,fill=LIGHT):
    d.add(Rect(x,y,w,h,rx=5,ry=5,fillColor=fill,strokeColor=TEAL,strokeWidth=.7))
    for i,s in enumerate(lines):label(d,x+w/2,y+h/2+(len(lines)-1)*7-i*14-3,s)
def arrow(d,x1,y1,x2,y2):
    d.add(Line(x1,y1,x2,y2,strokeColor=TEAL,strokeWidth=1))
    a=math.atan2(y2-y1,x2-x1)
    d.add(Polygon([x2,y2,x2-5*math.cos(a-.45),y2-5*math.sin(a-.45),x2-5*math.cos(a+.45),y2-5*math.sin(a+.45)],fillColor=TEAL,strokeColor=None))
def system():
    d=Drawing(BW,310)
    label(d,0,294,'配置・役割の基準案 / 全接続の実装完了を表さない',9,TEAL,'start')
    box(d,0,225,140,46,['rocketstar / 貨物船','飛行・輸送の専用系統'])
    box(d,180,225,140,46,['A-LINK / 外部回線','通信ゲートウェイ'])
    box(d,360,225,141,46,['avokado E3','操作・会話・作業支援'])
    box(d,0,125,501,65,['RockstarOS / 現地運用核','資産・観測・権限・仕事・資源・物流・保守・記録'],SILVER)
    for x in [70,250,430]:arrow(d,x,225,x,190)
    for x,txt in [(0,'電力'),(128,'空気・区画'),(256,'水・廃棄物'),(384,'熱・保守')]:
        box(d,x,45,117,47,[txt,'局所制御 + 現地判定']);arrow(d,x+58,125,x+58,92)
    label(d,250,20,'独立保護・警報・現地操作：Core / AI / 外部回線から独立させる',9,TEAL)
    return d

def commands():
    d=Drawing(BW,178)
    d.translate(0,-20)
    label(d,0,183,'指令の状態 / 模型のAPPLIEDは希望設定の保存まで',9,TEAL,'start')
    titles=[['提案','PREPARED'],['承認','QUEUED'],['送信記録','SENT'],['設備の判定','APPLIED / 拒否']]
    for i,t in enumerate(titles):
        x=i*129;box(d,x,105,114,48,t)
        if i<3:arrow(d,x+114,129,x+129,129)
    box(d,258,28,114,45,['結果不明','UNCERTAIN'])
    box(d,387,28,114,45,['設備記録を照合','再送はしない'])
    arrow(d,315,105,315,73);arrow(d,372,50,387,50);arrow(d,444,73,444,105)
    label(d,0,67,'復旧時は最新状態を読み直す',9,INK,'start')
    label(d,0,48,'過去の結果と現在の状態を分ける',9,INK,'start')
    label(d,0,28,'重要設備の自由操作APIは作らない',9,INK,'start')
    return d

def transport():
    d=Drawing(BW,162)
    label(d,0,148,'物流の連鎖 / 各境界で物理的な検査と証拠が必要',9,TEAL,'start')
    for i,t in enumerate([['地上機材','梱包・搭載'],['rocketstar','軌道投入'],['貨物船','移送・係留'],['拠点','受領・検収'],['設備','設置・試験']]):
        x=i*103;box(d,x,62,89,50,t)
        if i<4:arrow(d,x+89,87,x+103,87)
    d.add(Line(0,38,BW,38,strokeColor=CYAN,strokeWidth=1))
    label(d,250,18,'RockstarOS：同じcargoIdと仕事・証拠を、輸送から設備台帳まで継承',9,TEAL)
    return d
assets={
'{{SYSTEM_DIAGRAM}}':(system(),'system_architecture.svg','全体の役割と故障境界。空間配置・配線・冗長台数を確定する図ではない。'),
'{{COMMAND_DIAGRAM}}':(commands(),'command_lifecycle.svg','送信の事実と作用の完了を分ける。実機での作用照合は別途設計する。'),
'{{TRANSPORT_DIAGRAM}}':(transport(),'cargo_handover.svg','貨物船・係留・居住設備は追加設計対象。現在のロケットの搭載能力を拡大する図ではない。')}
for dr,name,cap in assets.values():
    renderSVG.drawToFile(dr,str(PACK/name))
    f=PACK/name;f.write_text(f.read_text().replace('font-family: JP',"font-family: 'Arial Unicode MS', sans-serif"))

def mdtable(rows):return '\n'.join('| '+' | '.join(map(str,r))+' |' for r in [rows[0],['---']*len(rows[0])]+rows[1:])
text=(WOR/'main.md').read_text()
tests=json.loads((PACK/'evidence/test_results.json').read_text());proc=json.loads((PACK/'evidence/process_evidence.json').read_text())
text=text.replace('{{TEST_SUMMARY}}',f"今回の最終実行は **{tests['passed']}/{tests['testsRun']}件合格**、失敗{tests['failures']}・エラー{tests['errors']}・skip {tests['skipped']}。Python {tests['python']}。実行した個別の試験名とソースのハッシュを保存した。監督プロセスを実際にkillした試験では、局所制御のsampleSeqが {proc['beforeSampleSeq']} から {proc['afterSampleSeq']} へ進み、模擬重要負荷4kWへの配分が続いた。同じホスト・OS上の別プロセスと別DBの確認であり、独立した電源、実機保護、実時間保証の証拠ではない。")
demo=json.loads((PACK/'evidence/demo.json').read_text());records={x['event']:x for x in demo['records']}
r=[['場面','模型で起きたこと','読み方']]
r.append(['返事喪失→再起動→照合','UNCERTAIN → SUCCEEDED','設備receiptを照合。再送せず過去の模擬設定反映を確認'])
for key,jname in [('reduced_supply','供給を6kWへ'),('insufficient_critical_supply','供給を3kWへ'),('supervisory_lease_expired','監督権の期限切れ')]:
    t=records[key]['telemetry'];r.append([jname,f"重要 {t['criticalServedKw']:g} / 非重要 {t['actualFlexibleKw']:g} kW",f"{t['state']}。重要不足 {t['criticalDeficitKw']:g} kW"])
text=text.replace('{{DEMO_TABLE}}',mdtable(r))
req=json.loads((PACK/'requirements.json').read_text())['items'];labels={'SIM_TESTED':'模型で確認','DESIGN_ONLY':'設計のみ','OPEN':'未確定'}
r=[['要求ID','要求','確認段階','実機へ残る主な仕事']]+[[x['id'],x['requirement'],labels[x['verificationStage']],x['remainingForRealSystem']] for x in req]
text=text.replace('{{REQUIREMENTS_TABLE}}',mdtable(r))
sources=json.loads((PACK/'sources.json').read_text())['sources'];r=[['資料','一次資料','設計で使う範囲']]
short={'S1':'居住設備を複数の相互依存系統として扱う','S2':'発電・蓄電・分配の役割を分ける','S3':'監視・点検・在庫・貨物の現地統合','S4':'共通原因故障と保護の独立性','S5':'起動・入力・順序・故障時処置','S6':'蓄積転送とアプリケーション結果を分ける','S7':'通信保護と設備権限を分ける','S8':'パケット形式と意味の接続を分ける','S9':'軌道投入後も続く物流と受領の設計'}
for x in sources:r.append([x['id'],f"[{x['title']}]({x['url']})",short[x['id']]])
text=text.replace('{{SOURCE_TABLE}}',mdtable(r))
markdown=text
for token,(_,name,cap) in assets.items():markdown=markdown.replace(token,f'![{cap}]({name})\n\n{cap}')
assert '{{' not in markdown
(PACK/(STEM+'.md')).write_text(markdown)

story=[Spacer(1,20),Paragraph('ROCKSTAROS',styles['big']),Paragraph('COLONY / C0.1',styles['sub']),Spacer(1,24)]
cover=Drawing(BW,72);cover.add(Rect(0,4,BW,64,rx=8,ry=8,fillColor=SILVER,strokeColor=None));cover.add(Rect(19,14,36,44,rx=12,ry=12,fillColor=NAVY,strokeColor=None))
for yy in [24,36,48]:cover.add(Circle(37,yy,2.3,fillColor=CYAN,strokeColor=None))
label(cover,78,39,'LOCAL OPERATIONS CORE',12,NAVY,'start');label(cover,78,20,'設備・人・資源・貨物・通信をつなぐ',10,INK,'start')
story.extend([cover,Spacer(1,24),Paragraph('コロニー運用基盤<br/>輸送・通信 統合設計書',styles['big']),Spacer(1,17),Paragraph('現地で動く。状態を確かめる。<br/>輸送から暮らしまで、履歴をつなぐ。',styles['sub']),Spacer(1,24)])
story.append(table([['対象','設計範囲'],['運用核','RockstarOS / 権限・仕事・設備・資源・物流'],['接続','rocketstar C3 / A-LINK / avokado E3'],['付属実装',f"SIM_ONLY動作模型・{tests['passed']}件の試験・3つの接続スキーマ"],['到達点','統合基本設計と限定ソフト検証。実機・居住・飛行は未実証']]))
story.extend([Spacer(1,17),Paragraph('2026.09.23  |  目的地・人数・滞在条件は未確定',styles['caption']),PageBreak(),Paragraph('内容',styles['h2'])])
toc=TableOfContents();toc.levelStyles=[styles['toc']];toc.dotsMinLevel=0
story.extend([toc,Spacer(1,18),Paragraph('読む順序：全体像は01-03、接続と復旧は04-07、輸送と操作は08-10、実装証拠と次の工程は11-15。',styles['caption'])])
lines=text[text.index('## 01'):].splitlines();i=0
while i<len(lines):
    s=lines[i].strip()
    if not s:i+=1;continue
    if s in assets:
        dr,_,cap=assets[s];story.extend([dr,Spacer(1,5),Paragraph(cap,styles['caption'])]);i+=1
    elif s.startswith('## '):
        story.append(PageBreak());p=Paragraph(rich(s[3:]),styles['h2']);p.chapter='chapter-'+s[3:5];story.append(p);i+=1
    elif s.startswith('### '):story.append(Paragraph(rich(s[4:]),styles['h3']));i+=1
    elif s.startswith('|'):
        rr=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            raw=[x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch('[-: ]+',x) for x in raw):rr.append(raw)
            i+=1
        story.append(table(rr))
    else:
        paragraph=[s];i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','{{')):
            paragraph.append(lines[i].strip());i+=1
        story.append(Paragraph(rich(' '.join(paragraph)),styles['body']))
pdf=PACK/(STEM+'.pdf');doc=ColonyDoc(pdf);doc.multiBuild(story)
reader=PdfReader(pdf);textall='\n'.join(p.extract_text() or '' for p in reader.pages)
assert len(doc.chapter_pages)==15
for expected in ['35/35','COL-36','SIM_ONLY','CRITICAL_DEFICIT','未実証','RockstarOS']:assert expected in textall,expected
assert '{{' not in textall
(WOR/'qa/pdf_content.json').write_text(json.dumps({'pages':len(reader.pages),'chapters':doc.chapter_pages,'textAssertions':'PASS'},ensure_ascii=False,indent=2))
print(json.dumps({'pdf':str(pdf),'pages':len(reader.pages),'chapters':len(doc.chapter_pages)},ensure_ascii=False))
