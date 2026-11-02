#!/usr/bin/env python3
"""Structural/budget checks only: unresolved electrical/RF contracts stay OPEN."""
import json
import math
from pathlib import Path
D=Path(__file__).resolve().parent
x=json.loads((D/'bom-netlist.json').read_text());doc=(D.parent/'22-integrated-radio.md').read_text()
ids=[p['id'] for p in x['parts']];assert len(ids)==len(set(ids))
for p in x['parts']:
 assert p['model'] in doc,p['model']
 assert p['quantity']>0 and all(s in x['sources'] or s=='DESIGN' for s in p['sources'])
seen={}
for n in x['nets']:
 for ep in n['endpoints']:
  assert ep not in seen,ep
  assert ep.split('.')[0] in ids
  seen[ep]=n['name']
assert not set(x['nc'])&set(seen)
assert seen['UPS.INPUT.+']=='12V6_CHARGE'
assert seen['UPS.5V.+']=='5V_SYSTEM' and seen['CORE.USB_C.VBUS']=='5V_SYSTEM'
assert seen['MODEM.UART0.1']==seen['GNSS.USB.1']=='5V_USB_HOST'
assert seen['CORE.J8.4']!=seen['MODEM.UART0.1']
assert not {'REG','DC-F','DC-M'} & set(ids)
for n in x['nets']:
 if n['nominalV']>5: assert all(not e.startswith(('CORE.','MODEM.')) for e in n['endpoints'])
assert seen['CORE.J8.3']=='I2C_SDA' and seen['CORE.J8.5']=='I2C_SCL'
assert seen['CORE.J8.8']=='FAN_CONTROL'
for c in x['connections']:
 assert c['assembly'] in ids
 assert c['fromEndpoint'].split('.')[0] in ids
 assert c['toEndpoint'].split('.')[0] in ids+['OWNER']
for id in ['CORE','UPS','MODEM','RF-ANT','GNSS','SIM','SD','FAN']:
 assert next(p for p in x['parts'] if p['id']==id)['travels']
assert len([c for c in x['connections'] if c['id']=='P01' and not c['remainsWhenUndocked']])==1
p=x['power'];loads=p['loadsA'];total=sum(loads.values());usb=loads['modemUsb']+loads['gnssUsb']
assert total<=p['upsOutputMaxA'] and usb<=p['usbTotalMaxA']
assert total<=p['piInputDesignMaxA']
assert math.isclose(p['chargeNominalV'],p['seriesCells']*p['cellChargeV'],abs_tol=1e-9)
assert p['chargerRatedA']<=p['cellStandardChargeA']
assert p['cellMaxLengthMm']<p['holderLengthLimitMm']
assert p['chargeEnclosureOpenRequired'] and not p['manufacturerMaxima']
assert not p['powerTransientVerified'] and not p['unattendedChargeAccepted']
assert seen['UPS.header.2']=='I2C_SDA' and seen['UPS.header.1']=='I2C_SCL'
assert seen['UPS.header.5']=='GND' and seen['CORE.J8.9']=='GND'
assert set(x['modes'])=={'LOCAL','WIFI','LTE','NTN'}
assert not x['radioPolicy']['applicationRouteIsRfExclusion']
assert not x['radioPolicy']['normalRouteChangePowersModemOff']
assert not x['radioPolicy']['normalRouteChangeSendsDetach']
assert x['radioPolicy']['wifiModemControlPlaneOverlapPossible']
assert x['radioPolicy']['admissionRequiresMaintenanceBudgetAndShutdownProcedure']
assert x['radioPolicy']['terrestrialPriorityRequired']
assert x['radioPolicy']['sharedAntennaTerrestrialCheckSeconds']<=600
assert not x['radioPolicy']['providerProcedureConfirmed']
assert not x['providerConformanceAccepted'] and not x['procurementReleased']
assert x['ntn']['payloadIncludingEnvelopeMaxBytes']<=x['ntn']['providerUdpPayloadMaxBytes']
assert x['ntn']['gnssRequired'] and x['ntn']['stationaryRequired']
for k in ['physicalAccepted','runtimeImplemented','rfColocationAccepted','japanNtnDeviceAccepted','usbPowerContractAccepted','manufacturingReleased']:assert x[k] is False
assert {r['id'] for r in x['releaseConditions'] if r['status']=='OPEN'}=={'R01','R02','R03','R04'}
assert all(a['status']=='NOT_RUN' for a in x['acceptance'])
print(json.dumps(dict(result='PASS_STATIC_ONLY_WITH_OPEN_RELEASE_CONDITIONS',parts=len(ids),connections=len(x['connections']),logicalNets=len(x['nets']),designA=round(total,2),usbDesignA=round(usb,2),upsMarginA=round(p['upsOutputMaxA']-total,2),piInputMarginA=round(p['piInputDesignMaxA']-total,2),usbMarginA=round(p['usbTotalMaxA']-usb,2),openReleaseConditions=4,physicalAccepted=False,usbPowerContractAccepted=False),ensure_ascii=False,indent=2))
