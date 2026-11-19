"""Editable ECAD area study, with NO pads, nets, routing or fabrication authority."""
import argparse,json,math
from pathlib import Path

def build(out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 lines=['(kicad_pcb (version 20221018) (generator mini_spatial_floorplan) (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (37 "F.SilkS" user "f.silkscreen") (44 "Edge.Cuts" user) (49 "F.Fab" user)) (setup (pad_to_mask_clearance 0))', '(gr_circle (center 100 100) (end 135 100) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))']
 # CM5 module BODY reservation, not connector or socket footprint.
 for a,b in [((72.5,80),(127.5,80)),((127.5,80),(127.5,120)),((127.5,120),(72.5,120)),((72.5,120),(72.5,80))]:
  lines.append(f'(gr_line (start {a[0]} {a[1]}) (end {b[0]} {b[1]}) (stroke (width .15) (type default)) (layer "F.Fab"))')
 for text,y in [('CM5 BODY ONLY - sockets and keepouts pending',100),('NO PADS / NETS / ROUTING - NOT FOR FABRICATION',143)]:
  lines.append(f'(gr_text {json.dumps(text)} (at 100 {y}) (layer "F.Fab") (effects (font (size 1 1) (thickness .15))))')
 lines.append(')');(out/'mini-core-area-study.kicad_pcb').write_text('\n'.join(lines)+'\n')
 (out/'README.txt').write_text('Area reservation only. Diameter70mm carrier inside hypothetical72mm cavity. CM5 55x40mm body. No connector, heatsink, cable, fastener or interference approval. Not a component footprint, netlist, routed board or manufacturing artifact.\n')
 print(out/'mini-core-area-study.kicad_pcb')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);build(p.parse_args().output)
