#!/usr/bin/env python3
"""Check F3 netlist isolation, operating modes and calculated power budgets.

No hardware access. A static pass never clears supplier or physical gates.
"""
import json
from pathlib import Path

d = json.loads((Path(__file__).parent / 'bom-netlist.json').read_text())
parts = {p['id']: p for p in d['bom']}
nets = {n['id']: n for n in d['connections']}
assert len(parts) == len(d['bom']) and len(nets) == len(d['connections'])
sources = {s['id'] for s in d['sources']}
assert all(p['source'] in sources for p in parts.values())
assert d['commonOsUnchanged'] and d['noNewBuildingWiring']
for n in nets.values():
    for key in ('fromPort', 'toPort'):
        part, port = n[key].split('.', 1)
        part = part.split('[')[0]
        assert part in parts and port in parts[part]['ports'], (n['id'], part, port)
    if 'via' in n:
        assert n['via'] in parts, n['id']
    assert not any(n[k].startswith(('S4.', 'B2.', 'B3.', 'UPS.')) for k in ('fromPort', 'toPort'))
    assert n['mode'] in {'RUN', 'CHARGE_ONLY'}

# Distinct external power paths, not merely another downstream hub on Pi VBUS.
assert (nets['P01']['fromPort'], nets['P01']['toPort']) == ('PB.C1', 'CORE.USB-C power')
assert (nets['P02']['fromPort'], nets['P02']['toPort']) == ('PB.C2', 'HUB.USB-C POWER')
assert nets['P01']['via'] != nets['P02']['via']
assert nets['C01']['toPort'] == 'PB.C1' and nets['C01']['mode'] == 'CHARGE_ONLY'
assert d['modes']['mutuallyExclusive']
assert nets['F07-F3']['fromPort'] == 'HUB.U3'
assert nets['D02']['fromPort'] == 'HUB.U1' and nets['D02']['held']
assert nets['D03']['fromPort'] == 'HUB.U2'
assert not any('HUB.U4' in (n['fromPort'], n['toPort']) for n in nets.values())

# Only the approved isolated USB device port connects to the I/O board.
allowed_i1 = {'F04', 'F05', 'F06'}
assert {n['id'] for n in nets.values() if any(n[k].startswith('I1.') for k in ('fromPort', 'toPort'))} == allowed_i1
assert nets['F06']['fromPort'] == 'I2.device USB-A'
assert all(nets[k]['held'] for k in ('F03', 'F04', 'F05'))
for n in nets.values():
    if n['kind'] == 'factory_battery':
        assert n['fromPort'].startswith('HB') and n['toPort'].startswith('H')
    if n['kind'] == 'power':
        assert n['domain'] in {'CORE_5V', 'HUB_5V', 'CHARGE'}

p = d['power']
hub = sum(p[k] for k in ('hubOwnAllocationMa', 'modemAllocationMa', 'gnssAllocationMa', 'fireIoAllocationMa'))
assert hub == p['hubAllocationMa'] < p['sourcePortLimitMa']
assert p['coreAllocationMa'] < p['sourcePortLimitMa']
watts = p['sourceNominalV'] * (hub + p['coreAllocationMa']) / 1000
assert watts == p['totalAllocationW']
# Unknown USB power contract is intentionally not replaced by 3A hub capability.
assert not any(p[k] for k in ('measured', 'source5VSimultaneousVerified', 'usbPowerContractAccepted', 'upstreamBackfeedAccepted', 'allRadiosPowerAccepted', 'unattendedCeilingChargeAccepted'))
assert not d['modes']['runtimeLteNtnDataSimultaneous']
assert not d['contact']['openMeansHealthy']
assert all(g['status'] == 'OPEN' for g in d['gates'])
assert d['release']['physicalTest'] == 'NOT_RUN'
assert all(not d['release'][k] for k in ('unconditionalProcurement', 'fieldInstallation', 'certifiedReplacement', 'manufacturing', 'ceilingMountAccepted', 'finalProductBomComplete'))
compat = json.loads((Path(__file__).parent / 'compatibility.json').read_text())
assert compat['commonOsUnchanged'] and not compat['crossManufacturerInterchangeAccepted']
assert compat['siteCountAccepted'] == 0
assert len({f['manufacturer'] for f in compat['families']}) == 4
assert len({f['id'] for f in compat['families']}) == len(compat['families'])
for f in compat['families']:
    assert f['head'] and f['bases'] and f['sources']
    assert all(s in compat['sources'] for s in f['sources'])
    assert not f['miiReplacementAccepted'] and not f['siteAccepted']
    assert f['remaining'] and not f['terminalPositionDrawingComplete']
print(f"Compatibility: 4 manufacturers / {len(compat['families'])} reference families; no mii/site acceptance")
print(f"PASS: {len(parts)} parts / {len(nets)} connections / {watts:.1f} W allocated")
print(f"Margins: Core {(p['sourcePortLimitMa']-p['coreAllocationMa'])/1000:.2f} A; Hub {(p['sourcePortLimitMa']-hub)/1000:.2f} A")
print('HOLD: contact/USB/RF/temperature/mount/OEM/certification. Physical tests NOT_RUN.')
