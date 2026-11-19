import { noahUploadId, NoahAgentError } from './noah-agent-upload.ts';
import {
  createNoahWork,
  updateNoahWork,
  noahDigest,
  executionInputDigest,
  type NoahExecution,
  NoahExecutionError,
} from './noah-execution.ts';
import {
  resolveNoahPin,
  createNoahInstanceService,
  type NoahAgentPin,
} from './noah-instances.ts';
import {
  authorizedNoahRelease,
  type NoahReleaseDependencies,
} from './noah-release.ts';
import { validateNoahExecutionSource } from './noah-execution-source.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { workStore } from './work-store.ts';
import {
  RECIPES,
  recipeFor,
  modelFor,
  LIMITS,
} from './noah-execution-contract.mjs';
import { ownerScopeFor } from './owner-intent.ts';
import { boundedNoahBody } from './noah-agent-api.ts';

type Device = {
  id: string;
  owner_id: string;
  credential_sha256: string;
  boot_id: string;
  name: string;
  platform: string;
  last_seen_at: number;
  revoked_at: number | null;
};
type Command = {
  id: string;
  owner_id: string;
  device_id: string;
  boot_id: string;
  kind: 'connect' | 'run';
  state: string;
  request_sha256: string;
  payload: string;
  lease_sha256: string | null;
  lease_until: number;
  stop_requested: number;
  result: string | null;
  created_at: number;
  updated_at: number;
};
type Payload = {
  pin: NoahAgentPin;
  connectionId?: string;
  prompt?: string;
  consent?: string;
  instanceId?: string;
  instanceClaim?: string;
  instanceCommandId?: string;
};
type Deps = NoahReleaseDependencies & {
  authenticate: (r: Request) => Promise<string>;
  now?: () => number;
  reviewers?: string[];
};
const LEASE = 30_000;
const hash = (v: unknown) => noahDigest(JSON.stringify(v));
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const presentDevice = (d: Device, now: number) => ({
  id: d.id,
  name: d.name,
  platform: d.platform,
  online: !d.revoked_at && d.last_seen_at > now - LEASE,
  revoked: Boolean(d.revoked_at),
});
const present = (r: Command) => {
  const p = JSON.parse(r.payload) as Payload;
  return {
    id: r.id,
    deviceId: r.device_id,
    kind: r.kind,
    state: r.state,
    stopRequested: Boolean(r.stop_requested),
    agent: p.pin,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    result: r.result ? JSON.parse(r.result) : null,
  };
};
const text = (v: unknown, max: number) => {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > max ||
    v.split('').some((c) => c.charCodeAt(0) < 32 && c !== '\n' && c !== '\t')
  )
    throw new NoahAgentError('入力を確認してください。');
  return v.trim();
};

