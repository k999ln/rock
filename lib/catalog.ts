export type Automation = {
  id: string; name: string; category: string; description: string;
  source: string; license: string; licenseUrl: string; color: string;
  status: 'candidate' | 'pending'; environment: string; cost: string;
  steps: string[]; note: string;
};
export const catalog: Automation[] = [
  {id:'coconala',name:'ココナラ制作サポート',category:'制作・納品支援',description:'原稿づくりから納品準備まで。最初の無料配布ツールとして準備しています。',source:'https://coconala.com/',license:'配布権限を確認予定',licenseUrl:'https://coconala.com/pages/terms_user',color:'green',status:'pending',environment:'ツール本体の確認後に案内',cost:'導入費0円を予定。稼働費用は本体確認後に案内。',steps:['元ツール・配布ライセンスの確認を待つ','本人のココナラアカウントで必要な登録を行う','規約で許可された制作支援の範囲を確認する','本体公開後に導入し、本人が内容を確認して納品する'],note:'元ツールはまだ提供されていません。サイトへの自動ログイン・送信・売上回収は実装していません。'},
  {id:'faster-whisper',name:'faster-whisper',category:'文字起こし',description:'音声から、編集できるテキストへ。PCで使える文字起こしエンジン。',source:'https://github.com/SYSTRAN/faster-whisper',license:'MIT',licenseUrl:'https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE',color:'orange',status:'candidate',environment:'PC / Python。CPUまたは対応GPU',cost:'モデルの初回ダウンロードで通信量が増えます。実行中はPCの電力を使用。',steps:['公式READMEでOS・Python・ハードウェア要件を確認する','音声を扱う権限とモデルの利用条件を確認する','CodexでREADMEに沿ってローカル環境を準備する','短い音声で試し、誤変換を確認してから納品する'],note:'OSSの導入候補です。LOOPからの自動実行や収益連携は未対応です。'},
  {id:'transformers-js',name:'Transformers.js',category:'ブラウザAI',description:'ブラウザでモデルを実行。分類・要約などのワークフローの土台に。',source:'https://github.com/huggingface/transformers.js',license:'Apache-2.0',licenseUrl:'https://github.com/huggingface/transformers.js/blob/main/LICENSE',color:'blue',status:'candidate',environment:'対応ブラウザ / JavaScript・WebGPU等',cost:'モデルをダウンロードします。対応状況とメモリ・通信量はモデルごとに異なります。',steps:['公式READMEで対象タスクとブラウザ対応を確認する','使用モデルのカードとライセンスを個別に確認する','Codexで最小のサンプルを準備する','小さな入力で結果・処理時間・端末負荷を確認する'],note:'ライブラリのライセンスとモデルのライセンスは別です。モデルを自動配布・実行しません。'},
  {id:'playwright',name:'Playwright',category:'ブラウザ操作',description:'許可されたWeb操作を再現。確認作業や繰り返しのテストを効率化。',source:'https://github.com/microsoft/playwright',license:'Apache-2.0',licenseUrl:'https://github.com/microsoft/playwright/blob/main/LICENSE',color:'pink',status:'candidate',environment:'PC / Node.js・対応ブラウザ',cost:'ブラウザのダウンロードとページ読込で通信量が増えます。実行中はPCの電力を使用。',steps:['操作先の規約と自分の操作権限を確認する','公式READMEに沿ってCodexで環境を準備する','自分のテスト環境で操作を検証する','送信・購入等は本人が内容と実行を確認する'],note:'ココナラ等の第三者サイトの無人操作を許諾するものではありません。'}
];
