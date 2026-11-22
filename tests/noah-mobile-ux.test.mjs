import test from 'node:test';
import assert from 'node:assert/strict';
import * as surface from '../lib/noah-surface.ts';
import { screen } from './fixtures/noah/screen.mjs';

void test('home search includes collected Agents instead of searching only connectable Agents', () => {
  for (const pathname of ['/noah', '/noah/public']) {
    const ui = screen({modules:{'next/navigation':{usePathname:()=>pathname},'@/lib/noah-surface':surface}});
    const page = ui.mount('components/noah-shell.tsx', {mode:'public',children:null});
    const form = page.find('form')[0];
    const fields = page.find('input');
    const tab = fields.find(input=>input.props.name==='tab');
    assert.equal(tab?.props.value, 'catalog');
    assert.equal(fields.find(input=>input.props.name==='collectionSource')?.props.value, '');
    const destination = new URL(form.props.action, 'https://avoado.si');
    destination.searchParams.set('tab',tab.props.value);
    destination.searchParams.set('q','Semantic Shift');
    assert.equal(destination.pathname, `${pathname}/explore`);
    assert.equal(destination.searchParams.get('tab'),'catalog');
    assert.ok(fields.some(input=>input.props.name==='q' && input.props.type==='search'));
  }
});
