import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import test from 'node:test';
import { BalancedPool, Pool } from 'undici';

for (const kind of ['connect options', 'tls options', 'connector function']) {
  void test(`BalancedPool preserves custom TLS verification through ${kind}`, async (t) => {
    let connectionAttempts = 0;
    const noConnection = () => {
      connectionAttempts++;
      throw new Error('This options-only test must not open a connection');
    };
    t.mock.method(net.Socket.prototype, 'connect', noConnection);
    t.mock.method(tls, 'connect', noConnection);
    const verification = () => new Error('Synthetic verification rejection');
    const connector = () => { throw new Error('The synthetic connector must not be called'); };
    const option = kind === 'connect options'
      ? { connect: { checkServerIdentity: verification } }
      : kind === 'tls options'
        ? { tls: { checkServerIdentity: verification } }
        : { connect: connector };
    const seen = [];
    const pool = new BalancedPool(['https://one.example.test', 'https://two.example.test'], {
      ...option,
      factory(origin, options) {
        seen.push(options);
        return new Pool(origin, options);
      },
    });
    try {
      pool.addUpstream('https://three.example.test');
      assert.equal(seen.length, 3);
      for (const options of seen) {
        if (kind === 'connector function') assert.equal(options.connect, connector);
        else assert.equal(options[kind === 'connect options' ? 'connect' : 'tls'].checkServerIdentity, verification);
      }
    } finally {
      await pool.close();
      assert.equal(connectionAttempts, 0);
    }
  });
}
