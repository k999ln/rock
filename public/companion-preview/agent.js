// Bounded, session-only companion agent. No model, network, storage, or external tools.
(function (root) {
  class CompanionAgent {
    constructor() { this.running = false; this.game = null; this.used = new Set(); this.draft = null; }
    start() { this.running = true; return { event: 'START', detail: '端末内の限定エージェントを起動' }; }
    stop() { this.running = false; this.game = null; this.used.clear(); this.draft = null; return { event: 'STOP', detail: '会話中の作業と下書きを破棄' }; }
    dispatch(raw, { mode = 'commute', offline = false } = {}) {
      const text = String(raw || '').trim();
      if (!this.running) return { event: 'BLOCK', steps: ['起動待ち'], reply: '先に「エージェントを起動」を押してね。' };
      if (mode === 'school') return { event: 'BLOCK', steps: ['学校モードを確認', '会話を停止'], reply: '学校モードでは会話を止めています。' };
      if (!text) return { event: 'BLOCK', steps: ['入力を確認'], reply: '何か入力してね。' };
      if (/迷|こわ|怖|助け|困っ|危な|不審/.test(text)) {
        this.game = null;
        return { event: 'SAFETY', steps: ['安全の相談を優先', '近くの大人へ案内'], reply: '安全な場所へ移動して、近くの信頼できる大人に声をかけてね。危険が迫っていたら現地の緊急通報を使ってね。このPixel試作は防犯機器ではなく、家族への通知もできません。' };
      }
      if (/やめ|終了|ストップ|取り消し/.test(text)) {
        this.game = null; this.draft = null;
        return { event: 'CANCEL', steps: ['進行中の遊び・下書きを破棄'], reply: 'いまの遊びと伝言の下書きをやめたよ。' };
      }
      if (/しりとり/.test(text)) {
        this.game = { type: 'shiritori', next: 'ご' }; this.used = new Set(['りんご']);
        return { event: 'GAME', steps: ['しりとりを開始', '次の音を保存'], reply: 'しりとりを始めよう。ぼくは「りんご」！ 「ご」から始まる言葉を言ってね。' };
      }
      if (this.game?.type === 'shiritori') {
        const word = text.replace(/[！!。．\s]/g, '');
        if (word === 'ヒント') return { event: 'GAME', steps: ['しりとりのヒント'], reply: '「ごりら」はどう？ 「ご」から始まる言葉を入力してね。' };
        if (!word.startsWith(this.game.next)) return { event: 'GAME', steps: ['先頭の音を確認'], reply: 'いまは「' + this.game.next + '」からだよ。もう一度！' };
        if (this.used.has(word)) return { event: 'GAME', steps: ['使った言葉を確認'], reply: 'その言葉はもう使ったよ。別の「' + this.game.next + '」を考えてね。' };
        if (word.endsWith('ん')) { this.game = null; return { event: 'GAME_END', steps: ['最後の音を確認', '遊びを終了'], reply: '「ん」で終わったから、ここでおしまい。また遊ぼう！' }; }
        this.used.add(word);
        // Only known words receive a safe, prewritten continuation; unknown words are not invented.
        const answers = { ご: 'ごりら', ら: 'らっぱ', ぱ: 'ぱんだ', だ: 'だるま', ま: 'まくら' };
        const last = [...word].at(-1);
        const answer = answers[last];
        if (!answer || this.used.has(answer)) { this.game = null; return { event: 'GAME_END', steps: ['言葉を記録', '続きの候補なし'], reply: '「' + word + '」だね！ ぼくの言葉が見つからないから、きみの勝ち！' }; }
        this.used.add(answer); this.game.next = [...answer].at(-1);
        return { event: 'GAME', steps: ['言葉を記録', '次の言葉を選ぶ', '次の音を保存'], reply: '「' + word + '」だね。ぼくは「' + answer + '」！ 次は「' + this.game.next + '」から。' };
      }
      if (/伝言|伝え|迎え|連絡/.test(text)) {
        this.draft = text;
        return { event: 'DRAFT', steps: ['伝言の下書きを作成', '送信先・通知サービス未接続を確認', '送信せず待機'], reply: '伝言の下書きだけ作ったよ。「' + text.slice(0, 60) + '」。保護者への送信はできません。画面を閉じるか「やめ」で破棄します。' };
      }
      if (/帰る時間|予定|持ち物/.test(text)) return { event: 'UNCONFIGURED', steps: ['保護者設定を確認', '未登録'], reply: '保護者が設定した予定はまだありません。時間や持ち物を推測して答えることはしません。' };
      if (/なぞなぞ|クイズ/.test(text)) return { event: 'PLAY', steps: ['安全な遊びを選択'], reply: 'なぞなぞ。雨の日に開いて使うもの、なあに？ 答えは「傘」だよ。' };
      if (/何ができ|なにができ|できること/.test(text)) return { event: 'CAPABILITIES', steps: ['利用可能な機能を確認'], reply: '今できるのは、しりとり、なぞなぞ、予定の未登録確認、送信しない伝言の下書き、安全の案内だよ。自由会話のAI、保護者通知、本物の防犯ベルはまだないよ。' };
      return { event: offline ? 'OFFLINE_UNKNOWN' : 'MODEL_UNAVAILABLE', steps: ['質問を分類', '対応する限定機能なし', 'モデル未接続'], reply: 'その質問にはまだ答えられないよ。自由会話のAIは未接続です。「何ができる？」と聞いてね。' };
    }
  }
  root.CompanionAgent = CompanionAgent;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CompanionAgent };
})(typeof window === 'undefined' ? globalThis : window);
