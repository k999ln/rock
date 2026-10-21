# Sky app adapter — private local pilot

正本: [Sky基盤](../../docs/sky-tools-complete-design.md#sky-foundation)。ZoomとPlannerは同じrequest/result、workflow、owner APIを使う。共通sourceは`lib/sky-app-contract.ts`と`lib/sky-app-foundation.ts`。本番公開/OS搭載の合格ではない。

## Plannerのローカル試用

1. このrepositoryの`npm run dev`でSkyを`http://localhost:3000`に起動する。
2. 既存Plannerの`public/app.js`に`planner-local.patch`のlocal-only変更を適用し、`sky-foundation-private.js`を同じpublicへコピーする。既存変更と競合する時は文脈を照合し、上書きしない。今回の指定Planner checkoutへは反映済み。
3. Plannerを`http://localhost:5173`か`http://127.0.0.1:5173`で起動する。試験専用の静的snapshotには5197も使用できる。公開hostの既存分岐は`https://avoado.si/chat`を維持する。
4. 合成目標と3つの回答で計画を作り、着手可能なAI作業の「Skyに依頼を下書きで渡す」を押す。
5. Skyで依頼を確認→0円の制限付き処理→成果確認→「Plannerへ下書きを返す」。元taskが「あなたの確認待ち」になり、自動完了/後工程解放されないことを確認する。

COOP `same-origin`により別originのopener参照が切れるため、development/loopback限定の短命受渡し窓口`/api/sky/app-lab`を使う。256bit ID、10分、最大20件、restartで消えるmemory。素材は初回POSTだけ、IDはfragmentから取り込んで消去し、pollは専用header。Plannerは結果を元task fingerprintと照合し、本人確認待ちへ戻す。account credential/permissionは共有しない。nonceは限定されたこの受渡しだけの権限で、本番本人IDではない。

本人用永続API `/api/sky/app-work` は既存owner auth・Origin・明示allowlist・保存同意が必要。secretをコード/Gitに保存しない。追加の本番環境設定、DNS、配備、公開は行っていない。準備メモはLLMや調査/制作の実行ではない。
