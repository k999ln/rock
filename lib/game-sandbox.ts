// Minimal non-financial particle sandbox for the avocadoMini game entrance.
// Scope: integrated_design.md §03 / GAME01 minimum operations (select, hold/move,
// release, collide/bond, separate, undo, pause time, save and resume) as a
// deterministic 2D host/fixture model. It is not the R5 naked-eye spatial
// display, not precise 3D input, and carries no money, purchase or exchange.
import { WorkError, objectInput, workId } from './workflow.ts';
import { materialDigest } from './material-invention.ts';

// Rules are version-fixed (§15): time step, mass, velocity, radius, restitution
// and bond condition. Changing any value requires a new rules id.
export const GAME_SANDBOX_RULES = Object.freeze({
  id: 'rock-particle-sandbox-rules/1',
  dimensions: 2,
  world: Object.freeze({ width: 1000, height: 1000 }),
  tickDt: 1,
  maxParticles: 64,
  maxTicksPerStep: 600,
  maxSubsteps: 64,
  maxHistory: 32,
  maxCommandLog: 256,
  massMin: 1,
  massMax: 100,
  radiusMin: 10,
  radiusMax: 50,
  speedMax: 200,
  restitution: 1,
  bondMaxRelativeSpeed: 4,
  bondableTagPairs: Object.freeze([Object.freeze(['a', 'b'])]),
  tags: Object.freeze(['a', 'b', 'c']),
});

export const GAME_SANDBOX_SAVE_FORMAT = 'rock-particle-sandbox-save' as const;
export const GAME_SANDBOX_SAVE_VERSION = 1 as const;

type Tag = 'a' | 'b' | 'c';
export type SandboxParticle = {
  id: string;
  tag: Tag;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
};
export type SandboxHold = {
  particleId: string;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
};
type SandboxCore = {
  tick: number;
  paused: boolean;
  particles: SandboxParticle[];
  bonds: [string, string][];
  selection: string | null;
  hold: SandboxHold | null;
};
export type SandboxState = SandboxCore & {
  rules: typeof GAME_SANDBOX_RULES.id;
  title: string;
  author: string;
  seed: number;
  revision: number;
  history: SandboxCore[];
  commands: { id: string; command: string }[];
};
export type SandboxCommand =
  | { id: string; action: 'select'; particleId: string }
  | { id: string; action: 'hold' }
  | { id: string; action: 'move'; x: number; y: number }
  | { id: string; action: 'release' }
  | { id: string; action: 'cancel_hold' }
  | { id: string; action: 'tracking_lost' }
  | { id: string; action: 'separate'; a: string; b: string }
  | { id: string; action: 'pause' }
  | { id: string; action: 'resume' }
  | { id: string; action: 'step'; ticks: number }
  | { id: string; action: 'undo' };

const R = GAME_SANDBOX_RULES;
const fail = (message: string, status = 400): never => {
  throw new WorkError(message, status);
};
const particleIdPattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;

