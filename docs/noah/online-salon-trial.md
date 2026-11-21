# オンラインサロンでNoahを試す

## 100人のスマホ試用・今回の配布文（2026-11-22）

> Agentを探して、仕事を頼んで、結果まで受け取れる「Noah」を作っています。まず100人に試してもらい、迷うところや使いづらいところを直したいです。
>
> スマホで https://avoado.si/noah を開き、下の「Agent」から選ぶ → 仕事を頼む → 「成果」で結果を開く、の順です。閲覧は登録不要。仕事の保存にはサインインが必要で、外部サービスの登録が必要な場合は画面で案内します。
>
> 試したら「成果まで開けた」か「ここで止まった」を教えてください。結果の内容やパスワードをコメントに載せる必要はありません。

運営は最初の10人の到達を見て、順に100人へ案内する。投稿・招待の送信はまだしていない。現時点で任意のAgentがスマホだけで動くという広告にしない。外部登録の本番一周はAgentboard1件を検証し、本人から実スマホのAgent実行/成果表示の報告を受けた。Agentboardは技術確認用の接続先で、サロン向けの主な便益として推さない。

Agentboardの登録上限20件/IP/時、未設定のブラウザ型登録、別利用者の受入範囲は[運用仕様14章](spec-97-launch-ops.md)を参照。下記は既存のMac用途向け別案内で、今回のスマホ試用にMac導入は求めない。


[投稿に添付する動画をダウンロード（MP4・18秒・約1.5 MB）](https://raw.githubusercontent.com/k999ln/rock/main/docs/assets/readme/noah-first-agent.mp4)。縦長（4:5）で、音を消したまま見られます。動画を添付し、以下の本文をコピーしてください。

## CowAgentで会議メモを整理する・投稿本文

会議のメモを、次の打ち合わせまでに3行にまとめたい。そんなときに文章を扱えるAgentを、Noahで探してみませんか？

動画に出てくるのは「CowAgent」です。スマホで下のリンクを開き、検索欄に `CowAgent` と入れて「詳細を見る」を押すと、どんな仕事を頼めるか、配布元や利用条件を確認できます。

自分のApple Silicon Macで試す方は「Noahで接続して使う」へ。初回はサインインして、画面の案内に沿ってMacにNoah Runnerを設定します。最初の依頼には、この短いメモをそのまま使えます。

> 次の会議メモを「決まったこと」「担当」「期限」の3行にまとめて。来月の読書会は土曜開催。案内文は佐藤さんが担当。金曜までに共有する。

NoahでAgentを試す → <https://avoado.si/noah/agents>

試した方は、この投稿のコメントでどこまで進めたか教えてください。「見つけた」「Macをつないだ」「結果を受け取った」の一言でもうれしいです。

## スマホで配布元を確かめる・操作CM

[スマホ編をダウンロード（MP4・約20秒）](https://raw.githubusercontent.com/k999ln/rock/main/docs/assets/readme/noah-cm-phone-source.mp4)。縦長の動画を添付し、次の2段落をコピーしてください。

気になるAgentが見つかったら、誰が作っているか見に行ってみよう。動画は「QwenPaw」の例です。Noahで「詳細を見る」をタップすると、費用やライセンス、その下に「配布元・出典」が並びます。作り手の名前をタップすると、GitHubの元のページに移れます。

スマホでQwenPawの詳細を開く → <https://avoado.si/noah/agents/research-ce4d82de8c3d6abcf0ee>

## 自分のMacをつなぐ準備・操作CM

[Mac編をダウンロード（MP4・約20秒）](https://raw.githubusercontent.com/k999ln/rock/main/docs/assets/readme/noah-cm-mac-runner.mp4)。縦長の動画を添付し、次の2段落をコピーしてください。

Noahで選んだAgentを自分のMacで動かしたい方へ。Apple Silicon Macで下のリンクを開き、「Mac用Noah Runnerをダウンロード」をクリック。ZIPを展開して `Install.command` を開きます。必要なソフトをそろえたら `noah doctor` で確認し、`noah pair` が表示するURLからサインインしてMacを承認してください。

自分のMacで接続手順を開く → <https://avoado.si/noah/mac>

## 最初の1,000人への配布記録

投稿後は、サロンの管理画面で確認できる投稿日時とユニーク閲覧者数を記録し、1,000人に届いたかを確かめます。延べ表示しか分からない場合や、複数のサロンで同じ人が見た可能性がある場合は「延べ表示」として記録します。Agentが動いたかは「結果を受け取った」という任意の報告を数えます。リンクを開いただけの人も含む閲覧数とは分けて扱います。

## YouTubeで検索から来た人に案内する

**動画タイトル**

CowAgentをMacで試す準備｜Noahで配布元と接続条件を確認

**動画の説明文**

会議メモをAgentに整理してもらう前に、何を確認すればいいでしょうか。NoahでCowAgentを探し、配布元や利用条件を見て、接続画面へ進むところまでを18秒で紹介します。実行にはサインインとApple Silicon MacへのNoah Runnerの設定が必要です。操作ガイドはチャンネルプロフィールから開けます。

ショート動画には先頭の18秒の既存素材を使い、チャンネルプロフィールに[操作ガイドのキャンペーンURL](https://avoado.si/noah/guides/cowagent-mac?utm_source=youtube&utm_medium=organic_video&utm_campaign=noah_cowagent_mac)を設定する。ショートの説明欄のURLはクリックできない。[YouTubeのリンク仕様](https://support.google.com/youtube/answer/13748639?hl=ja)

配備後、未ログインで操作ガイド・CowAgent詳細・Mac接続案内を開く。Noahの公開URLは[サイトマップ](https://avoado.si/noah/sitemap.xml)で確認できる。投稿前と7・14・28日後に「CowAgent Mac 使い方」「Apple Silicon Mac で Agent を動かす」を同じ地域・端末条件で検索し、掲載位置とYouTube Studioで確認できるGoogle検索由来の外部流入を記録する。接続と初回成果は、出所を確認できる範囲で任意の到達報告を数える。
