const captions = `WEBVTT

00:00:00.000 --> 00:00:05.500
Noahの公開カタログで「CowAgent」と検索します。

00:00:05.500 --> 00:00:09.500
詳細を開いて、配布元や利用条件を確認します。

00:00:09.500 --> 00:00:14.000
CowAgentは現在、紹介情報として掲載しています。

00:00:14.000 --> 00:00:18.000
成果を受け取る時は、Macをつなぎ、実行対応Agentを選びます。
`;

export function GET() {
  return new Response(captions, {
    headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
  });
}
