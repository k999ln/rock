// Pure metadata helpers. These do not contact GitHub or inspect source code.
export function selectPull(pull) {
  return {
    number: pull.number,
    state: pull.state,
    mergedAt: pull.merged_at,
    url: pull.html_url,
    base: pull.base.ref,
    head: pull.head.ref,
    sha: pull.head.sha,
    repository: pull.head.repo?.full_name ?? null,
  };
}

export function collectCheckShas(repository, main, branches, openPullRequests) {
  return [...new Set([
    main,
    ...branches.map((branch) => branch.sha),
    ...openPullRequests.filter((pull) => pull.repository === repository).map((pull) => pull.sha),
  ])].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function canonicalRefs({ main, branches, openPullRequests }) {
  return {
    main,
    branches: branches.map(({ name, sha }) => ({ name, sha }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : left.sha.localeCompare(right.sha)),
    openPullRequests: openPullRequests.map(({ number, state, mergedAt, url, base, head, sha, repository }) =>
      ({ number, state, mergedAt, url, base, head, sha, repository }))
      .sort((left, right) => left.number - right.number),
  };
}

export function refsUnchanged(before, after) {
  return JSON.stringify(canonicalRefs(before)) === JSON.stringify(canonicalRefs(after));
}

export function summarizeChecks(checks) {
  // An empty list must not pass through Array.every()'s vacuous truth. Skipped,
  // neutral, unknown and failed conclusions are not successful test evidence.
  const state = checks.length === 0 ? 'NO_CHECKS'
    : checks.some((check) => check.status !== 'completed') ? 'INCOMPLETE'
      : checks.every((check) => check.conclusion === 'success') ? 'PASS' : 'NOT_PASS';
  return { state, total: checks.length, allSuccessful: state === 'PASS' };
}
