import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(
  readFileSync(
    new URL('../components/noah-developer-maintenance.tsx', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const jsx = (type, props) => ({ type, props });
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.children)]
    : [];
}
function render(initialAgent) {
  const exports = {};
  runInNewContext(code, {
    exports,
    encodeURIComponent,
    fetch() {
      throw Error('Mail contact must not send or retrieve requests');
    },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/link') return { default: 'a' };
      if (name === 'lucide-react')
        return new Proxy({}, { get: (_, key) => String(key) });
      if (name.endsWith('.module.css'))
        return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      throw Error(name);
    },
  });
  return nodes(exports.default({ initialAgent }));
}
void test('developer contact opens the specified mailbox with an editable Agent inquiry and no Web form', () => {
  const all = render('anicca'),
    links = all.filter((n) => n.props?.href?.startsWith('mailto:'));
  assert.equal(links.length, 2);
  const mail = new URL(links[0].props.href);
  assert.equal(mail.pathname, 'smash@avoado.si');
  assert.equal(mail.searchParams.get('subject'), 'Noah Agent継続改善の相談');
  assert.match(
    mail.searchParams.get('body'),
    /^対象Agent: anicca\n\nご相談内容:/,
  );
  assert.deepEqual([...mail.searchParams.keys()], ['subject', 'body']);
  assert.ok(
    !all.some((n) => ['form', 'input', 'textarea', 'output'].includes(n.type)),
  );
  assert.ok(!all.some((n) => n.props?.href?.startsWith('/account')));
});
void test('general package inquiry does not invent an Agent or require an account', () => {
  const mail = new URL(
    render().find((n) => n.props?.href?.startsWith('mailto:')).props.href,
  );
  assert.doesNotMatch(mail.searchParams.get('body'), /undefined|対象Agent/);
  assert.match(mail.searchParams.get('body'), /ご相談内容/);
});
void test('untrusted Agent values cannot add mail headers or recipients', () => {
  for (const value of [
    'anicca\r\nBcc:other@example.test',
    '?bcc=other@example.test',
    '<script>',
  ]) {
    const mail = new URL(
      render(value).find((n) => n.props?.href?.startsWith('mailto:')).props
        .href,
    );
    assert.equal(mail.pathname, 'smash@avoado.si');
    assert.equal(mail.searchParams.get('bcc'), null);
    assert.ok(!mail.searchParams.get('body').includes(value));
  }
});
