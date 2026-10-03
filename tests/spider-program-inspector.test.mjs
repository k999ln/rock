import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectProgram, ProgramInspectionError,
  MAX_PROGRAM_BYTES, MAX_PROGRAM_LINES, MAX_PROGRAM_FINDINGS,
} from '../toolkits/spider-guard/program-inspector.mjs';

const codeRules = report => report.findings.filter(finding => finding.kind === 'code').map(finding => finding.rule);

void test('reports Unicode and multiline secret positions without source or values', () => {
  const source = 'const 日本語 = "🐈";\r\nAPI_KEY="fixture_value_only"\r\n// next\n-----BEGIN PRIVATE KEY-----\nTEST_ONLY\n-----END PRIVATE KEY-----\nperson@example.test';
  const report = inspectProgram(source, {language:'text'});
  assert.deepEqual(report.findings.map(f => [f.kind,f.line,f.endLine]), [
    ['secret',2,2], ['secret',4,6], ['personal',7,7],
  ]);
  assert.deepEqual(report.counts, {secret:2,personal:1,code:0,total:3});
  assert.equal(report.state,'needs_review');
  const serialized = JSON.stringify(report);
  for (const raw of ['fixture_value_only','TEST_ONLY','person@example.test','const 日本語']) assert(!serialized.includes(raw));
  for (const finding of report.findings) {
    assert.equal(typeof finding.why,'string'); assert.equal(typeof finding.remediation,'string');
    assert(!('start' in finding)); assert(!('source' in finding));
  }
  assert.deepEqual(inspectProgram(source,{language:'text'}),report);
});

void test('managed environment references are not literal secrets', () => {
  for (const source of [
    'const API_KEY = process.env.API_KEY;',
    'const API_KEY = import.meta.env.API_KEY;',
    'API_KEY = os.environ["API_KEY"]',
    'API_KEY = os.getenv("API_KEY")',
    'API_KEY = os.environ.get("API_KEY")',
  ]) assert.equal(inspectProgram(source).counts.secret,0,source);
  assert.equal(inspectProgram('API_KEY="os.getenv(test)"').counts.secret,1);
});

void test('four narrow JavaScript patterns produce actionable potential-risk findings', () => {
  const source = 'eval(input);\nnew Function(input);\nchild_process.exec(command);\nnode.innerHTML = untrusted;\nhttps.request({rejectUnauthorized: false});';
  const report = inspectProgram(source);
  assert.deepEqual(codeRules(report), ['dynamic_eval','dynamic_eval','shell_execution','unsafe_html','tls_verification_disabled']);
  assert.deepEqual(report.findings.map(f => f.line),[1,2,3,4,5]);
  assert.equal(report.coverageLimited,false);
  assert.equal(report.state,'needs_review');
  assert(report.findings.every(f => !JSON.stringify(f).includes('untrusted')));
});

void test('comments, strings and regex literals do not become executable patterns', () => {
  const source = [
    '// eval(input); node.innerHTML = input;',
    '/* child_process.exec(input); rejectUnauthorized: false */',
    'const example = "eval(input); node.innerHTML = input";',
    "const other = 'child_process.exec(input)';",
    'const pattern = /eval\\(input\\)|child_process.exec(input)/g;',
    'const template = `eval(input)`;',
    'const 日本eval = () => 1; 日本eval();',
    'element.textContent = input;',
    'regex.exec(input);',
  ].join('\n');
  const report = inspectProgram(source);
  assert.deepEqual(codeRules(report),[]);
  assert.equal(report.state,'no_findings');
  assert.equal(report.coverageLimited,false);
});

void test('sensitive values in comments are still inspected as exposed data', () => {
  const report = inspectProgram('// API_KEY="only_a_fixture"\n// eval(input)');
  assert.equal(report.counts.secret,1); assert.equal(report.counts.code,0);
});

void test('Python dynamic calls, shell opt-in and disabled TLS are recognized', () => {
  const source = [
    'eval(data)', 'exec(data)', 'os.system(command)',
    'subprocess.run(args, shell=True)',
    'requests.get(url, verify=False)', 'ssl._create_unverified_context()',
    'subprocess.run(args, shell=False)', 'requests.get(url, verify=True)',
    '# eval(data)', 'example = "os.system(command)"',
    'doc = """exec(data)\nrequests.get(url, verify=False)"""',
  ].join('\n');
  assert.deepEqual(codeRules(inspectProgram(source,{language:'python'})), [
    'dynamic_eval','dynamic_eval','shell_execution','shell_execution','tls_verification_disabled','tls_verification_disabled',
  ]);
});

