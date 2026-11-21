import assert from 'node:assert/strict';
import test from 'node:test';
import { pairRunner } from '../scripts/noah-mac-runner.mjs';
import {
  connectMacFromApp,
  MAC_SETUP_TOOLS,
  onboardingErrorMessage,
} from '../scripts/noah-mac-onboarding.mjs';

function fixture() {
  const events = [],
    calls = [],
    controller = new AbortController();
  const config = {
    origin: 'https://avoado.si',
    expiresAt: Date.now() + 3600000,
    token: 'synthetic-test-secret',
  };
  const health = (missing = []) => ({
    ready: missing.length === 0,
    checks: ['Apple Silicon Mac', 'Node 24以上', ...MAC_SETUP_TOOLS].map(
      (name) => ({ name, ok: !missing.includes(name) }),
    ),
  });
  const options = {
    source: '/synthetic/payload',
    root: '/synthetic/runner',
    signal: controller.signal,
    emit: (event) => events.push(event),
    doctor: async () => health(),
    hasBrew: async () => true,
    hasDeveloperTools: async () => true,
    run: async (...args) => calls.push(['run', ...args]),
    lock: async () => {
      calls.push('lock');
      return async () => calls.push('unlock');
    },
    install: async () => calls.push('install'),
    readConfig: async () => config,
    pair: async () => {
      calls.push('pair');
    },
    createRunner: async () => {
      calls.push('enroll');
      return {
        run: async () => calls.push('poll'),
        close: async () => calls.push('close'),
      };
    },
  };
  return { events, calls, controller, config, health, options };
}
void test('existing account connects only after enrollment and closes before releasing lock', async () => {
  const f = fixture();
  await connectMacFromApp(f.options);
  assert.deepEqual(f.calls, [
    'lock',
    'install',
    'enroll',
    'poll',
    'close',
    'unlock',
  ]);
  assert.deepEqual(
    f.events.map((e) => e.state),
    ['preparing', 'connecting', 'connected'],
  );
  assert.ok(!JSON.stringify(f.events).includes(f.config.token));
});
void test('missing prerequisite opens installer route without installing, pairing or enrolling', async () => {
  const f = fixture();
  f.options.doctor = async () => f.health(['colima']);
  f.options.hasBrew = async () => false;
  await connectMacFromApp(f.options);
  assert.deepEqual(f.calls, ['lock', 'unlock']);
  assert.equal(f.events.at(-1).state, 'needs_installer');
});
void test('only fixed missing tool names are installed and rechecked', async () => {
  const f = fixture();
  let check = 0;
  f.options.doctor = async () => f.health(check++ ? [] : ['colima', 'ollama']);
  await connectMacFromApp(f.options);
  const invocation = f.calls.find((c) => Array.isArray(c));
  assert.equal(invocation[1], '/opt/homebrew/bin/brew');
  assert.deepEqual(invocation[2], ['install', 'colima', 'ollama']);
  assert.equal(invocation[3].signal, f.controller.signal);
  assert.equal(invocation[3].env.NODE_OPTIONS, undefined);
  assert.equal(check, 2);
});
void test('preparation failure never pairs or reports connected', async () => {
  for (const failRun of [true, false]) {
    const f = fixture();
    f.options.doctor = async () => f.health(['colima']);
    if (failRun)
      f.options.run = async () => {
        throw new Error('install failed');
      };
    await assert.rejects(connectMacFromApp(f.options));
    assert.ok(!f.calls.includes('pair') && !f.calls.includes('enroll'));
    assert.ok(!f.events.some((e) => e.state === 'connected'));
    assert.equal(f.calls.at(-1), 'unlock');
  }
});
void test('new and expired accounts request browser approval, keep credentials out of events', async () => {
  for (const first of [null, { origin: 'https://avoado.si', expiresAt: 0 }]) {
    const f = fixture();
    let read = 0;
    f.options.readConfig = async () => {
      if (read++) return f.config;
      if (first) return first;
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    };
    f.options.pair = async ({ origin, signal, print, onAuthorization }) => {
      assert.equal(origin, 'https://avoado.si');
      assert.equal(signal, f.controller.signal);
      print(f.config.token);
      await onAuthorization(
        'https://avoado.si/connect/device?user_code=ABCDEFGH',
      );
      f.calls.push('pair');
    };
    await connectMacFromApp(f.options);
    assert.ok(f.calls.indexOf('pair') < f.calls.indexOf('enroll'));
    assert.equal(
      f.events.find((e) => e.url)?.url,
      'https://avoado.si/connect/device?user_code=ABCDEFGH',
    );
    assert.ok(!JSON.stringify(f.events).includes(f.config.token));
  }
});
void test('invalid account, wrong origin and duplicate runner fail without replacing or enrolling', async () => {
  for (const variant of ['invalid', 'origin', 'duplicate']) {
    const f = fixture();
    if (variant === 'invalid')
      f.options.readConfig = async () => {
        throw new Error('invalid private config');
      };
    if (variant === 'origin') f.config.origin = 'https://attacker.test';
    if (variant === 'duplicate')
      f.options.lock = async () => {
        throw new Error('already running');
      };
    await assert.rejects(connectMacFromApp(f.options));
    assert.ok(!f.calls.includes('pair') && !f.calls.includes('enroll'));
    if (variant === 'duplicate') assert.ok(!f.calls.includes('install'));
  }
});
void test('rejected enrollment never reports a connected Mac', async () => {
  const f = fixture();
  f.options.createRunner = async () => {
    throw new Error('enrollment denied');
  };
  await assert.rejects(connectMacFromApp(f.options), /denied/);
  assert.ok(!f.events.some((e) => e.state === 'connected'));
});
void test('cancellation awaits teardown; a failed teardown stays unconfirmed', async () => {
  for (const fail of [false, true]) {
    const f = fixture();
    let release;
    const closed = new Promise((resolve) => {
      release = resolve;
    });
    f.options.createRunner = async () => ({
      run: async () => {
        f.controller.abort();
      },
      close: async () => {
        await closed;
        if (fail) throw new Error('still running');
        f.calls.push('close');
      },
    });
    const pending = connectMacFromApp(f.options);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(!f.calls.includes('unlock'));
    release();
    if (fail) {
      await assert.rejects(pending, (error) => error.stopUnconfirmed === true);
      assert.ok(!f.calls.includes('unlock'));
    } else {
      await pending;
      assert.deepEqual(f.calls.slice(-2), ['close', 'unlock']);
    }
  }
});

