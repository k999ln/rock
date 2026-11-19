"""Offline fixture demonstration; no radio/socket/provider access."""
import json
from pathlib import Path
import tempfile

from controller import Controller, Rejected


def run():
    now = 100
    with tempfile.TemporaryDirectory(prefix='mini-tethering-demo-') as directory:
        c = Controller(Path(directory) / 'private')
        c.initialize(dict(ownerId='demo-owner', deviceId='demo-mini', periodId='demo-period',
                          currency='USD', byteCap=500, costCapMinor=30, maxClients=2,
                          expiresAt=200, providerId='fixture-only', contractVersion='fixture-v1',
                          region='US', blockBytes=100, blockPriceMinor=10, grantFeeMinor=0,
                          maxGrantBytes=200, maxGrantSeconds=30), now)
        def revision():
            return c.snapshot(now)['revision']
        def observe():
            c.observe(revision(), dict(bootId='fixture-boot', linkId='fixture-link',
                      providerId='fixture-only', contractVersion='fixture-v1', region='US',
                      observedAt=now, validUntil=160, powerSafe=True, batteryReady=True,
                      apIsolated=True, meterReady=True, hardQuotaReady=True,
                      satelliteRegistered=True, twoWayIp=True, internetReachable=True,
                      sharingEntitled=True, connectedClientIds=['demo-phone']), now)
        c.attachment(revision(), 'demo-dock', now)
        c.owner_command('demo-owner', revision(), dict(op='allow', clientId='demo-phone', byteCap=500), now)
        c.owner_command('demo-owner', revision(), dict(op='enable'), now)
        observe()
        c.attachment(revision(), None, now)
        observe()
        c.reserve(revision(), 'transfer-1', 'demo-phone', 200, now)
        portable = c.can_forward('transfer-1', now)
        c.settle_closed(revision(), 'transfer-1', 40, 100, now)
        c.reserve(revision(), 'transfer-unknown', 'demo-phone', 100, now)
        try:
            c.reserve(revision(), 'over-cap', 'demo-phone', 1, now)
        except Rejected as error:
            denial = str(error)
        c = Controller(Path(directory) / 'private')
        c.recover(revision(), now)
        state = c.snapshot(now)
        return dict(mode='offline_fixture', portableDecision=portable,
                    overCap=denial, restoredSharing=state['enabled'],
                    txBytes=state['txBytes'], rxBytes=state['rxBytes'],
                    costUpperMinor=state['costUpperMinor'], **state['summary'])


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
