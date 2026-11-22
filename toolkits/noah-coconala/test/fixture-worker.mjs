// Test-only stdio entry. All browser traffic is fulfilled locally; never load a user profile.
import { readFile, writeFile, appendFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { serve } from '../server.mjs';
import { launchProfile, runBrowserJob } from '../browser.mjs';

const root = process.env.NOAH_TEST_DIRECTORY;
if (!root) throw Error('A temporary test directory is required');
const stateFile = join(root, 'site.json');
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('"', '&quot;');
async function fixture(route) {
  const req = route.request(),
    url = new URL(req.url());
  if (url.origin !== 'https://coconala.com') return route.abort();
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  if (req.method() === 'POST') {
    const key = {
      '/mypage/direct_message_ajax/101': 'reply',
      '/offers/add/202': 'apply',
      '/talkrooms/303': 'deliver',
      '/talkrooms/304': 'room_reply',
    }[url.pathname];
    if (!key) return route.abort();
    state[key].push(req.postDataJSON());
    const nextState = stateFile + '.tmp';
    await writeFile(nextState, JSON.stringify(state));
    await rename(nextState, stateFile);
    return route.fulfill({ json: { ok: true } });
  }
  // Leaving the submitting page early would cancel this delayed form submission.
  const head = `<meta charset=utf-8><script>
    async function post(path, obj) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
    }
  </script>`;
  let body = '';
  switch (url.pathname) {
    case '/mypage/direct_message/101':
      body =
        '<div class="sidebar-profile"><a href="/users/1">自分</a></div><div class="js_thread-wrapper">' +
        state.reply
          .map(
            (x) =>
              '<div class="threadColomun"><div class="threadUser"><a href="/users/1">自分</a></div><div class="threadMessage">' +
              escape(x.message) +
              '</div></div>',
          )
          .join('') +
        '</div><form method="post" onsubmit="event.preventDefault();post(\'/mypage/direct_message_ajax/101\',{message:DirectMessageBody.value})"><textarea id="DirectMessageBody" name="data[DirectMessage][body]"></textarea><button class="js_handle-submit">メッセージを送信する</button></form>';
      break;
    case '/offers/add/202':
      body = `<form id="editor"><textarea id="msg" name="data[Offer][content]"></textarea><input id="price" name="data[Offer][price]"><input id="due" type="date" name="data[Offer][expire_date]"><button type="button" id="preview">確認する</button></form>
        <section hidden id="summary"><div id="terms"></div><button onclick="modal.showModal()">応募する</button></section>
        <dialog id="modal" role="dialog">投稿前にご確認ください<button onclick="post(location.pathname,{message:msg.value,price:price.value,due:due.value}).then(()=>modal.close())">応募する</button></dialog>
        <script>preview.onclick=()=>{editor.hidden=true;summary.hidden=false;terms.textContent=msg.value+' '+price.value+'円 '+due.value;}</script>`;
      break;
    case '/mypage/job_matching/applied/offers':
      body = state.apply.length
        ? '<a href="/mypage/offers/404">応募内容</a>'
        : '応募履歴';
      break;
    case '/mypage/offers/404':
      body = '<input type="hidden" id="OfferRequestId" value="202">';
      break;
    case '/talkrooms/304':
      body =
        state.room_reply
          .map(
            (x) =>
              '<div class="d-talkroomMessage">自分<div class="d-normalMessage">' +
              escape(x.message) +
              '</div></div>',
          )
          .join('') +
        `<div class="d-messageForm"><textarea id="msg" placeholder="メッセージを入力"></textarea><button onclick="post(location.pathname,{message:msg.value})">送信</button></div>`;
      break;
    case '/talkrooms/303':
      body =
        '<div class="d-talkroomStep_label-current">' +
        (state.deliver.length ? '納品送付' : '進行中') +
        '</div>' +
        state.deliver
          .map(
            (x) =>
              '<div class="d-talkroomMessage">自分<div class="d-normalMessage">' +
              escape(x.message) +
              '</div><div class="d-talkroomMessage_attachedFilesItem"><span class="d-attachedFileName">' +
              escape(x.filename) +
              '</span></div></div>',
          )
          .join('') +
        `<div class="d-messageForm"><textarea id="msg" placeholder="メッセージを入力"></textarea><label class="d-messageFormButtonArea_item-deliveryCheck"><input id="formal" type="checkbox">正式な納品</label><input id="file" type="file"><button onclick="modal.showModal()">送信</button></div><dialog role="dialog" id="modal">正式な納品<button onclick="deliver()">納品する</button></dialog>
        <script>async function deliver(){const f=file.files[0];if(!formal.checked||!f)return;await post(location.pathname,{message:msg.value,filename:f.name,bytes:await f.text(),formal:formal.checked});modal.close();}</script>`;
      break;
    default:
      return route.fulfill({ status: 404, body: 'fixture route not found' });
  }
  return route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: head + body,
  });
}
await serve(root, (job, begin) =>
  runBrowserJob(root, job, begin, async (dir) => {
    const context = await launchProfile(dir);
    const session = await context.browser().newBrowserCDPSession();
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const pid = processInfo.find((p) => p.type === 'browser').id;
    await appendFile(join(root, 'agent-pids'), String(pid) + '\n');
    await session.detach();
    await context.route('**/*', fixture);
    return context;
  }).catch(async (e) => {
    await writeFile(join(root, 'fixture-error.txt'), String(e.stack));
    throw e;
  }),
);
