from pathlib import Path
import json, math
from PIL import Image, ImageOps, ImageDraw
import pdfplumber

root=Path(__file__).resolve().parents[2]
work=root/'work/autolink'
pdf=root/'outputs/A-LINK_Avokado_Auto_Connect_Design_v0.3.pdf'
issues=[]
with pdfplumber.open(pdf) as doc:
    for i,p in enumerate(doc.pages,1):
        for c in p.chars:
            # CJK line-end punctuation may hang by one glyph outside the 47 pt frame.
            if c['text'].strip() and (c['x0']<36 or c['x1']>p.width-32 or c['top']<20 or c['bottom']>p.height-14):
                issues.append({'page':i,'char':c['text'],'box':[c['x0'],c['top'],c['x1'],c['bottom']]})
        assert '{{' not in (p.extract_text() or '')
assert not issues,issues[:20]
imgs=sorted((work/'render').glob('page-*.png'))
assert len(imgs)==18,len(imgs)
for start in range(0,len(imgs),6):
    sheet=Image.new('RGB',(1140,1120),'#dce3e7')
    draw=ImageDraw.Draw(sheet)
    for k,f in enumerate(imgs[start:start+6]):
        im=Image.open(f).convert('RGB');im.thumbnail((360,510))
        x=10+(k%3)*380;y=25+(k//3)*555
        sheet.paste(im,(x,y));draw.text((x,y-17),f'Page {start+k+1}',fill='black')
    sheet.save(work/f'contact-{start+1:02}.png')
R=6371.;h=550.;e=math.radians(25)
psi=math.acos(R*math.cos(e)/(R+h))-e
dist=math.sqrt((R+h)**2-(R*math.cos(e))**2)-R*math.sin(e)
loss=92.45+20*math.log10(2)+20*math.log10(dist)
down=20-loss-3-10*math.log10(500)+228.6-40-6
up=-7-loss-3-5+228.6-40-6
assert round(down,1)==13.1 and round(up,1)==8.1
assert sum([100,65,85,35,55,25,25,10])==400
assert math.ceil(2/(1-math.cos(psi)))==184
assert round(98/.9,2)==108.89
report={'pages':18,'out_of_bounds_text':issues,'edge_range_km':dist,'path_loss_db':loss,'down_margin_db':down,'up_margin_db':up,'body_budget_w':80,'added_comparison_w':[8,18],'internal_and_input_comparison_w':[[88,88/.9],[98,98/.9]],'geometric_area_lower_bound':184,'coverage_missing_samples':[23322,145,5],'physical_tests_executed':False}
(work/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
