const captions = `WEBVTT

00:00:00.000 --> 00:00:05.500
Noahの公開カタログで「CowAgent」と検索します。

00:00:05.500 --> 00:00:08.500
詳細を開いて、配布元や接続条件を確認します。

00:00:08.500 --> 00:00:14.000
「Noahで接続して使う」から接続画面へ進みます。

00:00:14.000 --> 00:00:18.000
実行にはサインインとApple Silicon Macでの設定が必要です。
`;

export function GET() {
  return new Response(captions, {
    headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
  });
}
