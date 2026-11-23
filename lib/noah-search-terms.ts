/**
 * Agent の検索語の読み方。
 *
 * 一覧の名前と説明は、ほとんど英語（MCP Registry・GitHub・Hugging Face から集めた物）。前は、入れた語を丸ごと 1 つの文字列として
 * 探していたので、「画像」「翻訳」「要約」のような日本語では 1 件も出なかった（2026-11-22 の本番で確かめた。英語の image は 97 件）。
 *
 * ここでは:
 * 1. 語を空白（全角も）で分け、全部の語が当たる物だけを出す（語の順番や、間に入る言葉に左右されない）。
 * 2. よく頼まれる日本語の語を、英語の語幹にも広げる（「画像」→ image・photo・picture）。元の日本語でも当てる。
 * 3. 空白の無い日本語（「画像生成」「猫の画像」）は、辞書の語を長い順に拾う。拾えた時は、助詞などの残りを捨てる。
 * 4. 英語の語は、簡単な語尾を落とした語幹で当てる（translation・translator・translate は同じ物に当たる）。
 */

/** 日本語の語 → 当てる英語の語幹（小文字）。1 語に最大 6 個まで。 */
export const NOAH_SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  画像: ['image', 'photo', 'picture'],
  写真: ['photo', 'image', 'picture'],
  イラスト: ['illustrat', 'image', 'draw'],
  絵: ['draw', 'paint', 'image', 'art'],
  ロゴ: ['logo'],
  デザイン: ['design'],
  動画: ['video', 'movie', 'clip'],
  映像: ['video', 'footage'],
  音楽: ['music', 'song', 'audio'],
  曲: ['music', 'song'],
  音声: ['audio', 'voice', 'speech'],
  声: ['voice', 'speech'],
  文字起こし: ['transcri', 'speech-to-text', 'speech to text'],
  読み上げ: ['text-to-speech', 'tts', 'speech'],
  翻訳: ['translat', 'locali'],
  通訳: ['translat', 'interpret'],
  要約: ['summar', 'tldr', 'digest'],
  まとめ: ['summar', 'digest'],
  文章: ['text', 'writ', 'copy'],
  作文: ['writ', 'essay'],
  校正: ['proofread', 'grammar'],
  生成: ['generat', 'creat'],
  作成: ['creat', 'generat', 'build'],
  作る: ['creat', 'generat', 'build', 'make'],
  編集: ['edit'],
  変換: ['convert', 'transform'],
  検索: ['search', 'find', 'lookup'],
  調べ: ['search', 'research', 'lookup'],
  調査: ['research', 'investigat', 'analy'],
  分析: ['analy', 'insight'],
  データ: ['data'],
  グラフ: ['chart', 'graph', 'plot'],
  表: ['table', 'spreadsheet'],
  エクセル: ['excel', 'spreadsheet', 'xlsx'],
  スプレッドシート: ['spreadsheet', 'sheet'],
  ファイル: ['file'],
  文書: ['document', 'doc'],
  論文: ['paper', 'arxiv', 'research', 'scholar'],
  ニュース: ['news'],
  記事: ['article', 'blog', 'post'],
  ブログ: ['blog'],
  投稿: ['post', 'publish', 'social'],
  メール: ['email', 'mail', 'gmail'],
  予定: ['calendar', 'schedul', 'event'],
  カレンダー: ['calendar'],
  会議: ['meeting', 'minutes'],
  議事録: ['meeting', 'minutes', 'transcri'],
  地図: ['map', 'location', 'geo'],
  場所: ['location', 'place', 'map'],
  天気: ['weather', 'forecast'],
  旅行: ['travel', 'trip', 'flight', 'hotel'],
  ホテル: ['hotel'],
  飛行機: ['flight'],
  料理: ['recipe', 'cooking', 'meal'],
  レシピ: ['recipe'],
  健康: ['health', 'fitness', 'medical'],
  医療: ['medical', 'health', 'clinic'],
  お金: ['money', 'financ', 'payment'],
  家計: ['budget', 'expense', 'financ'],
  税: ['tax'],
  税金: ['tax'],
  会計: ['accounting', 'bookkeep', 'invoice'],
  請求書: ['invoice', 'billing'],
  株: ['stock', 'equity', 'equities'],
  投資: ['invest', 'stock', 'portfolio'],
  仮想通貨: ['crypto', 'bitcoin', 'blockchain'],
  暗号資産: ['crypto', 'bitcoin', 'blockchain'],
  法律: ['legal', 'law'],
  契約: ['contract', 'agreement'],
  不動産: ['real estate', 'property', 'realty'],
  仕事: ['job', 'career', 'freelanc', 'gig'],
  求人: ['job', 'hiring', 'recruit'],
  履歴書: ['resume', 'curriculum vitae'],
  営業: ['sales', 'lead', 'crm'],
  広告: ['advertis', 'marketing', 'ads'],
  マーケティング: ['marketing', 'seo'],
  勉強: ['learn', 'study', 'tutor', 'educat'],
  学習: ['learn', 'study', 'educat'],
  英語: ['english'],
  日本語: ['japanese'],
  数学: ['math'],
  プログラミング: ['code', 'program', 'develop'],
  コード: ['code'],
  ウェブ: ['web', 'site'],
  サイト: ['site', 'web'],
  アプリ: ['app'],
  ゲーム: ['game'],
  チャット: ['chat'],
  ショッピング: ['shop', 'ecommerce', 'product'],
  買い物: ['shop', 'buy', 'product'],
  商品: ['product', 'shop'],
  車: ['car', 'vehicle', 'auto'],
  スポーツ: ['sport'],
  ペット: ['pet', 'dog', 'cat'],
  犬: ['dog'],
  猫: ['cat'],
  // 2026-11-23（task 128 の D11）: よく頼まれる仕事の語 70 個を 1,957 件の一覧に当て、0 件だった語を足した。
  プレゼン: ['presentation', 'slide', 'deck', 'powerpoint', 'pptx'],
  スライド: ['slide', 'deck', 'powerpoint', 'pptx', 'presentation'],
  予約: ['booking', 'reserv', 'appointment', 'schedul'],
  価格: ['price', 'pricing', 'cost'],
  値段: ['price', 'pricing', 'cost'],
  比較: ['compar', 'versus'],
  宿題: ['homework', 'assignment', 'tutor'],
  sns: ['social', 'twitter', 'instagram', 'tiktok', 'linkedin', 'bluesky'],
  運動: ['exercise', 'fitness', 'workout'],
  ダイエット: ['diet', 'nutrition', 'calorie', 'fitness'],
  タスク: ['task', 'todo', 'to-do'],
  メモ: ['note', 'notion', 'obsidian'],
  日記: ['journal', 'diary'],
  カスタマーサポート: ['customer support', 'helpdesk', 'help desk', 'customer service', 'support ticket'],
  電話: ['phone', 'telephon', 'voip', 'sms'],
  占い: ['tarot', 'astrolog', 'horoscope'],
};

