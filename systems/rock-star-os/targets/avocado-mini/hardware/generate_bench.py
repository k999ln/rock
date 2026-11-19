"""Deterministic KiCad source for an unpowered 3V3 contact/LED bench carrier.
Not a final Mini mainboard, safety controller or production release.
Custom module/header footprints are explicit engineering drawings for review.
"""
import argparse
import json
import re
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

def uid(value): return str(uuid5(NAMESPACE_URL, 'dev.rock/mini-bench/' + value))
def q(value): return json.dumps(str(value))
def xy(x, y): return f'{x:.4f} {y:.4f}'
def effects(size=1.0,justify=None): return f'(effects (font (size {size} {size})){" (justify "+justify+")" if justify else ""})'
ROOT = uid('sheet')
NAMES = ['GND', '3V3', 'STOP_OK', 'LATCH_OK', 'TEMP_OK', 'POWER_OK', 'DOCKED', 'LOCAL_BUTTON', 'LED_GPIO', 'LED_A', 'LED_K']
NETS = {n: i+1 for i,n in enumerate(NAMES)}
INPUTS = [('STOP_OK',4,0), ('LATCH_OK',5,1), ('TEMP_OK',6,2), ('POWER_OK',7,3), ('DOCKED',9,5), ('LOCAL_BUTTON',11,7)]
PICO_NAMES = ['GP0','GP1','GND','GP2','GP3','GP4','GP5','GND','GP6','GP7','GP8','GP9','GND','GP10','GP11','GP12','GP13','GND','GP14','GP15','GP16','GP17','GND','GP18','GP19','GP20','GP21','GND','GP22','RUN','GP26','GP27','AGND','GP28','ADC_VREF','3V3_OUT','3V3_EN','GND','VSYS','VBUS']
PICO_NETS = {pin:net for net,pin,_ in INPUTS} | {10:'LED_GPIO',36:'3V3'} | {p:'GND' for p in [3,8,13,18,23,28,33,38]}
HARNESS = {1:'3V3',2:'STOP_OK',3:'3V3',4:'LATCH_OK',5:'3V3',6:'TEMP_OK',7:'3V3',8:'POWER_OK',9:'LED_K',10:'GND',11:'3V3',12:'DOCKED',13:'GND',15:'3V3',16:'LOCAL_BUTTON'}

NC_PICO={p:f'unconnected-(U1-{PICO_NAMES[p-1]}-Pad{p})' for p in range(1,41) if p not in PICO_NETS}
NC_HARNESS={14:'unconnected-(J1-Pad14)'}
for net in [*NC_PICO.values(),*NC_HARNESS.values()]: NETS[net]=len(NETS)+1

def library(name, pins, graphic):
    body=f'(symbol {q("MiniBench:"+name)} (pin_names (offset 1)) (in_bom yes) (on_board yes) (property "Reference" "U" (at 0 0 0) {effects()}) (property "Value" {q(name)} (at 0 -2 0) {effects()})'
    body+=f'(symbol {q(name+"_0_1")} {graphic}) (symbol {q(name+"_1_1")}'
    length=2.54 if name in ('Resistor','LED') else 5.08
    for number,label,x,y,angle,kind in pins:
        body+=f'(pin {kind} line (at {xy(x,y)} {angle}) (length {length}) (name {q(label)} {effects()}) (number {q(number)} {effects()}))'
    return body+'))'

