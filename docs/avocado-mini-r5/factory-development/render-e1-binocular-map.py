"""Scientific diagnostic figure from generated calculation data, not a product view."""
from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
maps=json.loads((ROOT/'work/mini-spatial-engineering/e1-binocular-map.json').read_text())
data=[maps[0],maps[4]]
im=Image.new('RGB',(1400,780),'white');draw=ImageDraw.Draw(im)
font='/System/Library/Fonts/Supplemental/Arial.ttf'
title=ImageFont.truetype(font,26);text=ImageFont.truetype(font,20);small=ImageFont.truetype(font,17)
draw.text((35,20),'Mini E1: finite binocular / pupil-sample necessary geometry',font=title,fill='#203b36')
draw.text((35,65),'Same fixed 20 mm 3D target; room remains 3 x 3 m. Eye-height slice: 1.6 m. Eight nodes.',font=text,fill='#394641')
for j,item in enumerate(data):
    left=90+690*j;top=175;size=430
    draw.text((left-30,120),f"m={item['magnification']}, assumed clear aperture {item['apertureMm']} mm",font=text,fill='#203b36')
    draw.rectangle((left,top,left+size,top+size),outline='#9ba8a3',width=2)
    for tick in [-1.5,0,1.5]:
        pos=(tick+1.5)/3*size
        draw.text((left+pos-15,top+size+10),str(tick),font=small,fill='#394641')
        draw.text((left-45,top+size-pos-10),str(tick),font=small,fill='#394641')
    for p,ok in zip(item['eyes'],item['necessaryPass']):
        if p[2]!=1600:continue
        x=left+(p[0]+1500)/3000*size;y=top+size-(p[1]+1500)/3000*size
        color='#326a56' if ok else '#aa6129';draw.ellipse((x-4,y-4,x+4,y+4),fill=color)
    draw.text((left+165,top+size+42),'Room x (m)',font=small,fill='#394641')
    draw.text((left-55,top-32),'Room y (m)',font=small,fill='#394641')
draw.text((35,690),'Green: all sampled target/pupil rays satisfy modeled geometry. Brown: at least one ray fails.',font=text,fill='#203b36')
draw.text((35,730),'Go vertical cone, lens quality, physical occlusion, glare and continuous coverage are NOT accepted.',font=text,fill='#aa6129')
out=ROOT/'docs/avocado-mini-r5/assets/e1-binocular-coverage.png';im.save(out);print(out)