/** 語の間の残り。辞書の語を拾えた時、これだけで出来た残りは捨てる。 */
const PARTICLES = /^(?:の|を|に|で|と|が|は|も|へ|や|から|まで|より|する|して|したい|したり|させる|できる|ため|用|向け|的|系|な|っぽい|みたいな)+$/;
const JAPANESE = /[぀-ヿ㐀-鿿]/;
const SUFFIXES = ['izations', 'ization', 'ations', 'ation', 'ators', 'ator', 'izers', 'izer', 'izes', 'ize', 'ings', 'ing', 'ions', 'ion', 'ates', 'ate', 'ers', 'er', 'ies', 'es', 'ed', 's', 'y'];
const KEYS = Object.keys(NOAH_SEARCH_SYNONYMS).sort((a, b) => b.length - a.length);

/** 英語の語を、簡単な語尾を落とした語幹にする（残りが 4 文字以上の時だけ）。 */
export function noahSearchStem(word: string): string {
  const lower = word.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(lower)) return lower;
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 4) return lower.slice(0, -suffix.length);
  }
  return lower;
}

/** 空白の無い日本語の語から、辞書の語を長い順に拾う。拾えた語と、残り（拾えなかった部分）を返す。 */
function splitJapanese(token: string): { keys: string[]; rest: string[] } {
  const keys: string[] = [], rest: string[] = [];
  let buffer = '';
  for (let i = 0; i < token.length;) {
    const key = KEYS.find((k) => token.startsWith(k, i));
    if (key) {
      if (buffer) { rest.push(buffer); buffer = ''; }
      keys.push(key); i += key.length;
    } else { buffer += token[i]; i++; }
  }
  if (buffer) rest.push(buffer);
  return { keys, rest };
}

/**
 * 検索語を「どれか 1 つが当たればよい語の組」の並びにする。並びの全部の組が当たる物を出す。
 * 空の語・長すぎる語は捨てる。組は 8 個まで（長い文を貼られても重くしない）。
 */
export function noahSearchTerms(query: string): string[][] {
  const groups: string[][] = [];
  for (const raw of query.trim().toLowerCase().split(/[\s　、,，。・/]+/u)) {
    const token = raw.trim();
    if (!token || token.length > 60) continue;
    if (Object.hasOwn(NOAH_SEARCH_SYNONYMS, token)) { groups.push([token, ...NOAH_SEARCH_SYNONYMS[token]]); continue; }
    if (JAPANESE.test(token)) {
      const { keys, rest } = splitJapanese(token);
      if (keys.length) {
        // 辞書の語を拾えた時は、その語だけで探す。残り（「の」「したい」や、辞書に無い語）で 0 件にしない。
        for (const key of keys) groups.push([key, ...NOAH_SEARCH_SYNONYMS[key]]);
        continue;
      }
      groups.push(rest.filter((part) => !PARTICLES.test(part)).length ? [token] : []);
      continue;
    }
    const stem = noahSearchStem(token);
    groups.push(stem === token ? [token] : [token, stem]);
  }
  return groups.slice(0, 8);
}

/**
 * 組の並びから、文に当たるかを返す関数を作る（正規表現は 1 回だけ作る）。文は小文字にして渡す。
 * 英数字だけの短い語は、語の切れ目で当てる: 3 文字までは語全体（tax は syntax に当てない。cat は catalog に当てない）、
 * 5 文字までは語の頭（map は roadmap に当てない）。それより長い語と日本語は、文の中のどこでも当てる。
 */
export function noahSearchMatcher(groups: string[][]): (text: string) => boolean {
  const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compiled = groups.filter((group) => group.length).map((group) => group.map((word) => {
    if (!/^[a-z0-9 -]+$/.test(word) || word.length > 5) return (text: string) => text.includes(word);
    const pattern = word.length <= 3 ? new RegExp(`(^|[^a-z0-9])${escape(word)}(s|es)?([^a-z0-9]|$)`) : new RegExp(`(^|[^a-z0-9])${escape(word)}`);
    return (text: string) => pattern.test(text);
  }));
  return (text) => compiled.every((group) => group.some((test) => test(text)));
}
