#!/usr/bin/env python3
"""Static wiring checks only; does not access hardware or certify an alarm."""
import json
from pathlib import Path

d = json.loads((Path(__file__).parent / 'bom-netlist.json').read_text())
parts = {p['id']: p for p in d['bom']}
assert len(parts) == len(d['bom'])
sources = {s['id'] for s in d['sources']}
assert all(p['source'] in sources for p in parts.values())
assert d['commonOsUnchanged'] and d['noNewBuildingWiring']
assert len({n['id'] for n in d['connections']}) == len(d['connections'])
for n in d['connections']:
    for key in ('fromPort', 'toPort'):
        part, port = n[key].split('.', 1)
        part = part.split('[')[0]
        assert part in parts, (n['id'], part)
        assert port in parts[part]['ports'], (n['id'], port)
    if 'via' in n:
        assert parts[n['via']]['model'] == 'Phidgets 3017_1'
    assert n['domain'] in {'FIRE_H1', 'FIRE_H2', 'FIRE_H4', 'CONTACT', 'ISOLATED_USB', 'CORE_USB'}
    assert all(n[k].split('.')[0] not in {'S4', 'B2', 'B3'} for k in ('fromPort', 'toPort'))
for n in d['connections']:
    if n['kind'] == 'factory_battery':
        assert n['fromPort'].startswith('HB') and n['toPort'].startswith('H')
assert not any('GPIO' in n['fromPort'] + n['toPort'] for n in d['connections'])
c = d['contact']; p = d['power']
sense_ma = c['conservativeSenseVoltageV'] / c['inputPullupOhm'] * 1000
assert c['conservativeSenseVoltageV'] < c['maxVoltageV'] and sense_ma < c['maxCurrentMa']
assert not c['openMeansHealthy'] and not c['minimumLoadConfirmed']
assert not c['providesZoneIdentity'] and not c['providesFaultOrBattery']
assert p['inputBoardAcceptanceLimitMa'] < p['isolatorOutputMaxMa'] < p['inputBoardMaxCatalogMa']
assert p['isolatorMinimumOwnMa'] + p['inputBoardAcceptanceLimitMa'] / p['isolatorTypicalEfficiency'] < p['addedHostAllocationMa']
assert p['p3OriginalTotalMa'] + p['addedHostAllocationMa'] < p['p3TotalLimitMa']
assert p['p3OriginalUsbMa'] + p['addedHostAllocationMa'] == p['p3UsbLimitMa']
assert not p['radioSimultaneousAccepted'] and not p['measured']
assert all(g['status'] == 'OPEN' for g in d['gates'])
assert all(not d['release'][k] for k in ('unconditionalProcurement', 'fieldInstallation', 'certifiedReplacement', 'manufacturing'))
assert d['release']['physicalTest'] == 'NOT_RUN'
print(f"PASS: {len(parts)} parts, {len(d['connections'])} connections; sense bound {sense_ma:.3f} mA")
print('HOLD: OEM/contact, all-radio power, mounting, facility permission, final certification. No physical test.')
