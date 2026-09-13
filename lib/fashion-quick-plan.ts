export type FashionQuickPlan = {
  campaignTitle: string;
  launchLine: string;
  market: string;
  audience: string;
  positioning: string;
  imageBrief: string;
  videoBrief: string;
  caption: string;
  dmReply: string;
  orderFields: string[];
  contentWeek: Array<{
    day: string;
    format: string;
    theme: string;
  }>;
  producerFlow: Array<{
    label: string;
    detail: string;
  }>;
  decisionsNeeded: string[];
  approvalBoundary: string;
};

type QuickPlanInput = {
  brandDirection: string;
  productDesign: string;
  region?: string;
};

function clean(value: string, label: string, max = 1200) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length < 2) throw new Error(`${label}を入力してください。`);
  return normalized.slice(0, max);
}

function short(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function buildFashionQuickPlan({
  brandDirection,
  productDesign,
  region = '日本',
}: QuickPlanInput): FashionQuickPlan {
  const direction = clean(brandDirection, 'ブランド方針');
  const product = clean(productDesign, '商品デザイン');
  const market = clean(region || '日本を起点にオンライン', '販売地域', 80);
  const context = `${direction} ${product}`.toLowerCase();

  const isLuxury = /高級|ラグジュアリー|luxury|静か|無機質|上質/.test(
    context,
  );
  const isStreet = /ストリート|street|y2k|スケート|ヒップホップ/.test(
    context,
  );
  const isSustainable =
    /サステナブル|sustainable|環境|再生|アップサイクル/.test(context);
  const isGlobal = /海外|global|英語|international/.test(
    `${market} ${context}`,
  );

  const audience = isLuxury
    ? '25〜40歳、都市部、価格より素材・設計思想・希少性を重視する層'
    : isStreet
      ? '18〜30歳、Instagramと短尺動画で新しいスタイルを探す層'
      : isSustainable
        ? '24〜45歳、生産背景と長く使える理由を確認して購入する層'
        : '20〜35歳、デザインの違いとブランドの物語で購入を決める層';

  const positioning = isLuxury
    ? '値引きではなく、素材・仕立て・受注生産の理由を静かに伝える'
    : isStreet
      ? '着用した瞬間のシルエットと、自分らしい組み合わせ方を見せる'
      : isSustainable
        ? '生産背景、素材の選択、必要な分だけ作る姿勢を具体的に見せる'
        : '商品の特徴を一つに絞り、着用場面と受注方法を分かりやすく伝える';

  const productLabel = short(product, 72);
  const directionLabel = short(direction, 90);
  const language = isGlobal ? '日本語と英語の2版' : '日本語';

  return {
    campaignTitle: isLuxury
      ? '静かな輪郭 — MADE FOR YOU'
      : isStreet
        ? 'OWN THE SHAPE'
        : isSustainable
          ? '必要な一着だけをつくる'
          : '着る人から完成する服',
    launchLine: `${short(direction, 54)}を、${short(product, 54)}で見せる。`,
    market: `${market}向け。投稿は${language}で用意し、反応の良い版へ寄せる。`,
    audience,
    positioning,
    imageBrief: `Instagram 4:5。${productLabel}を主役にする。世界観は「${directionLabel}」。背景と小物を抑え、素材と輪郭が分かる光、文字入れなし、商品仕様を勝手に変えない。`,
    videoBrief: `9:16、8秒。最初の2秒で${productLabel}の特徴を見せ、正面→ディテール→着用時の動きの3カット。落ち着いたカメラ、誇張表現なし。`,
    caption: `${productLabel}\n\n${positioning}。\n完全受注で、一点ずつ制作します。サイズ・納期・仕様はDMでご相談ください。`,
    dmReply:
      'お問い合わせありがとうございます。購入をご希望ですか、それともサイズ・素材・納期についてのご相談ですか？ ご希望商品とお届け先の国を教えてください。確認後、価格と納期をご案内します。',
    orderFields: [
      '希望商品・カラー・数量',
      'サイズ・必要な採寸',
      'カスタム内容',
      '氏名・メールアドレス',
      '配送先の国・地域',
      '希望納期と規約への同意',
    ],
    contentWeek: [
      {
        day: 'DAY 1',
        format: '4:5 CAROUSEL',
        theme: `商品の第一印象：${short(product, 46)}`,
      },
      {
        day: 'DAY 3',
        format: '9:16 REEL',
        theme: '素材・輪郭・動きを8秒で見せる',
      },
      {
        day: 'DAY 5',
        format: 'STORY',
        theme: 'サイズ・納期の質問をDMへ集める',
      },
      {
        day: 'DAY 7',
        format: '4:5 POST',
        theme: '受注生産の理由と残り枠を伝える',
      },
    ],
    producerFlow: [
      { label: 'あなた', detail: '世界観と商品を決める' },
      { label: 'AI', detail: '市場・広告・投稿・接客を組む' },
      { label: 'あなた', detail: '公開日・価格・受注上限だけ確認' },
      { label: 'Sky', detail: '承認後にMCPで運用し、反応を次案へ戻す' },
    ],
    decisionsNeeded: ['販売価格', '公開日', '受注上限'],
    approvalBoundary:
      'ここで作るのは下書きだけです。画像生成、投稿、広告出稿、DM送信、請求、返金は実行しません。',
  };
}
