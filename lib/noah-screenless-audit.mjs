// Noah の隔離起動引数の検査。正本: docs/noah/spec-84-screenless.md §4.4。
/**
 * 隔離環境（container）の起動引数を検査する。違反の一覧を返す。空なら合格。
 * 対象は scripts/noah-isolated-runtime.mjs の containerArgs と、scripts/noah-terminal-runtime.mjs の terminalContainerArgs。
 */
/** @param {string[]} args @param {{ stage?: boolean }} [options] @returns {string[]} */
export function auditNoahContainerArgs(args, options = {}) {
  const violations = [];
  const valueOf = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : a.startsWith(`${flag}=`) ? [a.slice(flag.length + 1)] : []));
  const has = (flag) => args.includes(flag) || args.some((a) => a.startsWith(`${flag}=`));

  if (valueOf('--network').join() !== 'none') violations.push('--network none が無い（外向きの通信が開いている）');
  if (!has('--read-only')) violations.push('--read-only が無い');
  if (has('--read-only') && args.some(a => a.startsWith('--read-only=') && a !== '--read-only=true')) violations.push('--read-only を無効にしている');
  if (!valueOf('--cap-drop').includes('ALL')) violations.push('--cap-drop ALL が無い');
  if (!valueOf('--security-opt').includes('no-new-privileges')) violations.push('--security-opt no-new-privileges が無い');
  for (const flag of ['--memory', '--cpus', '--pids-limit']) if (!has(flag)) violations.push(`${flag} が無い（重さの上限が無い）`);
  const user = valueOf('--user');
  if (user.length !== 1 || (!options.stage && /^(0|root)(:|$)/.test(user[0]))) violations.push('--user が無い、または root');
  for (const flag of ['--privileged', '--device', '--cap-add', '--pid', '--ipc', '--uts', '--userns', '--volumes-from', '--gpus', '-p', '--publish', '-P', '--publish-all', '--net', '--volume-driver', '--add-host', '--env-file', '--device-cgroup-rule', '--use-api-socket'])
    if (has(flag)) violations.push(`${flag} を使っている`);
  for (const v of [...valueOf('-v'), ...valueOf('--volume')]) violations.push(`host の mount を使っている: ${v}`);
  if (args.some(a => /^-(?:v|p|e).+/.test(a) && !a.startsWith('--'))) violations.push('短縮したmount/port/env引数を使っている');
  for (const opt of valueOf('--security-opt')) if (opt !== 'no-new-privileges') violations.push('追加のsecurity-optを使っている');
  for (const m of valueOf('--mount')) if (!/^type=(volume|tmpfs),/.test(m) || /(^|,)(src|source)=\//.test(m) || /volume-(opt|driver)=/.test(m)) violations.push(`host の mount を使っている: ${m}`);
  for (const env of [...valueOf('--env'), ...valueOf('-e')]) {
    const at = env.indexOf('=');
    const name = at < 0 ? env : env.slice(0, at);
    const value = at < 0 ? null : env.slice(at + 1);
    // 画面・音・デスクトップへの経路は、空で上書きしている時だけ通す。
    if (/^(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|PULSE_SERVER|XDG_RUNTIME_DIR|SSH_AUTH_SOCK)$/.test(name) && value !== '') violations.push(`${name} を渡している`);
  }
  for (const socket of ['/var/run/docker.sock', '/tmp/.X11-unix', '/run/user']) if (args.some((a) => a.includes(socket))) violations.push(`${socket} を渡している`);
  return violations;
}

/** 隔離の VM（colima）の起動引数を検査する。host のファイルを VM へ見せない。 */
/** @param {string[]} args @returns {string[]} */
export function auditNoahVmArgs(args) {
  const violations = [];
  const mount = args.flatMap((a, i) => (a === '--mount' ? [args[i + 1] ?? ''] : a.startsWith('--mount=') ? [a.slice(8)] : []));
  if (mount.join() !== 'none') violations.push('--mount none が無い（host のファイルが VM から見える）');
  const on = (flag) => args.some((a) => a === flag || (a.startsWith(`${flag}=`) && a !== `${flag}=false`));
  if (on('--ssh-agent')) violations.push('--ssh-agent を使っている');
  if (on('--network-address')) violations.push('--network-address を使っている（VM が LAN に出る）');
  if (on('--network-host-addresses')) violations.push('--network-host-addresses を使っている（VM から host のアドレスへ届く）');
  return violations;
}
