type ResultEvent = { results: ArrayLike<{ isFinal: boolean; length: number; [index: number]: { transcript: string } }> };
export type MiiSpeechRecognition = {
  processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: ResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; abort: () => void;
};
export type MiiSpeechConstructor = { new(): MiiSpeechRecognition; available?: (options: { langs: string[]; processLocally: true }) => Promise<string> };
/** Explicit-start, installed local language only. Never falls back to a server or downloads a model. */
export function createMiiLocalSpeech(ctor: MiiSpeechConstructor | undefined, accept: (text: string) => void, status: (value: string) => void) {
  let generation = 0, instance: MiiSpeechRecognition | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  function stop() { generation++; clearTimeout(timer); const old = instance; instance = null;
    if (old) { old.onresult = null; old.onerror = null; old.onend = null; try { old.abort(); } catch { /* Already stopped. */ } } }
  return { stop, async start() {
    stop(); const epoch = generation;
    status('端末内音声を確認しています。');
    try {
      if (!ctor?.available) throw new Error('unavailable');
      timer = setTimeout(() => { if (epoch === generation) { stop(); status('端末内音声の確認が時間切れになりました。文字入力を使えます。'); } }, 5000);
      const available = await ctor.available({ langs: ['ja-JP'], processLocally: true });
      if (epoch !== generation) return;
      clearTimeout(timer);
      if (available !== 'available') throw new Error('unavailable');
      const recognition = new ctor();
      if (!('processLocally' in recognition)) throw new Error('unavailable');
      recognition.processLocally = true;
      if (recognition.processLocally !== true) throw new Error('unavailable');
      instance = recognition; recognition.lang = 'ja-JP'; recognition.continuous = false;
      recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onresult = event => {
        if (generation !== epoch || instance !== recognition) return;
        const results = Array.from(event.results);
        if (results.length !== 1 || !results[0].isFinal || results[0].length !== 1) { stop(); status('声を一つに確定できません。文字で確認してください。'); return; }
        const text = results[0][0].transcript;
        stop(); if (typeof text !== 'string' || !text.trim() || text.length > 1200) { status('声を確認できません。'); return; }
        accept(text.trim()); status('聞き取った内容を確認してください。まだ保存していません。');
      };
      recognition.onerror = () => { if (generation === epoch) { stop(); status('端末内音声を利用できません。文字で入力できます。'); } };
      recognition.onend = () => { if (generation === epoch) { stop(); status('音声入力を終了しました。'); } };
      timer = setTimeout(() => { if (generation === epoch) { stop(); status('音声入力の時間上限で停止しました。'); } }, 15000);
      recognition.start(); status('聞いています。15秒で停止します。');
    } catch { if (epoch === generation) { stop(); status('日本語の端末内音声が未対応か未準備です。文字入力を使えます。外部認識へは切り替えません。'); } }
  } };
}