void test('fresh Mac requests Apple tools through a GUI step before Homebrew or pairing', async () => {
  const f = fixture();
  f.options.doctor = async () => f.health(['git', 'colima']);
  f.options.hasDeveloperTools = async () => false;
  await connectMacFromApp(f.options);
  assert.deepEqual(f.calls, ['lock', 'unlock']);
  assert.equal(f.events.at(-1).state, 'needs_developer_tools');
});

void test('cancelled or malformed pairing never opens an approval URL', async () => {
  for (const cancel of [true, false]) {
    const controller = new AbortController();
    let opened = false;
    await assert.rejects(
      pairRunner({
        origin: 'https://avoado.si',
        file: '/unused/account.json',
        signal: controller.signal,
        print: () => {},
        onAuthorization: async () => {
          opened = true;
        },
        fetcher: async () => {
          if (cancel) controller.abort();
          return Response.json({
            userCode: cancel ? 'ABCDEFGH' : 'https://evil.test',
            deviceCode: 'rock_device_' + 'a'.repeat(43),
            expiresIn: 600,
          });
        },
      }),
    );
    assert.equal(opened, false);
  }
});

void test('native error events never disclose raw credential or response content', () => {
  const secret = 'rock_session_' + 's'.repeat(43);
  assert.ok(
    !onboardingErrorMessage(new Error('Invalid JSON near ' + secret)).includes(
      secret,
    ),
  );
  assert.equal(
    onboardingErrorMessage(new Error('Noah Runnerは既に起動しています。')),
    'Noah Runnerは既に起動しています。',
  );
  assert.match(
    onboardingErrorMessage({ stopUnconfirmed: true }),
    /停止を確認できません/,
  );
});
