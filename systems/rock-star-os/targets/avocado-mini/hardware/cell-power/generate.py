"""TPS22965 5V evaluation coupon: schematic + routed PCB SOURCE, NOT a Mini mainboard.
Not ERC/DRC/DFM accepted. No reverse-blocking/current-limit/watchdog/safety claim.
External current-limited supply required. Dummy load only until backfeed review.
"""
import argparse,json,re
from pathlib import Path
from uuid import uuid5,NAMESPACE_URL

def uid(s):return str(uuid5(NAMESPACE_URL,'dev.rock/cell-power/'+s))
def q(s):return json.dumps(str(s))
def eff(size=1):return f'(effects (font (size {size} {size})))'
NET={'GND':1,'VIN5':2,'VOUT5':3,'ARM_POST_NC':4,'ON':5,'CT':6}
PIN={1:'VIN5',2:'VIN5',3:'ON',4:'VIN5',5:'GND',6:'CT',7:'VOUT5',8:'VOUT5',9:'GND'}
ROOT=uid('sheet')

def schematic(out):
 specs={
 'Switch':[(str(i),['VIN','VIN','ON','VBIAS','GND','CT','VOUT','VOUT','EP'][i-1],-20.32 if i<=4 else 20.32,15.24-7.62*((i-1) if i<=4 else (i-5)),0 if i<=4 else 180,'input' if i==3 else 'passive') for i in range(1,10)],
 'TwoPin':[(str(i),str(i),-10.16,3.81-7.62*(i-1),0,'passive') for i in [1,2]]}
 lib=[]
 for name,pins in specs.items():
  s=f'(symbol "MiniCell:{name}" (pin_names (offset 1)) (in_bom yes) (on_board yes) (property "Reference" "U" (at 0 0 0) {eff()}) (property "Value" "{name}" (at 0 -2 0) {eff()}) (symbol "{name}_0_1" (rectangle (start -15.24 20.32) (end 15.24 -22.86) (stroke (width .254) (type default)) (fill (type background)))) (symbol "{name}_1_1"'
  for no,label,x,y,a,kind in pins:s+=f'(pin {kind} line (at {x} {y} {a}) (length 5.08) (name {q(label)} {eff()}) (number {q(no)} {eff()}))'
  s=s.replace('(start -15.24 20.32) (end 15.24 -22.86)','(start -5.08 6.35) (end 5.08 -6.35)') if name=='TwoPin' else s
  lib.append(s+'))')
 sch=[f'(kicad_sch (version 20250114) (generator "mini_cell_power") (uuid {ROOT}) (paper "A4") (lib_symbols {"".join(lib)})']
 def place(ref,name,x,y,mapping,value,fp):
  sch.append(f'(symbol (lib_id "MiniCell:{name}") (at {x} {y} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid {uid(ref)}) (property "Reference" {q(ref)} (at {x} {y-24.13} 0) {eff()}) (property "Value" {q(value)} (at {x} {y-21.59} 0) {eff(.8)}) (property "Footprint" {q(fp)} (at {x} {y} 0) (effects (font (size 1 1)) hide))'+''.join(f'(pin {q(p[0])} (uuid {uid(ref+p[0])}))' for p in specs[name])+f'(instances (project "mini-cell-power" (path "/{ROOT}" (reference {q(ref)}) (unit 1)))))')
  for no,_,px,py,a,_ in specs[name]:
   xx,yy=x+px,y-py;net=mapping[int(no)];end=xx+(-5.08 if a==0 else 5.08)
   sch.append(f'(wire (pts (xy {xx} {yy}) (xy {end} {yy})) (stroke (width 0) (type default)) (uuid {uid(ref+no+"w")}))')
   sch.append(f'(global_label {q(net)} (shape bidirectional) (at {end} {yy} {180 if a==0 else 0}) {eff(.8)} (uuid {uid(ref+no+"l")}))')
 place('U1','Switch',147.32,63.5,PIN,'TPS22965DSGR - evaluation only','MiniCell:WSON8_2x2_EP')
 for ref,x,y,m,val,fp in [
 ('J1',35.56,35.56,{1:'VIN5',2:'GND'},'EXT CURRENT LIMITED 5V','Header_1x02'),
 ('J2',35.56,96.52,{1:'VOUT5',2:'GND'},'DUMMY LOAD ONLY','Header_1x02'),
 ('J3',35.56,157.48,{1:'ARM_POST_NC',2:'GND'},'3V3 AFTER EXTERNAL NC STOP','Header_1x02'),
 ('C1',91.44,35.56,{1:'GND',2:'VIN5'},'10uF 25V X7R candidate','C_0805'),
 ('C2',91.44,96.52,{1:'VOUT5',2:'GND'},'1uF 25V X7R candidate','C_0805'),
 ('C3',147.32,157.48,{1:'CT',2:'GND'},'1nF 50V C0G candidate','R_C_0603'),
 ('R1',208.28,35.56,{1:'ARM_POST_NC',2:'ON'},'1k 1%','R_C_0603'),
 ('R2',208.28,96.52,{1:'ON',2:'GND'},'10k 1% pull-down','R_C_0603')]:place(ref,'TwoPin',x,y,m,val,'MiniCell:'+fp)
 sch.append(f'(text "5V coupon / NOT safety interlock or Mini / no reverse protection / ERC-DRC pending" (at 20.32 198.12 0) {eff()} (uuid {uid("warning")}))')
 (out/'mini-cell-power.kicad_sch').write_text('\n'.join(sch)+')\n')
 (out/'MiniCell.kicad_sym').write_text('(kicad_symbol_lib (version 20241209) (generator mini_cell_power)'+''.join(s.replace('MiniCell:','',1) for s in lib)+')\n')

