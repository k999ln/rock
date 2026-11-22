import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { readArtifact, site, targetUrl } from './jobs.mjs';

export function launchProfile(root, login = false) {
  return chromium.launchPersistentContext(join(root, 'chrome'), {
    channel: 'chrome',
    headless: !login,
    chromiumSandbox: true,
    handleSIGTERM: false,
    handleSIGINT: false,
    handleSIGHUP: false,
    acceptDownloads: false,
    permissions: [],
    serviceWorkers: 'block',
    args: ['--disable-sync', '--mute-audio', '--disable-extensions'],
  });
}
function requireValue(condition) {
  if (!condition) throw Error('対象ページの内容を確認できません。');
}
async function navigate(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
  requireValue(page.url() === url);
}
async function readback(page, url, check) {
  // Read again from the site. A toast, the clicked button or an echoed draft is not a receipt.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForTimeout(350 * (attempt + 1));
    await navigate(page, url);
    if (await check()) return;
  }
  throw Error('ココナラ側の記録を照合できません。');
}
async function reply(page, job, begin) {
  const url = targetUrl(job);
  const field = page.locator(
    'textarea#DirectMessageBody[name="data[DirectMessage][body]"]',
  );
  const form = page.locator('form').filter({ has: field });
  const ownPath = await page
    .locator('.sidebar-profile a[href*="/users/"]')
    .first()
    .getAttribute('href');
  const own = new URL(ownPath, site);
  requireValue(own.origin === site && /^\/users\/\d+$/.test(own.pathname));
  const countSent = () =>
    page.locator('.js_thread-wrapper .threadColomun').evaluateAll(
      (rows, { ownUrl, text }) =>
        rows.filter((row) => {
          const body =
            row.querySelector('.js-translateMessageOriginalMessage') ??
            row.querySelector('.threadMessage');
          return (
            row.querySelector('.threadUser a')?.href === ownUrl &&
            body?.innerText.trim() === text
          );
        }).length,
      { ownUrl: own.href, text: job.message },
    );
  const before = await countSent();
  requireValue(
    await form.evaluate(
      (f) => f.action === location.href && f.method.toLowerCase() === 'post',
    ),
  );
  await field.fill(job.message);
  const submit = form
    .locator('button.js_handle-submit')
    .filter({ hasText: 'メッセージを送信する' });
  await submit.waitFor({ state: 'visible' });
  requireValue(
    page.url() === url &&
      (await field.inputValue()) === job.message &&
      (await submit.isEnabled()),
  );
  begin();
  const response = page.waitForResponse(
    (res) =>
      res.url() === url.replace('/direct_message/', '/direct_message_ajax/') &&
      res.request().method() === 'POST' &&
      res.ok(),
    { timeout: 12000 },
  );
  await Promise.all([response, submit.click()]);
  await readback(page, url, async () => (await countSent()) > before);
}
async function setDue(page, input, date) {
  const [year, month, day] = date.split('-').map(Number);
  if (await input.isEditable()) {
    await input.fill(date);
    await input.press('Tab');
  } else {
    await input.click();
    const jquery = page
      .locator(
        `#ui-datepicker-div td[data-year="${year}"][data-month="${month - 1}"] a`,
      )
      .filter({ hasText: new RegExp('^' + day + '$') });
    const fullDate = page.locator(
      `[data-date="${date}"]:visible,[aria-label="${date}"]:visible,[datetime="${date}"]:visible,.vc-day.id-${date} .vc-day-content:visible`,
    );
    const target = fullDate.or(jquery);
    // Move forward one month at a time. Only a day bound to its full calendar date may be selected.
    for (let moves = 0; moves < 24 && !(await target.count()); moves++) {
      const next = page.locator(
        '.ui-datepicker-next:visible,.vc-arrow.is-right:visible,[aria-label="Next Month"]:visible,[aria-label="次の月"]:visible',
      );
      if ((await next.count()) !== 1 || !(await next.isEnabled())) break;
      const header = page.locator(
        '.ui-datepicker-title:visible,.vc-title:visible',
      );
      if ((await header.count()) !== 1) break;
      const title = await header.innerText();
      await next.click();
      await header.filter({ hasNotText: title }).waitFor({ timeout: 1500 });
    }
    await target.click();
  }
  const value = (await input.inputValue()).match(
    /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/,
  );
  requireValue(
    value &&
      Number(value[1]) === year &&
      Number(value[2]) === month &&
      Number(value[3]) === day,
  );
}
async function optionalModal(page, title, buttonName) {
  const dialog = page
    .locator(
      '[role="dialog"]:visible,.modal:visible,.d-modal:visible,.js_components-modal:visible',
    )
    .filter({ hasText: title });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 1200 });
  } catch (error) {
    if (error.name === 'TimeoutError') return;
    throw error;
  }
  await dialog.getByRole('button', { name: buttonName, exact: true }).click();
}
const offers = site + '/mypage/job_matching/applied/offers';
async function offerLinks(page) {
  await navigate(page, offers);
  return [
    ...new Set(
      await page
        .locator('a[href*="/mypage/offers/"]')
        .evaluateAll((links) => links.map((a) => a.href)),
    ),
  ].filter((url) => /^https:\/\/coconala\.com\/mypage\/offers\/\d+$/.test(url));
}
async function apply(page, job, begin) {
  const url = targetUrl(job);
  const before = new Set(await offerLinks(page));
  await navigate(page, url);
  const content = page.locator('textarea[name="data[Offer][content]"]');
  const price = page.locator('input[name="data[Offer][price]"]');
  const due = page.locator('input[name="data[Offer][expire_date]"]');
  await content.fill(job.message);
  await price.fill(String(job.price));
  await setDue(page, due, job.due);
  requireValue(
    (await content.inputValue()) === job.message &&
      Number(await price.inputValue()) === job.price &&
      page.url() === url,
  );
  await page.getByRole('button', { name: '確認する', exact: true }).click();
  const submit = page.getByRole('button', { name: '応募する', exact: true });
  await submit.waitFor({ state: 'visible' });
  requireValue(page.url() === url && (await submit.isEnabled()));
  // Confirm the rendered terms; a calendar field may show an uncommitted date.
  const preview = (await page.locator('body').innerText()).normalize('NFKC');
  const [year, month, day] = job.due.split('-').map(Number);
  const displayedTerms = preview.replace(job.message.normalize('NFKC'), '');
  const confirmedDate = new RegExp(
    year + '(?:年|[-/])0?' + month + '(?:月|[-/])0?' + day + '(?:日|\\b)',
  );
  requireValue(
    preview.includes(job.message.normalize('NFKC')) &&
      new RegExp('(?:^|[^0-9])' + job.price + '(?:円|[^0-9]|$)').test(
        displayedTerms.replaceAll(',', ''),
      ) &&
      confirmedDate.test(displayedTerms),
  );
  begin();
  await submit.click();
  await optionalModal(page, '投稿前にご確認ください', '応募する');
  for (let attempt = 0; attempt < 3; attempt++) {
    const added = (await offerLinks(page)).filter((url) => !before.has(url));
    for (const detail of added.slice(0, 5)) {
      await navigate(page, detail);
      const id = page.locator('#OfferRequestId');
      if ((await id.count()) === 1 && (await id.inputValue()) === job.target)
        return;
    }
    await page.waitForTimeout(450);
  }
  throw Error('応募履歴に案件番号が見つかりません。');
}
async function talkroom(page, job, begin, file) {
  const url = targetUrl(job);
  const form = page.locator('.d-messageForm');
  const progress = page.locator('.d-talkroomStep_label-current');
  const checkbox = form.locator(
    '.d-messageFormButtonArea_item-deliveryCheck input[type=checkbox]',
  );
  const formal = job.kind === 'deliver';
  if (formal)
    requireValue(
      (await progress.innerText()).trim() === '進行中' &&
        (await checkbox.isEnabled()),
    );
  if (await checkbox.count()) requireValue(!(await checkbox.isChecked()));
  const matching = () =>
    page
      .locator('.d-talkroomMessage:not(.d-talkroomMessage-isOthers)')
      .evaluateAll(
        (rows, { text, name }) =>
          rows.filter(
            (row) =>
              row.innerText.trim().startsWith('自分') &&
              row.querySelector('.d-normalMessage')?.innerText.trim() ===
                text &&
              (!name ||
                [
                  ...row.querySelectorAll(
                    '.d-talkroomMessage_attachedFilesItem .tooltip-content,.d-talkroomMessage_attachedFilesItem .d-attachedFileName',
                  ),
                ].some((n) => n.textContent.trim() === name)),
          ).length,
        { text: job.message, name: job.filename },
      );
  const before = await matching();
  const message = form.locator('textarea[placeholder="メッセージを入力"]');
  await message.fill(job.message);
  requireValue(page.url() === url);
  // Upload may already transfer bytes to the service. Record the irreversible boundary first.
  begin();
  if (formal) {
    await form.locator('input[type=file]').setInputFiles(file);
    await checkbox.check();
    await optionalModal(page, '正式な納品について', '閉じる');
    requireValue(
      page.url() === url &&
        (await checkbox.isChecked()) &&
        (await message.inputValue()) === job.message,
    );
    const attached = await form
      .locator('input[type=file]')
      .evaluate((el) => Array.from(el.files ?? [], (x) => x.name));
    const shown = await form.locator('.d-partOfFilename').allTextContents();
    requireValue(
      attached.includes(job.filename) ||
        shown.some((name) => name.trim() === job.filename),
    );
  }
  requireValue(
    page.url() === url && (await message.inputValue()) === job.message,
  );
  if (!formal && (await checkbox.count()))
    requireValue(!(await checkbox.isChecked()));
  await form.getByRole('button', { name: '送信', exact: true }).click();
  if (formal)
    await optionalModal(page, /納品/, /^(納品する|納品として送信|送信する)$/);
  await readback(
    page,
    url,
    async () =>
      (!formal ||
        ['納品送付', '取引完了'].includes(
          (await progress.innerText()).trim(),
        )) &&
      (await matching()) > before,
  );
}
// Read-only page assets linked by Coconala. An unrecognized destination leaves the operation unconfirmed.
const publicScripts = new Set([
  'https://unpkg.com/axios@0.19.0/dist/axios.min.js',
  'https://unpkg.com/url-search-params-polyfill@7.0.0/index.js',
  'https://unpkg.com/vue@2.6.10/dist/vue.min.js',
]);
export async function runBrowserJob(root, job, begin, launch = launchProfile) {
  const file = job.kind === 'deliver' ? await readArtifact(root, job) : null;
  const context = await launch(root);
  try {
    context.setDefaultTimeout(6000);
    const page = await context.newPage();
    // User input always goes to this page through a private browser pipe.
    await context.route('**/*', (route) => {
      const request = route.request(),
        u = new URL(request.url());
      if (u.protocol !== 'https:' || u.port || u.username || u.password)
        return route.abort();
      const onSite =
        u.hostname === 'coconala.com' || u.hostname.endsWith('.coconala.com');
      if (!onSite) {
        const asset =
          publicScripts.has(u.href) ||
          u.hostname === 'd377jvr5bdab5d.cloudfront.net';
        if (
          !asset ||
          request.isNavigationRequest() ||
          !['GET', 'HEAD'].includes(request.method())
        )
          return route.abort();
      }
      if (request.isNavigationRequest() && !request.frame().parentFrame()) {
        const receipt =
          job.kind === 'apply' &&
          u.origin === site &&
          (u.href === offers ||
            /^\/mypage\/offers\/\d+$/.test(u.pathname) ||
            u.pathname === '\/requests/' + job.target);
        if (u.href !== targetUrl(job) && !receipt) return route.abort();
      }
      return route.fallback();
    });
    await navigate(page, targetUrl(job));
    if (job.kind === 'reply') await reply(page, job, begin);
    else if (job.kind === 'apply') await apply(page, job, begin);
    else await talkroom(page, job, begin, file);
  } finally {
    await context.close();
  }
}