/** Durable delivery control only. Executions and results remain in existing Work. */
export function createNoahLaunchService(deps: Deps) {
  const db = deps.db,
    now = deps.now ?? Date.now,
    jobs = workStore(db),
    instances = createNoahInstanceService(deps);
  const command = (owner: string, id: string) =>
    db
      .prepare('SELECT * FROM noah_runner_commands WHERE owner_id=? AND id=?')
      .bind(owner, noahUploadId(id))
      .first<Command>();
  const device = (owner: string, id: string) =>
    db
      .prepare(
        'SELECT * FROM noah_runner_devices WHERE owner_id=? AND id=? AND revoked_at IS NULL',
      )
      .bind(owner, noahUploadId(id))
      .first<Device>();
  async function samePin(owner: string, pin: NoahAgentPin) {
    const current = await resolveNoahPin(deps, owner, pin.agentId);
    if (current.digest !== pin.digest)
      throw new NoahAgentError('Agentの版または利用権が変わりました。', 409);
    return current;
  }
  async function reconcileUnknown(owner: string) {
    const rows = await db
      .prepare(
        "SELECT id FROM noah_runner_commands WHERE owner_id=? AND kind='run' AND state='unknown' ORDER BY updated_at DESC LIMIT 100",
      )
      .bind(owner)
      .all<{ id: string }>();
    for (const row of rows.results) {
      const job = await jobs.get(owner, row.id);
      if (
        !job?.noahExecution ||
        !['queued', 'running'].includes(job.noahExecution.state)
      )
        continue;
      const next = structuredClone(job);
      next.noahExecution!.state = 'unknown';
      next.noahExecution!.error =
        '実行器の確認期限が切れました。自動再実行はしません。';
      next.status = 'review';
      next.revision++;
      next.updatedAt = new Date(now()).toISOString();
      await jobs.update(owner, next, job.revision);
    }
  }
  async function expire(owner: string) {
    await db
      .prepare(
        "UPDATE noah_runner_commands SET state='unknown',updated_at=? WHERE owner_id=? AND state='claimed' AND lease_until<=?",
      )
      .bind(now(), owner, now())
      .run();
    await reconcileUnknown(owner);
  }
  async function runner(
    owner: string,
    credential: string,
    id: string,
    boot: string,
  ) {
    const d = await device(owner, id);
    if (
      !d ||
      d.boot_id !== noahUploadId(boot) ||
      d.credential_sha256 !== (await noahDigest(credential))
    )
      throw new NoahAgentError('Macの認証または接続が解除されています。', 403);
    await db
      .prepare(
        'UPDATE noah_runner_devices SET last_seen_at=? WHERE id=? AND owner_id=? AND revoked_at IS NULL',
      )
      .bind(now(), id, owner)
      .run();
    return d;
  }
  async function checkedLease(
    owner: string,
    id: string,
    lease: string,
    d: Device,
    allowFinished = false,
  ) {
    const r = await command(owner, id);
    if (
      !r ||
      r.device_id !== d.id ||
      r.boot_id !== d.boot_id ||
      r.lease_sha256 !== (await noahDigest(text(lease, 64)))
    )
      throw new NoahAgentError(
        'このMacに割り当てられた処理ではありません。',
        403,
      );
    if (!allowFinished && (r.state !== 'claimed' || r.lease_until <= now()))
      throw new NoahAgentError(
        '処理の期限が切れました。再実行せず停止してください。',
        409,
      );
    return r;
  }
  async function binding(
    owner: string,
    pin: NoahAgentPin,
    execution: Partial<NoahExecution>,
    prompt: string,
    claim: string,
  ) {
    await samePin(owner, pin);
    const recipe = recipeFor(pin.agentId);
    const b: Partial<NoahExecution> = {
      agentId: pin.agentId,
      prompt,
      recipe: recipe?.key ?? 'terminal',
      version: pin.version,
      model: pin.model as NoahExecution['model'],
      image: execution.image,
      ...(execution.modelSha256 ? { modelSha256: execution.modelSha256 } : {}),
      ...(execution.provider ? { provider: execution.provider } : {}),
      inputSha256: await executionInputDigest(pin.agentId, prompt),
      claimSha256: await noahDigest(claim),
    };
    if (pin.kind === 'release') {
      const rows = await db
        .prepare(
          'SELECT package_key AS k FROM sky_tool_packages WHERE manifest_sha256=?',
        )
        .bind(pin.manifestSha256)
        .all<{ k: string }>();
      if (rows.results.length !== 1)
        throw new NoahAgentError('配布版が見つかりません。', 404);
      const { manifest, artifact } = await authorizedNoahRelease(
        deps,
        owner,
        rows.results[0].k,
        pin.manifestSha256,
        true,
      );
      b.release = {
        packageKey: rows.results[0].k,
        manifestSha256: pin.manifestSha256,
        sourceSha256: artifact.sha256,
        runtime: artifact.runtime!,
        timeoutSeconds: manifest.execution.timeoutSeconds,
      };
    } else if (pin.kind === 'upload') {
      const a = await noahAgentStore(db, owner).get(pin.agentId);
      if (!a?.manifest.runtime || !a.source)
        throw new NoahAgentError('コードが見つかりません。', 404);
      b.source = {
        uploadId: a.id,
        manifestSha256: a.manifestSha256,
        sourceSha256: a.source.sha256,
        runtime: a.manifest.runtime,
      };
    } else if (pin.kind !== 'catalog')
      throw new NoahAgentError('この配布方式は単体ローンチの対象外です。', 422);
    return b;
  }
  return {
    async catalog() {
      const rows = await db
        .prepare(
          "SELECT package_key AS k,manifest_sha256 AS digest,user_id AS owner FROM sky_tool_packages WHERE status='verified' ORDER BY published_at DESC LIMIT 100",
        )
        .all<{ k: string; digest: string; owner: string }>();
      const releases = [];
      for (const r of rows.results) {
        try {
          const { manifest } = await authorizedNoahRelease(
            deps,
            r.owner,
            r.k,
            r.digest,
            true,
          );
          if (manifest.pricing.model === 'free')
            releases.push({
              id: 'release-' + r.digest,
              name: manifest.name,
              summary: manifest.summary,
              version: manifest.version,
              author: manifest.developer.displayName,
              kind: 'release',
              model: manifest.source.artifact!.runtime!.model,
            });
        } catch (e) {
          if (
            !(e instanceof NoahAgentError) ||
            ![403, 404, 409, 422].includes(e.status)
          )
            throw e;
        }
      }
      return [
        ...releases,
        ...Object.entries(RECIPES).map(([id, r]) => ({
          id,
          name: r.name,
          summary: r.capability,
          version: r.version,
          kind: 'catalog',
          model: modelFor(r),
        })),
      ];
    },
    async overview(owner: string) {
      await expire(owner);
      const devices = await db
        .prepare(
          'SELECT * FROM noah_runner_devices WHERE owner_id=? ORDER BY created_at DESC LIMIT 20',
        )
        .bind(owner)
        .all<Device>();
      const commands = await db
        .prepare(
          'SELECT * FROM noah_runner_commands WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
        )
        .bind(owner)
        .all<Command>();
      return {
        ownerScope: await ownerScopeFor(owner),
        canReview: deps.reviewers?.includes(owner) ?? false,
        devices: devices.results.map((d) => presentDevice(d, now())),
        commands: commands.results.map((c) => ({
          ...present(c),
          currentBoot: devices.results.some(
            (d) =>
              d.id === c.device_id && d.boot_id === c.boot_id && !d.revoked_at,
          ),
        })),
        uploadedAgents: (await noahAgentStore(db, owner).list()).map((a) => ({
          id: a.id,
          name: a.manifest.name,
          summary: a.manifest.summary,
          version: a.manifest.version,
          model: a.manifest.runtime?.model ?? 'none',
          kind: 'upload',
          ready: a.uploadState === 'ready' && Boolean(a.manifest.runtime),
        })),
        instances: await instances.list(owner),
        jobs: (await jobs.listNoah(owner)).map((j) => ({
          ...j,
          noahExecution: j.noahExecution
            ? { ...j.noahExecution, claimSha256: undefined }
            : undefined,
        })),
      };
    },
    async enroll(
      owner: string,
      credential: string,
      input: { bootId: string; name: string; platform: string },
    ) {
      const boot = noahUploadId(input.bootId),
        name = text(input.name, 64);
      if (input.platform !== 'darwin-arm64')
        throw new NoahAgentError(
          '初期版はApple Silicon Macに対応しています。',
          422,
        );
      const digest = await noahDigest(credential),
        id = crypto.randomUUID();
      await db
        .prepare(`INSERT INTO noah_runner_devices(id,owner_id,credential_sha256,boot_id,name,platform,created_at,last_seen_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM noah_runner_devices WHERE owner_id=? AND revoked_at IS NULL)<10
        ON CONFLICT(credential_sha256) DO UPDATE SET boot_id=excluded.boot_id,name=excluded.name,last_seen_at=excluded.last_seen_at WHERE owner_id=excluded.owner_id AND revoked_at IS NULL`)
        .bind(
          id,
          owner,
          digest,
          boot,
          name,
          input.platform,
          now(),
          now(),
          owner,
        )
        .run();
      const d = await db
        .prepare(
          'SELECT * FROM noah_runner_devices WHERE owner_id=? AND credential_sha256=? AND revoked_at IS NULL',
        )
        .bind(owner, digest)
        .first<Device>();
      if (!d || d.boot_id !== boot)
        throw new NoahAgentError(
          'Macの接続上限または解除済みの認証です。',
          409,
        );
      await db
        .prepare(
          "UPDATE noah_runner_commands SET state=CASE WHEN state='queued' THEN 'cancelled' ELSE 'unknown' END,updated_at=? WHERE device_id=? AND boot_id<>? AND state IN ('queued','claimed')",
        )
        .bind(now(), d.id, boot)
        .run();
      await reconcileUnknown(owner);
      return {
        device: presentDevice(d, now()),
        ownerScope: await ownerScopeFor(owner),
      };
    },
    async enqueue(
      owner: string,
      input: {
        id: string;
        deviceId: string;
        action: string;
        agentId?: string;
        connectionId?: string;
        prompt?: string;
        consent?: string;
      },
    ) {
      const id = noahUploadId(input.id),
        d = await device(owner, input.deviceId);
      if (!d || d.last_seen_at <= now() - LEASE)
        throw new NoahAgentError(
          'MacのNoah Runnerを起動・接続してください。',
          409,
        );
      const requestDigest = await hash(input),
        old = await command(owner, id);
      if (old) {
        if (old.request_sha256 !== requestDigest)
          throw new NoahAgentError('同じ操作IDの内容は変更できません。', 409);
        return present(old);
      }
      let payload: Payload;
      if (input.action === 'connect') {
        const pin = await resolveNoahPin(deps, owner, text(input.agentId, 100));
        if (pin.kind === 'invite')
          throw new NoahAgentError('この配布方式は対象外です。', 422);
        payload = { pin };
      } else if (input.action === 'run') {
        const c = await command(owner, text(input.connectionId, 36));
        if (
          !c ||
          c.kind !== 'connect' ||
          c.state !== 'succeeded' ||
          c.stop_requested ||
          c.device_id !== d.id ||
          c.boot_id !== d.boot_id
        )
          throw new NoahAgentError('このMacでAgentに接続してください。', 409);
        const pin = (JSON.parse(c.payload) as Payload).pin;
        await samePin(owner, pin);
        const prompt = text(input.prompt, LIMITS.inputBytes);
        if (new TextEncoder().encode(prompt).length > LIMITS.inputBytes)
          throw new NoahAgentError('依頼が長すぎます。', 413);
        if (
          recipeFor(pin.agentId)?.provider &&
          input.consent !== 'codex-account/1'
        )
          throw new NoahAgentError(
            '本人のCodexへ依頼を送信することを確認してください。',
            403,
          );
        payload = {
          pin,
          connectionId: c.id,
          prompt,
          ...(input.consent ? { consent: input.consent } : {}),
        };
      } else throw new NoahAgentError('操作を確認してください。');
      const result = await db
        .prepare(`INSERT OR IGNORE INTO noah_runner_commands(id,owner_id,device_id,boot_id,kind,state,request_sha256,payload,created_at,updated_at)
        SELECT ?,?,?,?,?,'queued',?,?,?,? WHERE (SELECT COUNT(*) FROM noah_runner_commands WHERE owner_id=? AND state IN ('queued','claimed'))<8 RETURNING *`)
        .bind(
          id,
          owner,
          d.id,
          d.boot_id,
          input.action,
          requestDigest,
          JSON.stringify(payload),
          now(),
          now(),
          owner,
        )
        .all<Command>();
      if (!result.results[0])
        throw new NoahAgentError('処理上限か操作IDの競合です。', 409);
      return present(result.results[0]);
    },
    async stop(owner: string, id: string) {
      const c = await command(owner, id);
      if (!c) throw new NoahAgentError('処理が見つかりません。', 404);
      await db
        .prepare(
          "UPDATE noah_runner_commands SET stop_requested=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,updated_at=? WHERE id=? AND owner_id=?",
        )
        .bind(now(), id, owner)
        .run();
      return present((await command(owner, id))!);
    },
    async revoke(owner: string, id: string) {
      if (!(await device(owner, id)))
        throw new NoahAgentError('Macが見つかりません。', 404);
      await db
        .prepare(
          'UPDATE noah_runner_devices SET revoked_at=? WHERE id=? AND owner_id=?',
        )
        .bind(now(), id, owner)
        .run();
      await db
        .prepare(
          "UPDATE noah_runner_commands SET stop_requested=1,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END WHERE device_id=? AND owner_id=?",
        )
        .bind(id, owner)
        .run();
      return { revoked: true };
    },
    async poll(
      owner: string,
      credential: string,
      input: { deviceId: string; bootId: string },
    ) {
      const d = await runner(owner, credential, input.deviceId, input.bootId);
      await expire(owner);
      const lease =
        crypto.randomUUID().replaceAll('-', '') +
        crypto.randomUUID().replaceAll('-', '');
      const rows = await db
        .prepare(`UPDATE noah_runner_commands SET state='claimed',lease_sha256=?,lease_until=?,updated_at=? WHERE id=(
        SELECT id FROM noah_runner_commands WHERE device_id=? AND owner_id=? AND boot_id=? AND state='queued' AND stop_requested=0
        AND NOT EXISTS(SELECT 1 FROM noah_runner_commands WHERE device_id=? AND state='claimed') ORDER BY created_at,id LIMIT 1) RETURNING *`)
        .bind(
          await noahDigest(lease),
          now() + LEASE,
          now(),
          d.id,
          owner,
          d.boot_id,
          d.id,
        )
        .all<Command>();
      const connected = await db
        .prepare(
          "SELECT * FROM noah_runner_commands WHERE device_id=? AND owner_id=? AND boot_id=? AND kind='connect' AND state='succeeded'",
        )
        .bind(d.id, owner, d.boot_id)
        .all<Command>();
      const disconnect: string[] = [];
      for (const c of connected.results) {
        let valid = !c.stop_requested;
        if (valid) {
          try {
            await samePin(owner, (JSON.parse(c.payload) as Payload).pin);
          } catch {
            valid = false;
          }
        }
        if (!valid) {
          disconnect.push(c.id);
          await db
            .prepare(
              'UPDATE noah_runner_commands SET stop_requested=1 WHERE id=? AND owner_id=?',
            )
            .bind(c.id, owner)
            .run();
        }
      }
      const c = rows.results[0];
      return {
        command: c
          ? { ...present(c), payload: JSON.parse(c.payload), lease }
          : null,
        disconnect,
        leaseMs: LEASE,
      };
    },
    async disconnected(
      owner: string,
      credential: string,
      input: { deviceId: string; bootId: string; id: string },
    ) {
      const d = await runner(owner, credential, input.deviceId, input.bootId),
        c = await command(owner, input.id);
      if (
        !c ||
        c.device_id !== d.id ||
        c.boot_id !== d.boot_id ||
        c.kind !== 'connect' ||
        !c.stop_requested
      )
        throw new NoahAgentError('停止する接続を確認してください。', 409);
      const active = await db
        .prepare(
          "SELECT id FROM noah_runner_commands WHERE device_id=? AND owner_id=? AND kind='run' AND state='claimed' AND json_extract(payload,'$.connectionId')=?",
        )
        .bind(d.id, owner, c.id)
        .first();
      if (active)
        throw new NoahAgentError('仕事の終了報告を先に確認してください。', 409);
      await db
        .prepare(
          "UPDATE noah_runner_commands SET state='cancelled',updated_at=? WHERE id=? AND owner_id=? AND state='succeeded'",
        )
        .bind(now(), c.id, owner)
        .run();
      return { stopped: true };
    },
    async heartbeat(
      owner: string,
      credential: string,
      input: { deviceId: string; bootId: string; id?: string; lease?: string },
    ) {
      const d = await runner(owner, credential, input.deviceId, input.bootId);
      if (!input.id) return { ok: true };
      const c = await checkedLease(owner, input.id, input.lease ?? '', d),
        p = JSON.parse(c.payload) as Payload;
      let allowed = true;
      try {
        await samePin(owner, p.pin);
      } catch {
        allowed = false;
      }
      if (p.connectionId) {
        const connection = await command(owner, p.connectionId);
        if (
          !connection ||
          connection.stop_requested ||
          connection.state !== 'succeeded'
        )
          allowed = false;
      }
      await db
        .prepare(
          "UPDATE noah_runner_commands SET lease_until=?,updated_at=? WHERE id=? AND state='claimed' AND lease_sha256=? AND lease_until>?",
        )
        .bind(now() + LEASE, now(), c.id, c.lease_sha256, now())
        .run();
      return { stop: !allowed || Boolean(c.stop_requested), leaseMs: LEASE };
    },
    async start(
      owner: string,
      credential: string,
      input: { deviceId: string; bootId: string; id: string; lease: string },
    ) {
      const d = await runner(owner, credential, input.deviceId, input.bootId),
        c = await checkedLease(owner, input.id, input.lease, d),
        p = JSON.parse(c.payload) as Payload;
      if (c.kind !== 'run' || c.stop_requested)
        throw new NoahAgentError('実行要求は停止しています。', 409);
      const connected = await command(owner, p.connectionId!);
      if (
        !connected ||
        connected.stop_requested ||
        connected.state !== 'succeeded'
      )
        throw new NoahAgentError('接続が停止しています。', 409);
      const b = await binding(
        owner,
        p.pin,
        JSON.parse(connected.result!),
        p.prompt!,
        input.lease,
      );
      const existing = await jobs.get(owner, c.id);
      if (existing) {
        if (
          existing.noahExecution?.claimSha256 !==
            (await noahDigest(input.lease)) ||
          existing.noahExecution.state !== 'queued'
        )
          throw new NoahAgentError(
            'この仕事は実行済みか結果不明です。再実行できません。',
            409,
          );
      }
      const job =
        existing ?? (await jobs.create(owner, await createNoahWork(c.id, b)));
      if (!job) throw new NoahAgentError('仕事を保存できません。', 409);
      await validateNoahExecutionSource(deps, owner, job.noahExecution!);
      const running = await updateNoahWork(job, {
        action: 'start',
        claim: input.lease,
      });
      if (!(await jobs.update(owner, running, job.revision)))
        throw new NoahAgentError('仕事が更新されています。', 409);
      return { started: true };
    },
    async finish(
      owner: string,
      credential: string,
      input: {
        deviceId: string;
        bootId: string;
        id: string;
        lease: string;
        state: string;
        execution?: Partial<NoahExecution>;
        result?: NoahExecution['result'];
        calls?: number;
        error?: string;
      },
    ) {
      const d = await runner(owner, credential, input.deviceId, input.bootId),
        c = await checkedLease(owner, input.id, input.lease, d, true),
        p = JSON.parse(c.payload) as Payload;
      if (
        !['succeeded', 'failed', 'cancelled', 'unknown'].includes(input.state)
      )
        throw new NoahAgentError('完了状態を確認してください。');
      if (c.state !== 'claimed') {
        if (c.state === input.state) return present(c);
        throw new NoahAgentError('処理は既に確定済みまたは結果不明です。', 409);
      }
      if (c.lease_until <= now())
        throw new NoahAgentError('期限後の結果は採用できません。', 409);
      let result: unknown = {
        message:
          typeof input.error === 'string' ? input.error.slice(0, 240) : '',
      };
      if (c.kind === 'connect' && input.state === 'succeeded') {
        if (c.stop_requested)
          throw new NoahAgentError('接続は停止済みです。', 409);
        const e = input.execution ?? {};
        const b = await binding(
          owner,
          p.pin,
          e,
          'connection-validation',
          input.lease,
        );
        await createNoahWork(crypto.randomUUID(), b);
        result = {
          image: b.image,
          modelSha256: b.modelSha256,
          provider: b.provider,
        };
        const candidates = await instances.candidates(owner, p.pin.agentId),
          instance = candidates.instance;
        const claim = await noahDigest(input.lease),
          instanceId = instance?.id ?? crypto.randomUUID();
        await instances.prepare(owner, {
          id: instanceId,
          revision: instance?.revision ?? 0,
          commandId: c.id,
          agentId: p.pin.agentId,
          digest: p.pin.digest,
          claimSha256: await hash(claim),
          replacePending: false,
        });
        await instances.finish(owner, {
          id: instanceId,
          commandId: c.id,
          claim,
          state: 'selected',
        });
        await db
          .prepare(
            "UPDATE noah_runner_commands SET stop_requested=1 WHERE owner_id=? AND device_id=? AND boot_id=? AND kind='connect' AND state='succeeded' AND json_extract(payload,'$.pin.agentId')=? AND id<>?",
          )
          .bind(owner, d.id, d.boot_id, p.pin.agentId, c.id)
          .run();
      }
      if (c.kind === 'run') {
        const job = await jobs.get(owner, c.id);
        if (job && ['queued', 'running'].includes(job.noahExecution!.state)) {
          if (input.state === 'succeeded') {
            await samePin(owner, p.pin);
            const parent = await command(owner, p.connectionId!);
            if (c.stop_requested || !parent || parent.stop_requested)
              throw new NoahAgentError(
                '停止要求後の成果は採用できません。',
                409,
              );
          }
          const next = await updateNoahWork(job, {
            action: 'finish',
            claim: input.lease,
            state:
              input.state === 'succeeded'
                ? 'returned'
                : (input.state as 'failed' | 'cancelled' | 'unknown'),
            result: input.result,
            calls: input.calls ?? 0,
            error: input.error,
          });
          if (!(await jobs.update(owner, next, job.revision)))
            throw new NoahAgentError(
              '仕事が更新されています。再確認してください。',
              409,
            );
        } else if (!job && input.state === 'succeeded')
          throw new NoahAgentError('実行開始の記録がありません。', 409);
        result = { workId: c.id };
      }
      const updated = await db
        .prepare(
          "UPDATE noah_runner_commands SET state=?,result=?,updated_at=? WHERE id=? AND owner_id=? AND state='claimed' AND lease_sha256=? AND lease_until>? RETURNING *",
        )
        .bind(
          input.state,
          JSON.stringify(result),
          now(),
          c.id,
          owner,
          c.lease_sha256,
          now(),
        )
        .all<Command>();
      if (!updated.results[0])
        throw new NoahAgentError('完了記録が競合しました。', 409);
      return present(updated.results[0]);
    },
  };
}

