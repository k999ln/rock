"""Render the source design into a Japanese engineering PDF."""
from pathlib import Path
import re
import sys
import os
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Flowable

ROOT = Path(__file__).resolve().parent
# Embed the actual glyphs. Unembedded CID fonts render blank in some viewers.
FONT_PATH = Path(os.environ.get('MINI_PDF_JAPANESE_FONT', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
if not FONT_PATH.is_file():
    raise RuntimeError('Set MINI_PDF_JAPANESE_FONT to an embeddable Japanese TrueType font; CID fallback is disabled.')
pdfmetrics.registerFont(TTFont('MiniJapanese', str(FONT_PATH)))
W,H=A4
INK=colors.HexColor('#202b29');MUTED=colors.HexColor('#63706c');ACCENT=colors.HexColor('#355d50')
body=ParagraphStyle('body',fontName='MiniJapanese',fontSize=10.2,leading=17,spaceAfter=10,wordWrap='CJK',textColor=INK)
heading=ParagraphStyle('heading',fontName='MiniJapanese',fontSize=18,leading=26,spaceAfter=23,wordWrap='CJK',textColor=INK)
sub=ParagraphStyle('sub',fontName='MiniJapanese',fontSize=11,leading=18,spaceBefore=9,spaceAfter=10,textColor=ACCENT,wordWrap='CJK')
title=ParagraphStyle('title',parent=heading,fontSize=26,leading=38,spaceAfter=19)
meta=ParagraphStyle('meta',parent=body,fontName='MiniJapanese',fontSize=8,leading=14,textColor=MUTED)
bullet=ParagraphStyle('bullet',parent=body,leftIndent=11,firstLineIndent=-10,spaceAfter=8)

class Architecture(Flowable):
    def __init__(self):super().__init__();self.width=480;self.height=142
    def draw(self):
        c=self.canv
        boxes=[(0,95,105,32,'Sensor Adapter'),(125,95,105,32,'Space Runtime'),(250,95,105,32,'Interaction'),(375,95,105,32,'Compositor'),(125,24,105,32,'OS Broker'),(250,24,105,32,'App / Sky Tool'),(375,24,105,32,'Output Adapter')]
        for x,y,w,h,label in boxes:
            c.setFillColor(colors.HexColor('#f0f3f0'));c.setStrokeColor(colors.HexColor('#aab8af'));c.roundRect(x,y,w,h,4,stroke=1,fill=1);c.setFillColor(INK);c.setFont('Helvetica',8);c.drawCentredString(x+w/2,y+12,label)
        c.setStrokeColor(ACCENT)
        for x1,y1,x2,y2 in [(105,111,125,111),(230,111,250,111),(355,111,375,111),(302,95,302,76),(302,76,177,76),(177,76,177,56),(230,40,250,40),(427,95,427,56)]:c.line(x1,y1,x2,y2)
        c.setFont('Helvetica',7);c.setFillColor(MUTED);c.drawString(0,0,'Local perception/render loop and permissioned app execution are separate paths.')

class Stack(Flowable):
    def __init__(self):super().__init__();self.width=480;self.height=160
    def draw(self):
        c=self.canv;y=150
        for mm,label in [(20,'RF / antenna window'),(42,'Sensor + optical volume'),(28,'Compute / storage'),(76,'Battery / power'),(20,'Latch / dock contacts')]:
            h=mm*.65;c.setFillColor(colors.HexColor('#eef2ef'));c.setStrokeColor(colors.HexColor('#9eada4'));c.rect(20,y-h,90,h,stroke=1,fill=1);c.setFillColor(INK);c.setFont('Helvetica',8);c.drawCentredString(65,y-h/2-3,f'{mm} mm');c.drawString(130,y-h/2-3,label);y-=h
        c.setFont('Helvetica',7);c.setFillColor(MUTED);c.drawString(20,0,'Axial allocation only. Component fit, RF, optics and thermal paths are not validated.')

def format_text(text):
    # URL break opportunities preserve the complete source URL in selectable text.
    text=escape(text)
    text=re.sub(r'(https://\S+)',lambda m:m.group(0).replace('/','/<wbr/>'),text)
    return text

def footer(c,doc):
    c.saveState();c.setFont('MiniJapanese',7);c.setFillColor(MUTED)
    c.drawString(48,H-30,'avocadoMini  /  空間コンピュータ OS 実現設計書  /  0.10')
    c.drawString(48,27,'基本設計   製品の実機受入と製造リリースは未完了')
    c.drawRightString(W-48,27,str(doc.page))
    logo=ROOT.parents[1]/'public/brand/rockstaros-logo-source.png'
    if logo.is_file():c.drawImage(str(logo),W-104,H-45,width=56,height=31.5,preserveAspectRatio=True,mask='auto')
    c.restoreState()

def build(output):
    source=(ROOT/'spatial-computer-use-design.md').read_text()
    pages=source.split('<!-- page -->');story=[]
    for index,page in enumerate(pages):
        if index:story.append(PageBreak())
        blocks=re.split(r'\n\s*\n',page.strip())
        for block in blocks:
            lines=block.splitlines()
            if block.startswith('# '):
                text=block[2:].replace('avocadoMini 空間コンピュータ OS 実現設計書','avocadoMini<br/>空間コンピュータ OS<br/>実現設計書')
                story.append(Paragraph(text,title));continue
            if block.startswith('## '):
                story.append(Paragraph(format_text(block[3:]),heading if index else sub))
                if re.search(r'^## 3 ', page, re.M):story.extend([Architecture(),Spacer(1,17)])
                if re.search(r'^## 4 ', page, re.M):story.extend([Stack(),Spacer(1,17)])
                continue
            if block.startswith('### '):story.append(Paragraph(format_text(block[4:]),sub));continue
            if lines[0].startswith('- '):
                for line in lines:story.append(Paragraph('・'+format_text(line[2:]),bullet))
            elif re.match(r'^\d+\. ',lines[0]):
                for line in lines:story.append(Paragraph(format_text(line),body))
            else:story.append(Paragraph(format_text(' '.join(lines)),meta if block.startswith('版 ') else body))
        if re.search(r'^## 40 ', page, re.M):
            story.extend([Spacer(1,5),Image(str(ROOT/'assets/e1-leairr-optical-path.png'),width=460,height=460*820/1400)])
        if re.search(r'^## 44 ', page, re.M):
            story.extend([Spacer(1,5),Image(str(ROOT/'assets/e1-binocular-coverage.png'),width=460,height=460*780/1400)])
        if index==0:
            image_path=ROOT/'assets/orbit-lt-triptych-concept.png'
            im=Image(str(image_path),width=480,height=240)
            story.extend([Spacer(1,13),im,Paragraph('外観と使い方の構想CG。内部収納、光学、性能の実証画像ではありません。',meta)])
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    doc=SimpleDocTemplate(str(output),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=57,bottomMargin=48,title='avocadoMini 空間コンピュータ OS 実現設計書',author='avokado',pageCompression=1)
    doc.build(story,onFirstPage=footer,onLaterPages=footer)

if __name__=='__main__':build(sys.argv[1])