void test('multiline nested calls have bounded correct line ranges', () => {
  const report = inspectProgram('eval(\n  choose(\n    data\n  )\n);');
  assert.equal(report.findings[0].line,1); assert.equal(report.findings[0].endLine,5);
});

void test('unclosed strings and unparsed interpolation are explicitly incomplete', () => {
  for (const source of ['const broken = "unfinished', '/* unfinished', 'const text = `${eval(data)}`;']) {
    const report = inspectProgram(source);
    assert.equal(report.coverageLimited,true);
    assert.equal(report.state,'incomplete');
    assert.equal(report.counts.code,0);
  }
  const python = inspectProgram('text = f"{eval(data)}"',{language:'python'});
  assert.equal(python.coverageLimited,true); assert.equal(python.state,'incomplete');
});

void test('empty, clean and text-only reports preserve bounded-scope limitations', () => {
  assert.equal(inspectProgram(' \n\t').state,'empty');
  const clean = inspectProgram('element.textContent = message;');
  assert.equal(clean.state,'no_findings'); assert(clean.limitations.length >= 2);
  const text = inspectProgram('eval(input)',{language:'text'});
  assert.equal(text.state,'no_findings'); assert.equal(text.counts.code,0);
  assert(text.limitations.some(value => value.includes('テキスト')));
});

void test('finding cap reports partial coverage rather than claiming completion', () => {
  const report = inspectProgram('eval(input);\n'.repeat(MAX_PROGRAM_FINDINGS + 7));
  assert.equal(report.findings.length,MAX_PROGRAM_FINDINGS);
  assert.equal(report.counts.total,MAX_PROGRAM_FINDINGS);
  assert.equal(report.coverageLimited,true); assert.equal(report.state,'needs_review');
  assert(report.limitations.some(value => value.includes('100')));
});

void test('finding cap preserves later secrets ahead of early code findings', () => {
  const source = 'eval(input);\n'.repeat(MAX_PROGRAM_FINDINGS) +
    'person@example.test\nAPI_KEY="late_fixture_only"\nPASSWORD="last_fixture_only"';
  const report = inspectProgram(source);
  assert.equal(report.findings.length,MAX_PROGRAM_FINDINGS);
  assert.equal(report.coverageLimited,true);
  assert.deepEqual(report.findings.slice(0,3).map(f => [f.kind,f.line]), [
    ['secret',102], ['secret',103], ['personal',101],
  ]);
  assert.deepEqual(report.counts,{secret:2,personal:1,code:97,total:100});
  assert.deepEqual(report.findings.slice(3).map(f => f.line),Array.from({length:97},(_,index) => index+1));
  assert(!JSON.stringify(report).includes('late_fixture_only'));
});

void test('source is never evaluated, even when it would mutate global state', () => {
  globalThis.__spiderInspectorProbe = 0;
  const report = inspectProgram('globalThis.__spiderInspectorProbe = 99; eval("globalThis.__spiderInspectorProbe = 100")');
  assert.equal(globalThis.__spiderInspectorProbe,0);
  assert.equal(report.counts.code,1);
  delete globalThis.__spiderInspectorProbe;
});

void test('byte, line and type limits use constant typed errors without payloads', () => {
  const check = expected => error => {
    assert(error instanceof ProgramInspectionError);
    assert.equal(error.code,expected); assert.equal(error.message,expected);
    return true;
  };
  assert.throws(() => inspectProgram('x'.repeat(MAX_PROGRAM_BYTES + 1)),check('CODE_INSPECTION_TOO_LARGE'));
  assert.throws(() => inspectProgram('🐈'.repeat(MAX_PROGRAM_BYTES / 4 + 1)),check('CODE_INSPECTION_TOO_LARGE'));
  assert.throws(() => inspectProgram('\n'.repeat(MAX_PROGRAM_LINES)),check('CODE_INSPECTION_TOO_LARGE'));
  assert.equal(inspectProgram('x'.repeat(MAX_PROGRAM_BYTES)).state,'no_findings');
  assert.throws(() => inspectProgram({toString(){throw new Error('must_not_run');}}),check('CODE_INSPECTION_INVALID_INPUT'));
  let getterCalled = false;
  assert.throws(() => inspectProgram('',{get language(){getterCalled=true;return 'javascript';}}),check('CODE_INSPECTION_INVALID_INPUT'));
  assert.equal(getterCalled,false);
  assert.throws(() => inspectProgram('',{language:'ruby'}),check('CODE_INSPECTION_UNSUPPORTED_LANGUAGE'));
});