def board(out):
 b=['(kicad_pcb (version 20221018) (generator mini_cell_power) (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (49 "F.Fab" user)) (setup (pad_to_mask_clearance 0)) (net 0 "")']
 b += [f'(net {v} {q(k)})' for k,v in NET.items()];fps={}
 def footprint(ref,name,x,y,pads):
  block=[f'(footprint "MiniCell:{name}" (layer "F.Cu") (tstamp {uid("fp"+ref)}) (at {x} {y}) (path "/{ROOT}/{uid(ref)}") (attr {"through_hole" if name.startswith("Header") else "smd"}) (fp_text reference {q(ref)} (at 0 -2) (layer "F.Fab") {eff(.7)})']
  for no,px,py,sx,sy,net,drill in pads:
   block.append(f'(pad {q(no)} {"thru_hole circle" if drill else "smd rect"} (at {px} {py}) (size {sx} {sy}) '+(f'(drill {drill}) (layers "*.Cu" "*.Mask") ' if drill else '(layers "F.Cu" "F.Paste" "F.Mask") ')+f'(net {NET[net]} {q(net)}))')
  block.append(')');text='\n'.join(block);b.append(text)
  fp=text.replace(q('MiniCell:'+name),q(name)+' (version 20221018) (generator mini_cell_power)',1)
  fp=re.sub(r'\(tstamp [^)]*\)|\(path [^)]*\)|\(at '+str(x)+' '+str(y)+r'\)', '',fp,count=3)
  fp=re.sub(r'\(net \d+ "[^"]*"\)','',fp).replace(q(ref),'"REF**"',1);fps.setdefault(name,fp)
 footprint('U1','WSON8_2x2_EP',15,12,[(i,-.95 if i<=4 else .95,(-.75+.5*(i-1)) if i<=4 else (.75-.5*(i-5)),.5,.25,PIN[i],None) for i in range(1,9)]+[(9,0,0,.9,1.6,'GND',None)])
 for ref,x,y,nets in [('J1',4,6,['VIN5','GND']),('J2',25,6,['VOUT5','GND']),('J3',4,16,['ARM_POST_NC','GND'])]:footprint(ref,'Header_1x02',x,y,[(i+1,0,i*2.54,1.7,1.7,n,1) for i,n in enumerate(nets)])
 for ref,x,y,nets in [('C1',10,9,['GND','VIN5']),('C2',20,9,['VOUT5','GND'])]:footprint(ref,'C_0805',x,y,[(i+1,-1 if i==0 else 1,0,1,1.45,n,None) for i,n in enumerate(nets)])
 for ref,x,y,nets in [('C3',19,14.5,['CT','GND']),('R1',9,15.5,['ARM_POST_NC','ON']),('R2',12,19,['ON','GND'])]:footprint(ref,'R_C_0603',x,y,[(i+1,-.825 if i==0 else .825,0,.8,.95,n,None) for i,n in enumerate(nets)])
 def track(net,pts,width=.25,layer='F.Cu'):
  for i,(a,z) in enumerate(zip(pts,pts[1:])):b.append(f'(segment (start {a[0]} {a[1]}) (end {z[0]} {z[1]}) (width {width}) (layer {q(layer)}) (net {NET[net]}) (tstamp {uid(str((net,pts,i,layer)))}))')
 def via(net,x,y):b.append(f'(via (at {x} {y}) (size .6) (drill .3) (layers "F.Cu" "B.Cu") (net {NET[net]}) (tstamp {uid(str((net,x,y)))}))')
 track('VIN5',[(4,6),(11,6),(11,9),(12,10),(12,11.25),(14.05,11.25)],.4);track('VIN5',[(12,11.25),(12,11.75),(14.05,11.75)],.4)
 via('VIN5',11,6);via('VIN5',13.3,13.5);track('VIN5',[(11,6),(13.3,8.3),(13.3,13.5)],.4,'B.Cu');track('VIN5',[(13.3,13.5),(13.3,12.75),(14.05,12.75)])
 track('VOUT5',[(25,6),(19,6),(19,9),(17.5,10.5),(17.5,11.25),(15.95,11.25)],.4);track('VOUT5',[(17.5,11.25),(17.5,11.75),(15.95,11.75)],.4)
 track('ARM_POST_NC',[(4,16),(7.675,16),(8.175,15.5)])
 track('ON',[(9.825,15.5),(12.5,15.5),(12.5,12.25),(14.05,12.25)]);track('ON',[(12.5,15.5),(11.175,16.825),(11.175,19)])
 track('CT',[(15.95,12.25),(18.175,12.25),(18.175,14.5)])
 for pts in [[(9,9),(8,9)],[(21,9),(22,9)],[(19.825,14.5),(21,14.5)],[(12.825,19),(14,19)],[(15.95,12.75),(17,13.8)]]:track('GND',pts);via('GND',*pts[-1])
 via('GND',15,12)
 for a,z in [((1,1),(29,1)),((29,1),(29,24)),((29,24),(1,24)),((1,24),(1,1))]:b.append(f'(gr_line (start {a[0]} {a[1]}) (end {z[0]} {z[1]}) (layer "Edge.Cuts") (width .05) (tstamp {uid(str((a,z)))}))')
 b.append(f'(gr_text "5V COUPON / NOT MINI / REVIEW" (at 15 22.5) (layer "F.SilkS") {eff(.65)} (tstamp {uid("label")}))')
 b.append(f'(zone (net 1) (net_name "GND") (layer "B.Cu") (tstamp {uid("zone")}) (hatch edge .5) (connect_pads (clearance .2)) (min_thickness .2) (fill yes (thermal_gap .25) (thermal_bridge_width .3)) (polygon (pts (xy 1.5 1.5) (xy 28.5 1.5) (xy 28.5 23.5) (xy 1.5 23.5))))')
 (out/'mini-cell-power.kicad_pcb').write_text('\n'.join(b)+')\n');pretty=out/'MiniCell.pretty';pretty.mkdir(exist_ok=True)
 for name,text in fps.items():(pretty/(name+'.kicad_mod')).write_text(text+'\n')

