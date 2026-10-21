/** Release evidence checks. Passing source validation does not accept a launch stage. */
export function auditSkyLaunch(report, evidenceExists) {
  if (report.completeLaunchScope !== 'standalone-web-paid-marketplace') throw new Error('Sky complete-launch scope must be explicit.');
  if (report.schema !== 'sky-service-launch/1' || !Array.isArray(report.gates) || !report.gates.length)
    throw new Error('Sky launch report is missing its gates.');
  const stages = Object.keys(report.stageDependencies ?? {});
  if (!stages.includes('focused')) throw new Error('Focused-launch stage is required.');
  const ids = new Set();
  for (const gate of report.gates) {
    if (!gate.id || ids.has(gate.id) || !stages.includes(gate.stage) ||
      !['passed', 'in_progress', 'not_verified', 'blocked'].includes(gate.status) ||
      !['ROCK', 'JOINT', 'OWNER', 'EXTERNAL'].includes(gate.owner) || !gate.acceptance || !gate.environment || !Array.isArray(gate.evidence))
      throw new Error(`Invalid launch gate: ${gate.id}`);
    ids.add(gate.id);
    if (gate.status === 'passed' && !gate.evidence.length) throw new Error(`Missing acceptance evidence: ${gate.id}`);
    for (const evidence of gate.evidence) if (!evidenceExists(evidence)) throw new Error(`Missing launch evidence file: ${evidence}`);
  }
  const requirements = (stage, visited = new Set()) => {
    if (visited.has(stage)) throw new Error('Launch stage dependency cycle.');
    visited.add(stage);
    const dependencies = report.stageDependencies[stage];
    if (!Array.isArray(dependencies)) throw new Error(`Unknown launch stage: ${stage}`);
    return new Set([stage, ...dependencies.flatMap((dependency) => [...requirements(dependency, new Set(visited))])]);
  };
  const missing = Object.fromEntries(stages.map((stage) => {
    const needed = requirements(stage);
    return [stage, report.gates.filter((gate) => needed.has(gate.stage) && gate.status !== 'passed')];
  }));
  if (!missing.paid || report.completeLaunchClaim !== (missing.paid.length === 0))
    throw new Error('Complete-launch claim disagrees with required acceptance.');
  if (stages.includes('focused')) {
    if (report.focusedLaunchScope !== 'csv-article-citations-and-one-cloud-ai') throw new Error('Focused-launch scope must include the cloud customer journey.');
    for (const id of ['focused-csv-payment', 'focused-cloud-ai', 'focused-customer-journey', 'focused-tool-inventory', 'focused-apple-pay']) {
      const gate = report.gates.find((item) => item.id === id);
      if (!gate || gate.stage !== 'focused') throw new Error(`Missing focused acceptance: ${id}`);
      if (gate.status === 'passed' && gate.environment !== 'production') throw new Error(`Focused acceptance needs production evidence: ${id}`);
    }
    if (report.focusedLaunchClaim !== (missing.focused.length === 0))
      throw new Error('Focused-launch claim disagrees with required acceptance.');
    for (const id of ['public-entry', 'runtime-prerequisites', 'authenticated-first-use', 'csv-private-delivery', 'service-policy-and-support', 'recovery-and-update']) {
      const gate = report.gates.find((item) => item.id === id);
      if (!gate || gate.stage !== 'basic') throw new Error(`Missing basic acceptance: ${id}`);
    }
    if (!requirements('focused').has('basic')) throw new Error('Focused launch must retain basic customer and recovery acceptance.');
  }
  return { stages, missing };
}
