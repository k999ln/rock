/** Purpose suggestions are reviewed wishes, never detected hardware or execution grants. */
export const smisObjectNeeds = [
  { id: 'motion', label: '今の動きの値を読む', parts: ['動きを測る基板（先行試作はmicro:bit V2）', '固定バンドと対応する電源・準備用USBケーブル'], preparation: [] },
  { id: 'text', label: '文章を作り、保存する', parts: [], preparation: [] },
  { id: 'moisture', label: '土や物の水分を測る', parts: ['対象に合う水分センサーと接続部分'], preparation: ['水分の読み取り処理と、対象に合う測定値の確認'] },
  { id: 'temperature', label: '物や周囲の温度を測る', parts: ['測りたい場所に合う温度センサーと取り付け部分'], preparation: ['温度の読み取り処理と測定値の確認'] },
  { id: 'weight', label: '重さを測る', parts: ['重さに合う荷重センサー・読み取り基板・台座'], preparation: ['重さの読み取り処理と、基準のおもりによる調整'] },
  { id: 'image', label: 'カメラで内容を読み取る', parts: [], preparation: ['Pixelのカメラをこの仕事へつなぐ処理と、必要な画像読み取り能力の確認'] },
  { id: 'button', label: 'ボタン操作を受け取る', parts: [], preparation: ['micro:bitのボタンを読み取る処理（基板のボタンを使う場合、追加のボタン購入は不要）'] },
  { id: 'contact', label: '開閉や取り外しを見分ける', parts: ['接点スイッチ等と対象に合う台座'], preparation: ['接点の読み取り処理と、実際の開閉・着脱の確認'] },
  { id: 'sound', label: '音や声で伝える', parts: [], preparation: ['使うスピーカーの選択と音声出力処理（基板やPixelのスピーカーの利用可否を確認）'] },
  { id: 'watch', label: '見張り続け、条件で知らせる', parts: [], preparation: ['見張る間隔・終了条件・通知先の確認と、継続実行・通知の処理'] },
  { id: 'actuate', label: '物を動かす・水などを出す', parts: ['対象に合うモーターやポンプ・駆動回路・電源・取り付け部分'], preparation: ['対象専用の操作処理、本人の操作許可と独立した停止手段の確認'] },
] as const;
export type SmisObjectNeed = typeof smisObjectNeeds[number]['id'];
export type SmisPurposeReview = { request: string; needs: SmisObjectNeed[]; other: string; confirmed: boolean };
export type SmisPurposeAvailability = { motion: boolean; work: boolean };
const rules: [SmisObjectNeed, RegExp][] = [
  ['motion', /動き|動いた|傾|揺れ|加速度|motion|tilt|movement/iu],
  ['moisture', /水分|水やり|乾[い燥]|湿[り度]|moisture|dry|watering/iu],
  ['temperature', /温度|気温|熱[いく]|冷た|temperature|heat/iu],
  ['weight', /重さ|重量|体重|量[りる]|weight|weigh/iu],
  ['image', /カメラ|写真|画像|文字を読|見分け|camera|photo|image/iu],
  ['button', /ボタン|button/iu], ['sound', /音|声|読[みむ]上げ|sound|speak|audio/iu],
  ['contact', /開いた|閉じ|閉ま|開閉|取り外|外れ|接触|接点|detach|contact/iu],
  ['watch', /したら|いたら|なったら|見張|監視|通知|知らせ|継続|自動|ずっと|notify|alert|monitor|automatic/iu],
  ['actuate', /水を(?:[出流や]|あげ)|自動で水|自動水やり|ポンプ|モーター|開け|閉め|動かして|操作|pump|motor|actuat/iu],
];
/** Keyword matches only propose a checklist. Even zero/false-positive matches need owner correction. */
export function suggestSmisObjectNeeds(request: string): SmisObjectNeed[] {
  return [...new Set([...rules.filter(([, pattern]) => pattern.test(request)).map(([id]) => id), 'text' as const])];
}
export function assessSmisObjectPurpose(review: SmisPurposeReview, availability: SmisPurposeAvailability) {
  if (typeof review.request !== 'string' || !review.request.trim() || review.request.length > 300 ||
      !Array.isArray(review.needs) || review.needs.length > smisObjectNeeds.length ||
      new Set(review.needs).size !== review.needs.length || review.needs.some(id => !smisObjectNeeds.some(need => need.id === id)) ||
      typeof review.other !== 'string' || review.other.length > 200 || typeof review.confirmed !== 'boolean' ||
      typeof availability.motion !== 'boolean' || typeof availability.work !== 'boolean') throw Error('目的と必要な働きを確認してください。');
  // Every current path produces text through the existing Eve executor.
  const selected = smisObjectNeeds.filter(need => need.id === 'text' || review.needs.includes(need.id));
  const missingParts: string[] = [], preparation: string[] = [], possible: string[] = [];
  for (const need of selected) {
    if (need.id === 'motion' && availability.motion) possible.push('確認した時点の、部品の動きの値を依頼に添える');
    else if (need.id === 'text' && availability.work) possible.push('同じEveで文章の仕事を進め、成果の保存・停止へ進む');
    else {
      missingParts.push(...need.parts); preparation.push(...need.preparation);
      if (need.id === 'motion') preparation.push('基板を接続し、物への固定と値の変化を画面で確認');
      if (need.id === 'text') preparation.push('本人のEveと実行先のAIを接続し、使うAIを選択');
    }
  }
  const unclearTextOnly = review.needs.every(id => id === 'text') && !/文章|メモ|記録|要約|説明|下書き|まとめ|箇条書き|案内文|チェックリスト|write|draft|summari|note/iu.test(review.request);
  const clarification = !review.confirmed || !review.needs.length || !!review.other.trim() || unclearTextOnly;
  if (unclearTextOnly) preparation.push('この目的に必要な情報や働きを選んでください。文章だけの依頼なら、作りたい文章を具体的に書いてください。');
  if (review.other.trim()) preparation.push('追加の働き「' + review.other.trim() + '」に必要な情報・部品・処理を確認');
  const ready = !clarification && selected.length > 0 && !missingParts.length && !preparation.length;
  return { status: ready ? 'ready' as const : clarification ? 'needs-clarification' as const : 'needs-preparation' as const,
    possible, missingParts: [...new Set(missingParts)], preparation: [...new Set(preparation)],
    needs: selected.map(need => need.label), ready, physicalAcceptance: false as const, executionAuthorized: false as const };
}
/** Retain the exact goal and reviewed scope in the existing request, not a new database. */
export function smisObjectPurposeRequest(review: SmisPurposeReview, availability: SmisPurposeAvailability) {
  const plan = assessSmisObjectPurpose(review, availability);
  if (!plan.ready) throw Error('必要な部品や準備が残っています。担当の作成・実行はまだ始めません。');
  return `本人の目的：${review.request.trim()}\n確認した働き：${plan.needs.join('、')}\n目的に合う文章の本文を、そのまま読める形で作ってください。未確認の測定値や物の操作結果は書かないでください。目的の達成は本人の確認を待ってください。`;
}