def main(output):
 out=Path(output);out.mkdir(parents=True,exist_ok=True);schematic(out);board(out)
 (out/'sym-lib-table').write_text('(sym_lib_table (version 7) (lib (name "MiniCell") (type "KiCad") (uri "${KIPRJMOD}/MiniCell.kicad_sym") (options "") (descr "Evaluation only")))\n')
 (out/'fp-lib-table').write_text('(fp_lib_table (version 7) (lib (name "MiniCell") (type "KiCad") (uri "${KIPRJMOD}/MiniCell.pretty") (options "") (descr "Land pattern review pending")))\n')
 (out/'mini-cell-power.kicad_pro').write_text(json.dumps({'meta':{'filename':'mini-cell-power.kicad_pro','version':1},'board':{'design_settings':{'rules':{'min_clearance':.15,'min_track_width':.2,'min_via_diameter':.6,'min_through_hole_diameter':.3}}}},indent=2)+'\n')
 (out/'design-status.json').write_text(json.dumps({'schema':'rockstaros.cell-power-coupon/1','status':'routed_source_unreviewed','scope':'5V evaluation load switch only, external current limit required','ic':'TPS22965DSGR','icPinNets':PIN,'source':'https://www.ti.com/lit/ds/symlink/tps22965.pdf','boardMm':[28,23,1.6],'manufacturingReleased':False,'ercDrcExecuted':False,'physicalAccepted':False,'sourceOnly':True,'exclusions':['Mini mainboard','current limit','reverse current blocking','watchdog','independent safety cutoff','HDMI/USB backfeed rejection'],'powerBudget':'5V external current-limited supply; 2A is study envelope, not validated rating'},indent=2)+'\n')
 print(out)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);main(p.parse_args().output)
