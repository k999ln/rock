export type LocalSpeech = {
  processLocally: boolean; lang: string; continuous: boolean; interimResults: boolean;
  onresult: null | ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void);
  onerror: null | ((event: { error: string }) => void); onend: null | (() => void);
  start(): void; abort(): void;
};
export type LocalSpeechConstructor = { new(): LocalSpeech; available?: (options: { langs: string[]; processLocally: true }) => Promise<string> };
/** Never uses remote recognition or installs a language pack implicitly. */
export async function startMiniLocalSpeech(Recognizer: LocalSpeechConstructor | undefined, signal: AbortSignal, heard: (text: string) => void, failed: (message: string) => void) {
  if (!Recognizer?.available) throw Error('このブラウザーでは端末内の音声認識を確認できません。音声の試験はまだ始められません。');
  const engine = new Recognizer();
  if (typeof (engine as Partial<LocalSpeech>).processLocally !== 'boolean') { engine.abort(); throw Error('音声を端末内だけで処理する機能がありません。外部の音声認識には切り替えません。'); }
  engine.processLocally = true; engine.lang = 'ja-JP'; engine.continuous = true; engine.interimResults = false;
  let cancelled = signal.aborted, restart: ReturnType<typeof setTimeout> | undefined, lease: ReturnType<typeof setTimeout> | undefined;
  const close = () => { if (cancelled) return; cancelled = true; clearTimeout(restart); clearTimeout(lease); signal.removeEventListener('abort', close); engine.onresult = null; engine.onerror = null; engine.onend = null; engine.abort(); };
  if (cancelled) { engine.abort(); return close; }
  signal.addEventListener('abort', close, { once: true });
  try {
    const availability = await Promise.race([Recognizer.available({ langs: ['ja-JP'], processLocally: true }), new Promise<never>((_, reject) => { restart = setTimeout(() => reject(Error('音声認識の準備を確認できません。もう一度試してください。')), 8000); })]);
    clearTimeout(restart);
    if (cancelled) return close;
    if (availability !== 'available') throw Error('日本語の端末内音声認識が未準備です。音声用データの追加が必要ですが、自動ダウンロードはしていません。');
    const endWith = (message: string) => { close(); failed(message); };
    engine.onresult = event => { if (!cancelled) for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) heard(event.results[i][0].transcript); };
    engine.onerror = () => endWith('音声入力が途切れました。マイクを止め、仕事の停止を確認しています。');
    engine.onend = () => { if (!cancelled) restart = setTimeout(() => { if (!cancelled) { try { engine.start(); } catch { endWith('音声入力を再開できません。待ち受けを開始し直してください。'); } } }, 500); };
    lease = setTimeout(() => endWith('試験の2分が経過したため、マイクと仕事を止めます。成果は残ります。'), 120_000);
    engine.start(); return close;
  } catch (error) { close(); throw Error(error instanceof Error && /[ぁ-んァ-ヶ一-龠]/u.test(error.message) ? error.message : 'マイクの許可か、端末内音声認識の準備を確認できません。許可と対応状況を確認して、もう一度試してください。'); }
}
