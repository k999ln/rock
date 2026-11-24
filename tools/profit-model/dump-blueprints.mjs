const m = await import(process.argv[2] + '/lib/noah-business.ts');
const bps = m.noahBlueprints();
const out = bps.map((b) => ({ id: b.id, kind: b.kind, label: b.label, monthlyYen: b.monthlyYen ?? b.costYen ?? b.monthlyCostYen ?? null, keys: Object.keys(b) }));
console.log(JSON.stringify({ count: bps.length, sampleKeys: Object.keys(bps[0]), sample: bps[0] }, null, 1).slice(0, 3000));
const fs = await import('node:fs');
fs.writeFileSync(process.argv[3], JSON.stringify(bps, null, 1));