export function createNoahLaunchApi(deps: Deps) {
  const service = createNoahLaunchService(deps);
  return async (request: Request, isRunner = false) => {
    try {
      if (
        request.method === 'GET' &&
        !isRunner &&
        new URL(request.url).searchParams.get('public') === '1'
      )
        return json({ agents: await service.catalog() });
      const owner = await deps.authenticate(request);
      if (request.method === 'GET' && !isRunner)
        return json(await service.overview(owner));
      if (request.method !== 'POST')
        return json({ error: '対応しない操作です。' }, 405);
      if (
        request.headers.get('content-type')?.split(';')[0] !==
        'application/json'
      )
        throw new NoahAgentError('JSONで指定してください。', 415);
      const input = JSON.parse(
        new TextDecoder().decode(await boundedNoahBody(request, 160000)),
      );
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new NoahAgentError('入力を確認してください。');
      if (isRunner) {
        const credential = request.headers
          .get('authorization')
          ?.match(/^Bearer (rock_session_[A-Za-z0-9_-]{43})$/)?.[1];
        if (!credential || request.headers.get('origin'))
          throw new NoahAgentError('Mac Runnerの本人認証が必要です。', 403);
        if (
          ![
            'enroll',
            'poll',
            'heartbeat',
            'start',
            'finish',
            'disconnected',
          ].includes(input.action)
        )
          throw new NoahAgentError('実行器の操作を確認してください。');
        const method = input.action as
          | 'enroll'
          | 'poll'
          | 'heartbeat'
          | 'start'
          | 'finish'
          | 'disconnected';
        return json(await service[method](owner, credential, input));
      }
      if (request.headers.get('origin') !== new URL(request.url).origin)
        throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (
        request.headers.get('x-rock-owner-scope') !==
        (await ownerScopeFor(owner))
      )
        throw new NoahAgentError('アカウントが変わりました。', 409);
      if (input.action === 'stop')
        return json(await service.stop(owner, input.id));
      if (input.action === 'revoke')
        return json(await service.revoke(owner, input.id));
      return json(await service.enqueue(owner, input), 202);
    } catch (e) {
      const status =
        e instanceof NoahAgentError || e instanceof NoahExecutionError
          ? e.status
          : e instanceof Error && e.message === 'UNAUTHORIZED'
            ? 401
            : e instanceof SyntaxError
              ? 400
              : 503;
      return json(
        {
          error:
            e instanceof NoahAgentError || e instanceof NoahExecutionError
              ? e.message
              : status === 401
                ? 'サインインしてください。'
                : 'Noahの処理を確認できません。',
        },
        status,
      );
    }
  };
}