def schematic():
    global SYMBOL_LIBRARY
    pico=[(p,PICO_NAMES[p-1],-22.86 if p<=20 else 22.86,48.26-5.08*((p-1) if p<=20 else (40-p)),0 if p<=20 else 180,'power_out' if p==36 else 'input' if p in [v[1] for v in INPUTS] else 'output' if p==10 else 'passive') for p in range(1,41)]
    harness=[(p,str(p),-10.16 if p%2 else 10.16,17.78-5.08*((p-1)//2),0 if p%2 else 180,'passive') for p in range(1,17)]
    r=[(1,'1',-5.08,0,0,'passive'),(2,'2',5.08,0,180,'passive')]
    rect=lambda a,b,c,d:f'(rectangle (start {xy(a,b)}) (end {xy(c,d)}) (stroke (width 0.254) (type default)) (fill (type background)))'
    libs=[library('Pico2',pico,rect(-17.78,-50.8,17.78,50.8)),library('Harness',harness,rect(-5.08,-20.32,5.08,20.32)),library('Resistor',r,rect(-2.54,-1.016,2.54,1.016)),library('LED',[(1,'K',-5.08,0,0,'passive'),(2,'A',5.08,0,180,'passive')],rect(-2.54,-1.5,2.54,1.5)),library('GroundReference',[(1,'USB_GND',0,0,90,'power_out')],'')]
    SYMBOL_LIBRARY='(kicad_symbol_lib (version 20241209) (generator mini_bench_generator)'+''.join(v.replace('MiniBench:', '', 1) for v in libs)+')\n'
    out=[f'(kicad_sch (version 20250114) (generator "mini_bench_generator") (uuid {ROOT}) (paper "A4") (lib_symbols {"".join(libs)})']
    def part(ref,name,x,y,pins,mapping,value,footprint):
        x=round(x/1.27)*1.27; y=round(y/1.27)*1.27
        extent=50.8 if ref=='U1' else 20.32 if ref=='J1' else 0
        props=''.join(f'(property {q(k)} {q(v)} (at {xy(x,y+dy)} 0) {effects() if k in ("Reference","Value") else "(effects (font (size 1 1)) hide)"})' for k,v,dy in [('Reference',ref,-extent-5.08),('Value',value,-extent-2.54),('Footprint',footprint,0)])
        out.append(f'(symbol (lib_id {q("MiniBench:"+name)}) (at {xy(x,y)} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid {uid(ref)}) {props}'+''.join(f'(pin {q(p[0])} (uuid {uid(ref+"/"+str(p[0]))}))' for p in pins)+f'(instances (project "mini-supervisor-bench" (path "/{ROOT}" (reference {q(ref)}) (unit 1)))))')
        for p,_,px,py,angle,_ in pins:
            a,b=x+px,y-py
            net=mapping.get(p)
            if net:
                left=angle!=180;c=a-5.08 if left else a+5.08
                out.append(f'(wire (pts (xy {xy(a,b)}) (xy {xy(c,b)})) (stroke (width 0) (type default)) (uuid {uid(ref+"/wire/"+str(p))}))')
                out.append(f'(global_label {q(net)} (shape bidirectional) (at {xy(c,b)} {180 if left else 0}) {effects(1.0,"right" if left else "left")} (uuid {uid(ref+"/label/"+str(p))}))')
            else: out.append(f'(no_connect (at {xy(a,b)}) (uuid {uid(ref+"/nc/"+str(p))}))')
    part('U1','Pico2',180,100,pico,PICO_NETS,'Pico 2 - USB powered BENCH ONLY','MiniBench:Pico2_Socket_2x20')
    part('J1','Harness',40,88,harness,HARNESS,'CONTACTS 3V3 ONLY','MiniBench:Harness_2x08_P2.54')
    for i,(net,_,_) in enumerate(INPUTS,1): part('R'+str(i),'Resistor',100,35+i*10,r,{1:net,2:'GND'},'4.7k 1%','MiniBench:R_0603')
    part('R7','Resistor',100,119,r,{1:'LED_A',2:'LED_GPIO'},'1k 1%','MiniBench:R_0603')
    part('D1','LED',100,134,r,{1:'LED_K',2:'LED_A'},'RED LED - STOP return','MiniBench:LED_0603')
    part('#FLG01','GroundReference',100,151,[(1,'USB_GND',0,0,90,'power_out')],{1:'GND'},'USB ground reference','')
    out.append(f'(text "LED/CONTACT BENCH ONLY - no laser, motor, battery, RF or biometric approval" (at 20 185 0) {effects(1.27,"left")} (uuid {uid("warning")}))')
    return '\n'.join(out)+')\n'

def board():
    global FOOTPRINT_LIBRARY
    FOOTPRINT_LIBRARY={}
    out=['(kicad_pcb (version 20221018) (generator mini_bench_generator) (general (thickness 1.6)) (paper "A4")', '(layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user) (47 "F.CrtYd" user) (48 "B.Fab" user) (49 "F.Fab" user)) (setup (pad_to_mask_clearance 0)) (net 0 "")']
    out.extend(f'(net {n} {q(net)})' for net,n in NETS.items())
    def line(a,b,layer='F.SilkS',width=.15): return f'(fp_line (start {xy(*a)}) (end {xy(*b)}) (layer {q(layer)}) (width {width}))'
    def footprint(ref,name,x,y,pads,outline,attribute='through_hole'):
        value={'U1':'Pico 2 - USB powered BENCH ONLY','J1':'CONTACTS 3V3 ONLY','R7':'1k 1%','D1':'RED LED - STOP return'}.get(ref,'4.7k 1%')
        reference_at='3.7 0' if ref.startswith('R') and ref!='R7' else '0 1.6' if ref in ('R7','D1') else '8.89 -2' if ref=='U1' else '1.27 -2'
        first=len(out)
        out.append(f'(footprint {q("MiniBench:"+name)} (layer "F.Cu") (tstamp {uid("fp/"+ref)}) (at {xy(x,y)}) (path "/{ROOT}/{uid(ref)}") (attr {attribute}) (fp_text reference {q(ref)} (at {reference_at}) (layer "F.Fab") {effects()}) (fp_text value {q(value)} (at 0 -3.5) (layer "F.Fab") {effects()[:-1]+" hide)"})')
        for p,px,py,net,smd in pads:
            extra=f'(net {NETS[net]} {q(net)})' if net else ''
            out.append(f'(pad {q(p)} {"smd rect" if smd else "thru_hole circle"} (at {xy(px,py)}) (size {"0.8 0.95" if smd else "1.7 1.7"}) {"" if smd else "(drill 1.0)"} (layers {chr(34)+"F.Cu"+chr(34)+" "+chr(34)+"F.Paste"+chr(34)+" "+chr(34)+"F.Mask"+chr(34) if smd else chr(34)+"*.Cu"+chr(34)+" "+chr(34)+"*.Mask"+chr(34)}) {extra})')
        if outline:
            a,b,c,d=outline
            for layer,width in [('F.CrtYd',.05),('F.Fab',.1)]:
                out.extend(line(p,z,layer,width) for p,z in [((a,b),(c,b)),((c,b),(c,d)),((c,d),(a,d)),((a,d),(a,b))])
        out.append(')')
        block='\n'.join(out[first:]).replace(q('MiniBench:'+name), q(name)+' (version 20221018) (generator mini_bench_generator)',1)
        block=re.sub(r'\(tstamp [^)]*\)|\(path [^)]*\)', '', block)
        block=re.sub(r'\(net \d+ "(?:\\.|[^"\\])*"\)', '', block)
        block=block.replace(q(ref), q('REF**'),1)
        FOOTPRINT_LIBRARY.setdefault(name,block+'\n')
    footprint('U1','Pico2_Socket_2x20',52,10,[(p,0 if p<=20 else 17.78,2.54*((p-1) if p<=20 else (40-p)),PICO_NETS.get(p,NC_PICO.get(p)),False) for p in range(1,41)],(-2.11,-1.9,19.89,50.5))
    footprint('J1','Harness_2x08_P2.54',10,17.62,[(p,0 if p%2 else 2.54,2.54*((p-1)//2),HARNESS.get(p,NC_HARNESS.get(p)),False) for p in range(1,17)],(-1.8,-1.8,4.34,19.58))
    for i,(net,_,row) in enumerate(INPUTS,1): footprint('R'+str(i),'R_0603',30,17.62+row*2.54+.8,[(1,-.825,0,net,True),(2,.825,0,'GND',True)],(-1.45,-.8,1.45,.8),'smd')
    footprint('R7','R_0603',44,32.86,[(1,-.825,0,'LED_A',True),(2,.825,0,'LED_GPIO',True)],(-1.45,-.8,1.45,.8),'smd')
    footprint('D1','LED_0603',39,32.86,[(1,-.825,0,'LED_K',True),(2,.825,0,'LED_A',True)],(-1.45,-.8,1.45,.8),'smd')
    def track(net,points,layer='F.Cu',width=.25):
        for a,b in zip(points,points[1:]): out.append(f'(segment (start {xy(*a)}) (end {xy(*b)}) (width {width}) (layer {q(layer)}) (net {NETS[net]}) (tstamp {uid(str((net,a,b,layer)))}))')
    def via(net,x,y): out.append(f'(via (at {xy(x,y)}) (size .7) (drill .3) (layers "F.Cu" "B.Cu") (net {NETS[net]}) (tstamp {uid(str((net,x,y)))}))')
    for net,_,row in INPUTS:
        y=17.62+row*2.54
        track(net,[(12.54,y),(52,y)]); track(net,[(29.175,y),(29.175,y+.8)])
        track('GND',[(30.825,y+.8),(32,y+.8)]); via('GND',32,y+.8)
        track('3V3',[(8,y),(10,y)])
    track('3V3',[(8,7),(8,35.4)],width=.5); via('3V3',8,7)
    track('3V3',[(69.78,20.16),(74,20.16),(74,7),(8,7)],'B.Cu',.5)
    track('LED_GPIO',[(52,32.86),(44.825,32.86)])
    track('LED_A',[(43.175,32.86),(39.825,32.86)])
    track('LED_K',[(38.175,32.86),(37,32.86)]);via('LED_K',37,32.86)
    track('LED_K',[(37,32.86),(37,40),(7,40),(7,27.78),(10,27.78)],'B.Cu')
    for a,b in [((2,2),(78,2)),((78,2),(78,64)),((78,64),(2,64)),((2,64),(2,2))]:out.append(f'(gr_line (start {xy(*a)}) (end {xy(*b)}) (layer "Edge.Cuts") (width .05) (tstamp {uid(str((a,b)))}))')
    out.append(f'(gr_text "MINI - LED BENCH ONLY / 3V3 CONTACTS" (at 40 61.8) (layer "F.SilkS") {effects(1.0)} (tstamp {uid("pcb-warning")}))')
    for label,x,y in [('1',8,15.62),('1',50.3,8.2)]:out.append(f'(gr_text {q(label)} (at {xy(x,y)}) (layer \"F.SilkS\") {effects(.8)} (tstamp {uid(str((label,x,y)))}))')
    out.append(f'(zone (net {NETS["GND"]}) (net_name "GND") (layer "B.Cu") (tstamp {uid("ground-zone")}) (hatch edge .5) (connect_pads (clearance .25)) (min_thickness .25) (fill yes (thermal_gap .3) (thermal_bridge_width .3)) (polygon (pts (xy 2.5 2.5) (xy 77.5 2.5) (xy 77.5 63.5) (xy 2.5 63.5))))')
    return '\n'.join(out)+')\n'

def generate(destination):
    path=Path(destination);path.mkdir(parents=True,exist_ok=True)
    (path/'mini-supervisor-bench.kicad_sch').write_text(schematic())
    (path/'mini-supervisor-bench.kicad_pcb').write_text(board())
    mapping={'schema':'rockstaros.mini-contact-bench/1','productionRelease':False,'dimensionsMm':[76,62,1.6],'power':'Pico 2 USB only; no external supply on carrier','pins':{str(k):v for k,v in HARNESS.items()},'normallyClosedContacts':[[1,2],[3,4],[5,6],[7,8],[9,10],[11,12]],'momentaryNormallyOpenLocalButton':[15,16],'physicalStop':'A mechanically linked DPST-NC stop opens BOTH harness pairs [1,2] and [9,10]. Second pole interrupts LED current independently of MCU software.','unusedPins':[14],'modulePinNames':{str(i+1):s for i,s in enumerate(PICO_NAMES)}}
    (path/'mini-supervisor-bench.kicad_pro').write_text(json.dumps({'meta':{'filename':'mini-supervisor-bench.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':0.2,'min_track_width':0.2,'min_via_diameter':0.6,'min_through_hole_diameter':0.3,'min_copper_edge_clearance':0.5}}}},indent=2)+'\n')
    (path/'MiniBench.kicad_sym').write_text(SYMBOL_LIBRARY)
    (path/'sym-lib-table').write_text('(sym_lib_table (version 7) (lib (name \"MiniBench\") (type \"KiCad\") (uri \"${KIPRJMOD}/MiniBench.kicad_sym\") (options \"\") (descr \"Mini LED bench symbols\")))\n')
    (path/'fp-lib-table').write_text('(fp_lib_table (version 7) (lib (name \"MiniBench\") (type \"KiCad\") (uri \"${KIPRJMOD}/MiniBench.pretty\") (options \"\") (descr \"Review required custom bench footprints\")))\n')
    pretty=path/'MiniBench.pretty';pretty.mkdir(exist_ok=True)
    for name,text in FOOTPRINT_LIBRARY.items():(pretty/(name+'.kicad_mod')).write_text(text)
    (path/'bench-interface.json').write_text(json.dumps(mapping,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'cad');generate(p.parse_args().output)
