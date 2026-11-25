#!/usr/bin/env python3
"""Static design consistency only, not electrical certification or physical test."""
import json
from pathlib import Path
D=Path(__file__).resolve().parent
x=json.loads((D/'bom-netlist.json').read_text())
ids=[p['id'] for p in x['parts']]
assert len(ids)==len(set(ids)), 'duplicate BOM identifiers'
for p in x['parts']:
 assert p['total']==p['per_unit']*(x['tower_count'] if p['group']=='tower' else 1)
 assert all(s=='DESIGN' or s in x['sources'] for s in p['sources'])
for w in x['connections']: assert w['cable_part'] in ids
aliases={'CBYP-A':'CBYP','CBYP-B':'CBYP','RPD-A':'RPD','RPD-B':'RPD'}
seen={}
for n in x['nets']:
 assert len(n['endpoints'])==len(set(n['endpoints']))
 for endpoint in n['endpoints']:
  part,pin=endpoint.split('.',1)
  assert aliases.get(part,part) in ids, endpoint
  assert endpoint not in seen, f'{endpoint} shorts {seen.get(endpoint)} to {n["name"]}'
  seen[endpoint]=n['name']
  if part=='MCU' and pin.isdigit(): assert n['nominal_v']<=3.3, '5V into MCU GPIO'
  if part.startswith('MIC') or part in ('SE','TMP'): assert n['nominal_v']<=3.3
assert seen['MIC-L.SEL']=='GND' and seen['MIC-R.SEL']=='3V3'
assert seen['MIC-L.DOUT']==seen['MIC-R.DOUT']==seen['MCU.8']
assert seen['SW.VOUT']=='5V_RADAR' and seen['RAD.VIN']=='5V_RADAR'
assert seen['SW.ON']==seen['RPD-A.1'] and seen['RPD-A.2']=='GND'
assert not set(x['nc']) & set(seen), 'NC endpoint is connected'
p=x['profiles']['power']; count=x['tower_count']
assert count*p['tower_upstream_reservation_w']<=p['central_poe_budget_w']
assert p['camera_reservation_w']+p['control_reservation_w']<=p['flex_downstream_budget_w']
assert max(p['camera_reservation_w'],p['control_reservation_w'])<=p['flex_per_port_max_w']
assert p['control_5v_max_a']<=p['splitter_output_a']
# Minimum PoE maintaining load and maximum resistor dissipation incl. tolerance.
imin=4.75/(43*1.05); pmax=5.25**2/(43*.95)
assert imin>=.1 and pmax<2
f=x['profiles']['initial']
mono=f['mono_channels']*f['mono_width']*f['mono_height']*f['mono_fps']*f['mono_bits']/1e6
audio=f['audio_hz']*f['audio_channels']*f['audio_slot_bits']/1e6
per=mono+audio+f['rgb_encoded_mbps_cap']+f['control_reserve_mbps']
assert per<1000 and per*count<10000
chapter=(D.parent/'19-body-hardware.md').read_text()
for q in x['parts']: assert q['model'] in chapter, q['model']
com=json.loads((D/'communications.json').read_text())
comtext=(D.parent/'20-connectivity.md').read_text()
for q in com['selectedParts']: assert q['model'] in comtext
assert com['connections'][0]['from'].startswith('HUB.J33.')
assert com['connections'][1]['to']=='existing_owner_router.LAN'
assert all('J17' not in c['from']+c['to'] for c in com['connections']), 'WAN reuses sensor port'
assert len(com['unselected'])==4 and not com['physicalAccepted']
print(json.dumps({'result':'PASS_STATIC_DESIGN_ONLY','parts':len(ids),'nets':len(x['nets']),'connections':len(x['connections']),'communicationsParts':len(com['selectedParts']),'communicationsConnections':len(com['connections']),'payload_mbps_per_tower':round(per,7),'payload_mbps_four_towers':round(per*count,7),'minimum_load_ma':round(imin*1000,3),'load_resistor_worst_w':round(pmax,4),'physical_accepted':False,'firmware_accepted':False},ensure_ascii=False,indent=2))
