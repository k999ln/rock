import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import {
  EsimBootstrap,
  FixtureEsimProvider,
  verifyFixtureBootstrap,
} from './core.mjs';

const directory = mkdtempSync(join(tmpdir(), 'rockstar-esim-fixture-'));
const provider = new FixtureEsimProvider(join(directory, 'provider.sqlite'));
// Ephemeral host test keys only. Never OS/platform or production signing keys.
const keys = generateKeyPairSync('ed25519');
const service = new EsimBootstrap({
  filename: join(directory, 'rockstar.sqlite'),
  provider,
  ...keys,
});
try {
  const owner = 'demo-owner';
  const deviceId = 'demo-phone';
  const enrollment = service.createFixtureEnrollment(
    owner,
    'demo-request',
    'lifeline',
  );
  await service.provision(owner, enrollment.id);
  provider.setState(enrollment.id, 'enabled');
  await service.reconcile(owner, enrollment.id);
  service.registerFixtureDevice(owner, deviceId, {
    esimSupported: true,
    receiverInstalled: true,
    localRuntimePresent: true,
    modelAssetsVerified: false,
  });
  const envelope = service.bootstrap(owner, enrollment.id, deviceId);
  const plan = verifyFixtureBootstrap(envelope, keys.publicKey, {
    owner,
    enrollmentId: enrollment.id,
    deviceId,
    now: Date.now(),
  });
  console.log(
    JSON.stringify(
      {
        mode: 'host-fixture-only',
        realEsimIssued: false,
        charged: false,
        pack: plan.pack,
        defaultAgentRequests: plan.defaultAgentRequests,
        setup: plan.setup,
        localAi: plan.localAi,
        cloudAi: plan.cloudAi,
        offlineSignatureVerified: true,
        explanation:
          '模擬eSIMの有効化→構成の発行→署名検証まで。端末への導入・AI推論・通信会社接続は未実施。',
      },
      null,
      2,
    ),
  );
} finally {
  service.close();
  provider.close();
  rmSync(directory, { recursive: true, force: true });
}
