'use strict';

const prefectures = (
  '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 ' +
  '新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 ' +
  '奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 ' +
  '長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'
).split(' ');

// Crops and contact channels from each farm's own public site, checked 2026-11-22.
const farms = [
  {
    name: '十勝美濃農場',
    pref: '北海道',
    crops: '玉ねぎ、ねぎ、かぼちゃ',
    url: 'https://minofarm.com/お問い合わせ/',
  },
  {
    name: 'RED APPLE',
    pref: '青森県',
    crops: 'りんご',
    url: 'https://www.aomori-redapple.jp/contact/',
  },
  {
    name: '小島農園',
    pref: '千葉県',
    crops: 'トマト、チンゲン菜、きゅうり、長ねぎ',
    url: 'https://kojimanouen.com/contact',
  },
  {
    name: '橋本農場',
    pref: '新潟県',
    crops: '米',
    url: 'https://hashimoto-farms.jp/contact/',
  },
  {
    name: 'はっぱ屋',
    pref: '長野県',
    crops: '葉物野菜',
    url: 'https://happaya-farm.com/business/',
  },
  {
    name: '西風農園',
    pref: '福岡県',
    crops: '季節の野菜',
    url: 'https://www.nishikaze-nouen.jp/wholesale/',
  },
];
const byId = (id) => document.getElementById(id);
const textValue = (id) => byId(id).value.trim();
const searchKey = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 96))
    .replace(/お米/g, '米')
    .replace(/玉葱|たまねぎ/g, '玉ねぎ')
    .replace(/林檎/g, 'りんご');

let selectedFarm;
let lastDraft = '';
let draftEdited = false;
function officialLink(farm) {
  const link = document.createElement('a');
  link.href = farm.url;
  link.textContent = '公式窓口を開く ↗';
  link.target = '_blank';
  link.rel = 'noreferrer';
  return link;
}
function chooseFarm(farm) {
  if (
    draftEdited &&
    !window.confirm('編集した相談文を閉じて、別の宛先を選びますか？')
  )
    return;
  if (selectedFarm !== farm || !farm) byId('budget').value = '';
  selectedFarm = farm;
  byId('farm').value = farm?.name ?? '';
  const crops = farm?.crops.split('、') ?? [];
  const query = searchKey(textValue('keyword'));
  byId('crop').value =
    crops.length === 1
      ? crops[0]
      : (crops.find((crop) => query && searchKey(crop).includes(query)) ?? '');
  byId('preview').hidden = true;
  byId('draft').value = '';
  lastDraft = '';
  draftEdited = false;
  byId('contact').removeAttribute('href');
  byId('contact').hidden = true;
  byId('status').textContent = '';
  byId('consult').hidden = false;
  byId('draft-title').focus();
}
function renderFarms() {
  const pref = textValue('pref');
  const keyword = textValue('keyword');
  const tokens = searchKey(keyword).split(/\s+/).filter(Boolean);
  const directory = new URL('https://nougyoujoshi.maff.go.jp/member/');
  if (pref) directory.searchParams.set('pref', pref);
  if (keyword) directory.searchParams.set('keyword', keyword);
  byId('directory').href = directory.href;
  const matches = farms.filter(
    (farm) =>
      (!pref || farm.pref === pref) &&
      tokens.every((word) =>
        searchKey(farm.name + ' ' + farm.crops).includes(word),
      ),
  );
  byId('matches').textContent = matches.length
    ? matches.length + '件'
    : '手元の窓口リストに該当する農園はありません。上の全国検索でほかの農園を探せます。';
  byId('farms').replaceChildren(
    ...matches.map((farm) => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = farm.name;
      const detail = document.createElement('p');
      detail.textContent = farm.pref + ' ／ ' + farm.crops;
      const actions = document.createElement('div');
      actions.className = 'links';
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.textContent = '相談文を準備';
      choose.setAttribute('aria-label', farm.name + 'への相談文を準備');
      choose.addEventListener('click', () => chooseFarm(farm));
      actions.append(choose, officialLink(farm));
      row.append(title, detail, actions);
      return row;
    }),
  );
}
function prepareDraft() {
  if (
    draftEdited &&
    !window.confirm('手で編集した相談文を、現在の条件で作り直しますか？')
  )
    return;
  const farmName = textValue('farm');
  const sender = textValue('sender');
  const budget = textValue('budget');
  const terms = [
    ['希望品目', textValue('crop')],
    ['希望数量', textValue('quantity')],
    ['希望時期・頻度', textValue('when')],
    ['受け渡し', textValue('delivery')],
    ['希望予算', budget],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => label + '　' + value);
  lastDraft = [
    farmName ? farmName + ' ご担当者様' : 'ご担当者様',
    sender ? '初めまして。' + sender + 'と申します。' : '初めまして。',
    '地域で食料を必要とされている方にお届けするため、運営予算で農産物の購入を検討しております。食用に適した余剰分や、形・大きさが規格から外れる作物がございましたら、お取引のご相談は可能でしょうか。',
    terms.join('\n'),
    'お取り扱い可能な品目・数量・出荷時期と、お見積もり（単価・消費税・送料）をお知らせいただけますと幸いです。どうぞよろしくお願いいたします。',
  ]
    .filter(Boolean)
    .join('\n\n');
  byId('draft').value = lastDraft;
  const link = byId('contact');
  link.hidden = !selectedFarm || selectedFarm.name !== farmName;
  if (link.hidden) link.removeAttribute('href');
  else link.href = selectedFarm.url;
  byId('preview').hidden = false;
  draftEdited = false;
  byId('status').textContent =
    '下書きができました。宛先と内容を確認してください。';
  byId('draft').focus();
}
for (const pref of prefectures) byId('pref').add(new Option(pref, pref));
byId('pref').addEventListener('change', renderFarms);
byId('keyword').addEventListener('input', renderFarms);
byId('other').addEventListener('click', () => chooseFarm(null));
byId('prepare').addEventListener('click', prepareDraft);
byId('terms').addEventListener('input', () => {
  if (byId('preview').hidden) return;
  if (textValue('farm') !== selectedFarm?.name) {
    byId('contact').hidden = true;
    byId('contact').removeAttribute('href');
  }
  byId('status').textContent =
    '入力条件を変更しました。下書きに反映するには「入力から下書きを作る」を押してください。';
});
byId('draft').addEventListener('input', () => {
  draftEdited = byId('draft').value !== lastDraft;
  byId('status').textContent = '';
});
byId('copy').addEventListener('click', async () => {
  const draft = byId('draft');
  try {
    await navigator.clipboard.writeText(draft.value);
    byId('status').textContent = '相談文をコピーしました。';
  } catch {
    draft.focus();
    draft.select();
    byId('status').textContent =
      '本文を選択しました。お使いの端末のコピー操作でコピーしてください。';
  }
});
renderFarms();
