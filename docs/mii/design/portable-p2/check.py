#!/usr/bin/env python3
"""Validate design graph and budgets. This cannot accept hardware or RF operation."""
import json
from pathlib import Path
D=Path(__file__).resolve().parent
x=json.loads((D/'bom-netlist.json').read_text())
ids=[p['id'] for p in x['parts']]
assert len(ids)==len(set(ids))
text=(D.parent/'21-portable-connectivity.md').read_text()
for p in x['parts']:
 assert p['model'] in text,p['model']
 assert p['quantity']>0
 assert all(s=='DESIGN' or s in x['sources'] for s in p['sources'])
for c in x['connections']:
 assert c['assembly'] in ids
 assert c['from'].split('.')[0] in ids
 assert c['to'].split('.')[0] in ids+['OWNER']
seen={}
for net in x['nets']:
 for ep in net['endpoints']:
  assert ep not in seen,('endpoint on two distinct nets',ep)
  seen[ep]=net['name']
  assert ep.split('.')[0] in ids
  if ep.startswith('CORE.J8.') and ep not in ['CORE.J8.2','CORE.J8.4']:
   assert net['nominal_v'] is not None and net['nominal_v']<=3.3
assert not set(x['nc'])&set(seen)
assert seen['CORE.J8.3']=='I2C_SDA' and seen['CORE.J8.5']=='I2C_SCL'
assert seen['CORE.J8.8']=='FAN_CONTROL'
assert seen['FAN.red']=='5V_SYSTEM' and seen['FAN.black']=='GND'
assert seen['LTE.USBJ1.2']=='LTE_USB_DM' and seen['LTE.USBJ1.3']=='LTE_USB_DP'
assert 'LTE.USBJ1.4' in x['nc']
assert 'CORE.USB_C' in x['nc'] and 'SAT.V_BATT' in x['nc']
p=x['power'];loads=p['loadsA'];total=sum(loads.values());usb=loads['lteUsb']+loads['satUsb']
assert total<=p['upsOutputMaxA'] and usb<=p['usbTotalMaxA']
assert loads['satUsb']<=.5 and loads['lteUsb']<=.5
assert x['jumpers']['SAT.fast_charge'].startswith('default open')
assert x['jumpers']['LTE.P2']==['2-3 only; 4-5 removed']
assert p['chargeEnclosureOpenRequired'] and p['upsInputMeasurementMaxV']<=5.2
removed={c['id'] for c in x['connections'] if not c['remains_when_undocked']}
assert removed=={'P01','E01'}, 'radio or battery would remain on dock'
assert max(x['mechanics']['allocationMm'])<=x['mechanics']['maximumEnvelopeTargetMm']
assert not x['rfColocationAccepted'] and not x['physicalAccepted'] and not x['runtimeImplemented']
assert all(a['status']!='PASS' for a in x['acceptance'])
energy=p['batteryCapacityMah']/1000*p['assumedBatteryNominalV']*p['assumedEfficiency']*p['assumedUsableFraction']
print(json.dumps({'result':'PASS_STATIC_DESIGN_ONLY','parts':len(ids),'connections':len(x['connections']),'logicalNets':len(x['nets']),'systemDesignA':round(total,2),'usbDesignA':usb,'systemMarginA':round(p['upsOutputMaxA']-total,2),'usbMarginA':round(p['usbTotalMaxA']-usb,2),'assumedUsableWh':round(energy,2),'assumedHoursAt6W':round(energy/6,2),'physicalAccepted':False,'rfColocationAccepted':False},ensure_ascii=False,indent=2))
