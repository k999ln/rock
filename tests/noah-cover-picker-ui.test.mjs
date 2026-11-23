import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screen } from './fixtures/noah/screen.mjs';
import * as cover from '../lib/noah-cover.ts';

function picker() {
  const props = { name:'Memory', summary:'関係を照合する', value:{ kind:'later' }, onChange(value) { props.value = value; } };
  const pending = [];
  const browser = screen({ modules: {
    '@/lib/noah-cover':cover,
    '@/lib/noah-card-video':{ generateNoahAgentCardVideo:options => new Promise(resolve => pending.push({options,resolve})) },
  } });
  const page = browser.mount('components/noah-cover-picker.tsx', props);
  function select(label) { const el = page.find('label',label)[0]; return page.change(page.nodes(el).find(x => x.type==='input' && x.props.type==='radio'), true); }
  return { props,pending,page,select };
}
const movie = () => new Blob([new Uint8Array(128)],{type:'video/webm;codecs=vp9'});

void test('a personal movie is optional; cancelled or outdated renders cannot replace a new selection', async () => {
  const { props,pending,page,select } = picker();
  assert.equal(props.value.kind,'later');
  assert.equal(pending.length,0);
  await select('おまかせで動画を作る');
  assert.equal(pending.length,1);
  assert.equal(pending[0].options.name,'Memory');
  await page.click('やめる');
  assert(pending[0].options.signal.aborted);
  pending[0].resolve(movie());
  await page.flush();
  assert.equal(props.value.kind,'later');
  await select('おまかせで動画を作る');
  props.summary = '異なる入力に切り替え';
  page.render();
  assert(pending[1].options.signal.aborted);
  pending[1].resolve(movie());
  await page.flush();
  assert.equal(props.value.file,undefined);
});

void test('the author can regenerate a different edition, accept its preview, or replace it with a personal image', async () => {
  const { props,pending,page,select } = picker();
  await select('おまかせで動画を作る');
  pending[0].resolve(movie());
  await page.flush();
  assert.equal(props.value.file.type,'video/webm');
  assert.equal(props.value.accepted,undefined);
  await page.click('動画を作り直す');
  assert.equal(pending[1].options.variation,1);
  pending[1].resolve(movie());
  await page.flush();
  await page.click('この動画を使う');
  assert.equal(props.value.accepted,true);
  await select('自分の画像・動画を使う');
  const input = page.find('input').find(el => el.props.type === 'file');
  input.props.onChange({currentTarget:{files:[new File([new Uint8Array(32)],'x.svg',{type:'image/svg+xml'})]}});
  page.render();
  assert.equal(props.value.file,undefined);
  assert(page.text().includes('PNG・JPEG・WebP・MP4・WebMから選んでください。'));
  const image = new File([new Uint8Array(32)],'x.png',{type:'image/png'});
  input.props.onChange({currentTarget:{files:[image]}});
  page.render();
  assert.equal(props.value.file,image);
  assert.equal(page.find('img').length,1);
  assert.equal(pending.length,2);
});