function text(value: unknown, max: number, label: string) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32)
  )
    fail(`${label}を確認してください（${max}文字まで）。`);
  return (value as string).trim();
}
function finite(value: unknown, min: number, max: number, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${label}の値が不正です。`);
  return value as number;
}
function integer(value: unknown, min: number, max: number, label: string) {
  if (!Number.isInteger(value)) fail(`${label}は整数で指定してください。`);
  return finite(value, min, max, label);
}
function particleId(value: unknown) {
  if (typeof value !== 'string' || !particleIdPattern.test(value))
    fail('粒子IDが不正です。');
  return value as string;
}

// Deterministic PRNG (mulberry32) so the same seed and rules reproduce a stage.
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validateParticle(value: unknown): SandboxParticle {
  const input = objectInput(value, [
    'id',
    'tag',
    'x',
    'y',
    'vx',
    'vy',
    'mass',
    'radius',
  ]);
  if (
    typeof input.tag !== 'string' ||
    !(R.tags as readonly string[]).includes(input.tag)
  )
    fail('粒子の材料タグが不正です。');
  const radius = finite(input.radius, R.radiusMin, R.radiusMax, '半径');
  return {
    id: particleId(input.id),
    tag: input.tag as Tag,
    x: finite(input.x, radius, R.world.width - radius, '位置x'),
    y: finite(input.y, radius, R.world.height - radius, '位置y'),
    vx: finite(input.vx, -R.speedMax, R.speedMax, '速度x'),
    vy: finite(input.vy, -R.speedMax, R.speedMax, '速度y'),
    mass: finite(input.mass, R.massMin, R.massMax, '質量'),
    radius,
  };
}

function overlaps(a: SandboxParticle, b: SandboxParticle) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.radius + b.radius;
  return dx * dx + dy * dy < reach * reach;
}

// Union of bonded particles. Members of one group always share one velocity.
function groups(core: SandboxCore) {
  const parent = new Map(core.particles.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  for (const [a, b] of core.bonds) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const byRoot = new Map<string, SandboxParticle[]>();
  for (const p of core.particles) {
    const root = find(p.id);
    byRoot.set(root, [...(byRoot.get(root) ?? []), p]);
  }
  return { find, members: (id: string) => byRoot.get(find(id)) ?? [] };
}

function validateCore(value: unknown): SandboxCore {
  const input = objectInput(value, [
    'tick',
    'paused',
    'particles',
    'bonds',
    'selection',
    'hold',
  ]);
  if (
    !Array.isArray(input.particles) ||
    input.particles.length < 1 ||
    input.particles.length > R.maxParticles
  )
    fail(`粒子は1〜${R.maxParticles}個にしてください。`);
  const particles = (input.particles as unknown[]).map(validateParticle);
  for (let i = 1; i < particles.length; i += 1)
    if (particles[i - 1].id >= particles[i].id)
      fail('粒子IDは重複なしの昇順で保存してください。');
  const ids = new Set(particles.map((p) => p.id));
  if (!Array.isArray(input.bonds) || input.bonds.length > R.maxParticles * 4)
    fail('結合の形式が不正です。');
  const bonds = (input.bonds as unknown[]).map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2)
      fail('結合の形式が不正です。');
    const [a, b] = (pair as unknown[]).map(particleId);
    if (!ids.has(a) || !ids.has(b) || a >= b) fail('結合の対象が不正です。');
    return [a, b] as [string, string];
  });
  for (let i = 1; i < bonds.length; i += 1)
    if (bonds[i - 1].join('\u0000') >= bonds[i].join('\u0000'))
      fail('結合は重複なしの昇順で保存してください。');
  if (typeof input.paused !== 'boolean') fail('時間停止の状態が不正です。');
  const selection =
    input.selection === null ? null : particleId(input.selection);
  if (selection !== null && !ids.has(selection)) fail('選択対象がありません。');
  let hold: SandboxHold | null = null;
  if (input.hold !== null) {
    const h = objectInput(input.hold, [
      'particleId',
      'originX',
      'originY',
      'vx',
      'vy',
    ]);
    hold = {
      particleId: particleId(h.particleId),
      originX: finite(h.originX, 0, R.world.width, '保持元x'),
      originY: finite(h.originY, 0, R.world.height, '保持元y'),
      vx: finite(h.vx, -R.speedMax, R.speedMax, '保持前速度x'),
      vy: finite(h.vy, -R.speedMax, R.speedMax, '保持前速度y'),
    };
    if (hold.particleId !== selection)
      fail('保持対象と選択対象が一致しません。');
  }
  const core: SandboxCore = {
    tick: integer(input.tick, 0, Number.MAX_SAFE_INTEGER, '時刻'),
    paused: input.paused as boolean,
    particles,
    bonds,
    selection,
    hold,
  };
  const g = groups(core);
  for (const p of particles)
    for (const m of g.members(p.id))
      if (m.vx !== p.vx || m.vy !== p.vy)
        fail('結合した粒子の速度が一致しません。');
  return core;
}

function copyCore(core: SandboxCore): SandboxCore {
  return {
    tick: core.tick,
    paused: core.paused,
    particles: core.particles.map((p) => ({ ...p })),
    bonds: core.bonds.map(([a, b]) => [a, b] as [string, string]),
    selection: core.selection,
    hold: core.hold ? { ...core.hold } : null,
  };
}
function coreOf(state: SandboxState): SandboxCore {
  return copyCore(state);
}

export function createSandbox(value: unknown): SandboxState {
  const input = objectInput(value, [
    'title',
    'author',
    'seed',
    'count',
    'particles',
  ]);
  const seed = integer(input.seed, 0, 0xffffffff, '乱数種');
  let particles: SandboxParticle[];
  if (input.particles !== undefined) {
    if (input.count !== undefined)
      fail('countとparticlesは同時に指定できません。');
    if (!Array.isArray(input.particles)) fail('粒子の形式が不正です。');
    particles = (input.particles as unknown[])
      .map(validateParticle)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  } else {
    const count = integer(input.count, 1, R.maxParticles, '粒子数');
    const next = random(seed);
    const columns = 8;
    const cell = R.world.width / columns;
    particles = Array.from({ length: count }, (_, index) => ({
      id: `p${String(index + 1).padStart(2, '0')}`,
      tag: R.tags[index % 2] as Tag,
      x: cell * ((index % columns) + 0.5) + Math.floor(next() * 21) - 10,
      y:
        cell * (Math.floor(index / columns) + 0.5) +
        Math.floor(next() * 21) -
        10,
      vx: Math.floor(next() * 7) - 3,
      vy: Math.floor(next() * 7) - 3,
      mass: 1 + Math.floor(next() * 3),
      radius: 20,
    }));
  }
  const core = validateCore({
    tick: 0,
    paused: false,
    particles,
    bonds: [],
    selection: null,
    hold: null,
  });
  for (let i = 0; i < core.particles.length; i += 1)
    for (let j = i + 1; j < core.particles.length; j += 1)
      if (overlaps(core.particles[i], core.particles[j]))
        fail('初期配置で粒子が重なっています。');
  return {
    rules: R.id,
    title: text(input.title, 120, '作品名'),
    author: text(input.author, 80, '作者'),
    seed,
    revision: 0,
    ...core,
    history: [],
    commands: [],
  };
}

export function parseSandboxCommand(value: unknown): SandboxCommand {
  const base = objectInput(value, [
    'id',
    'action',
    'particleId',
    'x',
    'y',
    'a',
    'b',
    'ticks',
  ]);
  const id = workId(base.id);
  switch (base.action) {
    case 'select':
      objectInput(value, ['id', 'action', 'particleId']);
      return { id, action: 'select', particleId: particleId(base.particleId) };
    case 'move':
      objectInput(value, ['id', 'action', 'x', 'y']);
      return {
        id,
        action: 'move',
        x: finite(base.x, 0, R.world.width, '移動先x'),
        y: finite(base.y, 0, R.world.height, '移動先y'),
      };
    case 'separate': {
      objectInput(value, ['id', 'action', 'a', 'b']);
      const [a, b] = [particleId(base.a), particleId(base.b)].sort();
      return { id, action: 'separate', a, b };
    }
    case 'step':
      objectInput(value, ['id', 'action', 'ticks']);
      return {
        id,
        action: 'step',
        ticks: integer(base.ticks, 1, R.maxTicksPerStep, '進める時間'),
      };
    case 'hold':
    case 'release':
    case 'cancel_hold':
    case 'tracking_lost':
    case 'pause':
    case 'resume':
    case 'undo':
      objectInput(value, ['id', 'action']);
      return { id, action: base.action };
    default:
      return fail('操作を確認してください。');
  }
}

function setGroup(
  members: SandboxParticle[],
  vx: number,
  vy: number,
  dx = 0,
  dy = 0,
) {
  for (const m of members) {
    m.vx = vx;
    m.vy = vy;
    m.x += dx;
    m.y += dy;
  }
}

function placementAllowed(core: SandboxCore, moved: SandboxParticle[]) {
  const ids = new Set(moved.map((m) => m.id));
  return moved.every(
    (m) =>
      m.x >= m.radius &&
      m.x <= R.world.width - m.radius &&
      m.y >= m.radius &&
      m.y <= R.world.height - m.radius &&
      core.particles.every((o) => ids.has(o.id) || !overlaps(m, o)),
  );
}

function bondable(a: SandboxParticle, b: SandboxParticle) {
  return R.bondableTagPairs.some(
    ([x, y]) => (a.tag === x && b.tag === y) || (a.tag === y && b.tag === x),
  );
}

// One tick split into equal substeps so no particle crosses more than half of
// the smallest radius per substep (no tunnelling). Overload stops the command.
function advance(core: SandboxCore) {
  const heldGroup = core.hold
    ? new Set(
        groups(core)
          .members(core.hold.particleId)
          .map((p) => p.id),
      )
    : new Set<string>();
  let vmax = 0;
  for (const p of core.particles)
    vmax = Math.max(vmax, Math.abs(p.vx), Math.abs(p.vy));
  const substeps = Math.max(1, Math.ceil((4 * vmax * R.tickDt) / R.radiusMin));
  if (substeps > R.maxSubsteps)
    fail('計算過負荷のため停止しました。速度を下げてください。', 409);
  const h = R.tickDt / substeps;
  for (let s = 0; s < substeps; s += 1) {
    for (const p of core.particles)
      if (!heldGroup.has(p.id)) {
        p.x += p.vx * h;
        p.y += p.vy * h;
      }
    let g = groups(core);
    // Walls reflect the whole group once per substep.
    const done = new Set<string>();
    for (const p of core.particles) {
      const root = g.find(p.id);
      if (heldGroup.has(p.id) || done.has(root)) continue;
      done.add(root);
      const members = g.members(p.id);
      let { vx, vy } = p;
      if (members.some((m) => m.x - m.radius < 0) && vx < 0) vx = -vx;
      if (members.some((m) => m.x + m.radius > R.world.width) && vx > 0)
        vx = -vx;
      if (members.some((m) => m.y - m.radius < 0) && vy < 0) vy = -vy;
      if (members.some((m) => m.y + m.radius > R.world.height) && vy > 0)
        vy = -vy;
      setGroup(members, vx, vy);
    }
    for (let i = 0; i < core.particles.length; i += 1)
      for (let j = i + 1; j < core.particles.length; j += 1) {
        const p = core.particles[i];
        const q = core.particles[j];
        if (g.find(p.id) === g.find(q.id) || !overlaps(p, q)) continue;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const approach = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if (approach >= 0) continue;
        const gp = g.members(p.id);
        const gq = g.members(q.id);
        const pHeld = heldGroup.has(p.id);
        const qHeld = heldGroup.has(q.id);
        if (pHeld || qHeld) {
          // A held group is kinematic: the other group reflects off it.
          const [moving, sign] = pHeld ? [gq, -1] : [gp, 1];
          const v = moving[0];
          const vn = (v.vx * nx + v.vy * ny) * sign;
          if (vn < 0)
            setGroup(
              moving,
              v.vx - (1 + R.restitution) * vn * nx * sign,
              v.vy - (1 + R.restitution) * vn * ny * sign,
            );
          continue;
        }
        const mp = gp.reduce((sum, m) => sum + m.mass, 0);
        const mq = gq.reduce((sum, m) => sum + m.mass, 0);
        const relative = Math.sqrt(
          (p.vx - q.vx) * (p.vx - q.vx) + (p.vy - q.vy) * (p.vy - q.vy),
        );
        if (bondable(p, q) && relative <= R.bondMaxRelativeSpeed) {
          // Perfectly inelastic bond: total mass and momentum are conserved.
          const vx = (mp * p.vx + mq * q.vx) / (mp + mq);
          const vy = (mp * p.vy + mq * q.vy) / (mp + mq);
          setGroup([...gp, ...gq], vx, vy);
          core.bonds = [...core.bonds, [p.id, q.id] as [string, string]].sort(
            (x, y) => (x.join('\u0000') < y.join('\u0000') ? -1 : 1),
          );
          g = groups(core);
          continue;
        }
        const impulse = (-(1 + R.restitution) * approach) / (1 / mp + 1 / mq);
        setGroup(gp, p.vx + (impulse * nx) / mp, p.vy + (impulse * ny) / mp);
        setGroup(gq, q.vx - (impulse * nx) / mq, q.vy - (impulse * ny) / mq);
      }
  }
  for (const p of core.particles)
    if (
      Math.abs(p.vx) > R.speedMax ||
      Math.abs(p.vy) > R.speedMax ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    )
      fail('計算結果が規則の範囲外のため停止しました。', 409);
  // Shift each group rigidly back inside the world after wall contact, so a
  // saved state always satisfies the load-time bounds and bonds keep shape.
  const g = groups(core);
  const shifted = new Set<string>();
  for (const p of core.particles) {
    const root = g.find(p.id);
    if (shifted.has(root)) continue;
    shifted.add(root);
    const members = g.members(p.id);
    const shift = (low: number, high: number) =>
      low > 0 ? low : high < 0 ? high : 0;
    const dx = shift(
      Math.max(...members.map((m) => m.radius - m.x)),
      Math.min(...members.map((m) => R.world.width - m.radius - m.x)),
    );
    const dy = shift(
      Math.max(...members.map((m) => m.radius - m.y)),
      Math.min(...members.map((m) => R.world.height - m.radius - m.y)),
    );
    for (const m of members) {
      m.x += dx;
      m.y += dy;
    }
  }
  core.tick += 1;
}

function mutate(core: SandboxCore, command: SandboxCommand) {
  const find = (id: string) =>
    core.particles.find((p) => p.id === id) ?? fail('粒子がありません。', 404);
  switch (command.action) {
    case 'select':
      if (core.hold)
        fail('保持中は選択を変えられません。放すか取消してください。', 409);
      find(command.particleId);
      core.selection = command.particleId;
      return;
    case 'hold': {
      if (!core.selection) fail('先に粒子を選択してください。', 409);
      if (core.hold) fail('すでに保持しています。', 409);
      const p = find(core.selection as string);
      core.hold = {
        particleId: p.id,
        originX: p.x,
        originY: p.y,
        vx: p.vx,
        vy: p.vy,
      };
      setGroup(groups(core).members(p.id), 0, 0);
      return;
    }
    case 'move': {
      if (!core.hold) fail('保持中だけ移動できます。', 409);
      const hold = core.hold as SandboxHold;
      const p = find(hold.particleId);
      const members = groups(core).members(p.id);
      const moved = members.map((m) => ({
        ...m,
        x: m.x + command.x - p.x,
        y: m.y + command.y - p.y,
      }));
      if (!placementAllowed(core, moved))
        fail('移動先が範囲外か、他の粒子と重なります。', 409);
      setGroup(members, 0, 0, command.x - p.x, command.y - p.y);
      return;
    }
    case 'release':
      if (!core.hold) fail('保持していません。', 409);
      core.hold = null;
      return;
    case 'cancel_hold': {
      if (!core.hold) fail('保持していません。', 409);
      const hold = core.hold as SandboxHold;
      const p = find(hold.particleId);
      const members = groups(core).members(p.id);
      const moved = members.map((m) => ({
        ...m,
        x: m.x + hold.originX - p.x,
        y: m.y + hold.originY - p.y,
      }));
      if (!placementAllowed(core, moved))
        fail(
          '元の位置に他の粒子があるため取消できません。放してください。',
          409,
        );
      setGroup(
        members,
        hold.vx,
        hold.vy,
        hold.originX - p.x,
        hold.originY - p.y,
      );
      core.hold = null;
      return;
    }
    case 'tracking_lost':
      // Never fling the particle: drop the hold where it is and pause time.
      core.hold = null;
      core.paused = true;
      return;
    case 'separate': {
      const before = core.bonds.length;
      core.bonds = core.bonds.filter(
        ([a, b]) => a !== command.a || b !== command.b,
      );
      if (core.bonds.length === before) fail('その結合はありません。', 404);
      return;
    }
    case 'pause':
      core.paused = true;
      return;
    case 'resume':
      core.paused = false;
      return;
    case 'step':
      if (core.paused)
        fail('時間が止まっています。再開してから進めてください。', 409);
      for (let t = 0; t < command.ticks; t += 1) advance(core);
      return;
    case 'undo':
      return;
  }
}

export function applySandboxCommand(
  state: SandboxState,
  value: unknown,
  revision: unknown,
): SandboxState {
  const command = parseSandboxCommand(value);
  const serialized = JSON.stringify(command);
  const duplicate = state.commands.find((item) => item.id === command.id);
  if (duplicate) {
    if (duplicate.command !== serialized)
      fail('同じ操作IDに異なる内容は適用できません。', 409);
    return state;
  }
  if (!Number.isInteger(revision) || revision !== state.revision)
    fail('別の操作で更新されています。再読込してください。', 409);
  const commands = [
    ...state.commands,
    { id: command.id, command: serialized },
  ].slice(-R.maxCommandLog);
  if (command.action === 'undo') {
    const previous =
      state.history.at(-1) ?? fail('取り消せる操作がありません。', 409);
    return {
      ...state,
      ...copyCore(previous),
      revision: state.revision + 1,
      history: state.history.slice(0, -1).map(copyCore),
      commands,
    };
  }
  const core = coreOf(state);
  mutate(core, command);
  return {
    ...state,
    ...core,
    revision: state.revision + 1,
    history: [...state.history.map(copyCore), coreOf(state)].slice(
      -R.maxHistory,
    ),
    commands,
  };
}

// Physical observables used by tests (§15 analytic checks).
export function sandboxMomentum(state: SandboxCore) {
  return state.particles.reduce(
    (sum, p) => ({ x: sum.x + p.mass * p.vx, y: sum.y + p.mass * p.vy }),
    { x: 0, y: 0 },
  );
}
export function sandboxKineticEnergy(state: SandboxCore) {
  return state.particles.reduce(
    (sum, p) => sum + 0.5 * p.mass * (p.vx * p.vx + p.vy * p.vy),
    0,
  );
}

function stateFields(state: SandboxState) {
  return {
    rules: state.rules,
    title: state.title,
    author: state.author,
    seed: state.seed,
    revision: state.revision,
    ...coreOf(state),
    history: state.history.map(copyCore),
    commands: state.commands.map((item) => ({ ...item })),
  };
}

export function sandboxDigest(state: SandboxState) {
  return materialDigest(stateFields(state));
}

export async function saveSandbox(state: SandboxState): Promise<string> {
  const payload = stateFields(state);
  return JSON.stringify({
    format: GAME_SANDBOX_SAVE_FORMAT,
    version: GAME_SANDBOX_SAVE_VERSION,
    rules: R.id,
    rulesDigest: await materialDigest(GAME_SANDBOX_RULES),
    digest: await materialDigest(payload),
    state: payload,
  });
}

export async function loadSandbox(raw: unknown): Promise<SandboxState> {
  if (typeof raw !== 'string' || raw.length > 4_000_000)
    fail('保存データを読み込めません。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw as string);
  } catch {
    return fail('保存データが壊れています。');
  }
  const envelope = objectInput(parsed, [
    'format',
    'version',
    'rules',
    'rulesDigest',
    'digest',
    'state',
  ]);
  if (envelope.format !== GAME_SANDBOX_SAVE_FORMAT)
    fail('粒子サンドボックスの保存データではありません。');
  if (envelope.version !== GAME_SANDBOX_SAVE_VERSION)
    fail(
      `保存形式の版が違います（対応版: ${GAME_SANDBOX_SAVE_VERSION}）。`,
      409,
    );
  if (
    envelope.rules !== R.id ||
    envelope.rulesDigest !== (await materialDigest(GAME_SANDBOX_RULES))
  )
    fail('ゲーム規則の版が違うため再開できません。', 409);
  if ((await materialDigest(envelope.state)) !== envelope.digest)
    fail('保存データの照合値が一致しません。');
  const input = objectInput(envelope.state, [
    'rules',
    'title',
    'author',
    'seed',
    'revision',
    'tick',
    'paused',
    'particles',
    'bonds',
    'selection',
    'hold',
    'history',
    'commands',
  ]);
  if (input.rules !== R.id)
    fail('ゲーム規則の版が違うため再開できません。', 409);
  const core = validateCore({
    tick: input.tick,
    paused: input.paused,
    particles: input.particles,
    bonds: input.bonds,
    selection: input.selection,
    hold: input.hold,
  });
  if (!Array.isArray(input.history) || input.history.length > R.maxHistory)
    fail('取消履歴の形式が不正です。');
  if (!Array.isArray(input.commands) || input.commands.length > R.maxCommandLog)
    fail('操作記録の形式が不正です。');
  const commands = (input.commands as unknown[]).map((item) => {
    const entry = objectInput(item, ['id', 'command']);
    if (typeof entry.command !== 'string') fail('操作記録の形式が不正です。');
    let recorded: unknown;
    try {
      recorded = JSON.parse(entry.command as string);
    } catch {
      return fail('操作記録の形式が不正です。');
    }
    const command = parseSandboxCommand(recorded);
    if (
      command.id !== workId(entry.id) ||
      JSON.stringify(command) !== entry.command
    )
      fail('操作記録の形式が不正です。');
    return { id: command.id, command: entry.command as string };
  });
  return {
    rules: R.id,
    title: text(input.title, 120, '作品名'),
    author: text(input.author, 80, '作者'),
    seed: integer(input.seed, 0, 0xffffffff, '乱数種'),
    revision: integer(input.revision, 0, Number.MAX_SAFE_INTEGER, '版数'),
    ...core,
    history: (input.history as unknown[]).map(validateCore),
    commands,
  };
}
