import assert from 'node:assert/strict';
import test from 'node:test';
import { noahTheaterFilms } from '../lib/noah-theater-films.ts';
import { screen } from './fixtures/noah/screen.mjs';

const authorFilm = {
  packageKey: 'creator.sound-check', digest: 'a'.repeat(64), name: 'Sound check', author: 'Studio',
  isAgent: true, summary: '録音の準備', guideMarkdown: '## 操作\n- マイクを選ぶ', cover: { type: 'video/webm' },
};

async function openTheater({ reduced = false, clips = [] } = {}) {
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const observers = new Set();
  let ratio = 1;
  const focused = [], paused = [];
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); this.read(); }
    disconnect() { observers.delete(this); }
    read() { this.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); }
  }
  const ui = screen({
    modules: { '@/lib/noah-theater-films': { noahTheaterFilms } },
    document, IntersectionObserver: Observer, matchMedia: () => preference,
    hostElement: (tag) => ({
      focus: () => focused.push(tag), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 0, bottom: 400 }),
      pause: () => paused.push(tag), load() {}, removeAttribute() {},
    }),
    fetch: ({ method, url }) => {
      assert.equal(method, 'GET');
      assert.equal(url, '/api/noah/feed?order=latest&media=video');
      return { body: { entries: clips, nextCursor: null } };
    },
  });
  const page = ui.mount('components/noah-theater.tsx');
  await page.flush();
  const current = () => page.find('div').find(node => node.props['data-film']);
  return {
    ui, page, focused, paused, current,
    frame: () => current().props['data-scene'],
    running: () => current().props['data-running'],
    button: (label) => page.find('button').find(node => node.props['aria-label'] === label),
    setIntersection: value => { ratio = value; for (const observer of observers) observer.read(); page.render(); },
    setHidden: value => { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); page.render(); },
    setReduced: value => { preference.matches = value; preference.dispatchEvent(new Event('change')); page.render(); },
  };
}

void test('each scene retains its remaining time across manual pause, offscreen and background transitions', async () => {
  const { frame, running, button, page, setIntersection, setHidden } = await openTheater();
  assert.equal(frame(), 0);
  assert.equal(running(), true);
  await page.tick(2100);
  await page.press(button('一時停止'));
  await page.tick(25_000);
  assert.equal(frame(), 0);
  await page.press(button('再生'));
  await page.tick(1000);
  setIntersection(0.1);
  assert.equal(running(), false);
  await page.tick(8000);
  setIntersection(0.8);
  await page.tick(400);
  setHidden(true);
  assert.equal(running(), false);
  await page.tick(7000);
  setHidden(false);
  await page.tick(1499);
  assert.equal(frame(), 0);
  await page.tick(1);
  assert.equal(frame(), 1);
  await page.tick(10_000);
  assert.equal(frame(), 2);
  assert.equal(running(), false);
  await page.press(button('もう一度再生'));
  assert.equal(frame(), 0);
  assert.equal(running(), true);
});

void test('reduced motion starts with a still, each film supports manual scenes, transcript and a distinct result', async () => {
  const { ui, page, current, running, frame, button, setReduced } = await openTheater({ reduced: true });
  await page.tick(30_000);
  assert.equal(frame(), 0);
  assert.equal(running(), false);
  for (const film of noahTheaterFilms) {
    await page.click(film.title);
    assert.equal(current().props['data-film'], film.id);
    assert.equal(button('前の場面').props.disabled, true);
    for (let i = 0; i < film.scenes.length; i++) {
      if (i) await page.press(button('次の場面'));
      assert.equal(frame(), i);
      const visibleText = page.text(current());
      assert.ok(visibleText.includes(film.scenes[i].caption));
      for (const line of film.outcome) assert.equal(visibleText.includes(line), i === 2);
      assert.equal(running(), false);
    }
    assert.equal(button('次の場面').props.disabled, true);
    assert.ok(film.scenes.every(scene => page.text(page.find('details')[0]).includes(scene.detail)));
    assert.equal(page.find('a', 'Agentの詳細')[0].props.href, film.href);
    await page.press(button('前の場面'));
    assert.equal(frame(), 1);
  }
  await page.press(button('再生'));
  setReduced(false);
  setReduced(true);
  await page.tick(10_000);
  assert.equal(frame(), 1);
  assert.equal(running(), false);
  assert.equal(ui.calls.length, 1, 'watching and opening scene controls never start agent work');
});

void test('selecting an author movie reuses the projector and unmounts the editorial clock until the viewer returns', async () => {
  const { ui, page, focused, paused, current, frame } = await openTheater({ clips: [authorFilm] });
  await page.tick(3000);
  assert.equal(page.find('video').length, 0);
  assert.equal(paused.length, 0);
  await page.click('Sound check');
  assert.equal(current(), undefined);
  const [video] = page.find('video');
  assert.equal(page.find('video').length, 1);
  assert.equal(video.props.controls, true);
  assert.equal(video.props.preload, 'none');
  assert.equal(video.props.src, `/api/noah/releases/${authorFilm.packageKey}/cover?digest=${authorFilm.digest}&public=1`);
  assert.equal(page.find('button', 'Sound check')[0].props['aria-pressed'], true);
  await page.tick(30_000);
  assert.equal(current(), undefined);
  await page.click('上映作品に戻る');
  assert.equal(page.find('video').length, 0);
  assert.deepEqual(paused, ['video']);
  assert.equal(frame(), 0);
  await page.tick(5000);
  assert.equal(frame(), 1);
  await page.click('Sound check');
  await page.click(noahTheaterFilms[1].title);
  assert.equal(page.find('video').length, 0);
  assert.deepEqual(paused, ['video', 'video']);
  assert.equal(current().props['data-film'], 'time');
  assert.equal(page.find('button', 'Sound check')[0].props['aria-pressed'], false);
  assert.deepEqual(focused, ['section', 'section', 'section', 'section']);
  assert.equal(ui.calls.length, 1);
});
