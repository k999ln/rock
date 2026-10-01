# 保護署名workflowの初回登録 — 実行可能性

2026-09-10 22:09 UTC。**現条件では初回の保護dispatchは未実行・実行待ち。LCH03合格ではありません。**

rootタスクの最新API観測は、公開repo `k999ln/rock`、管理権限あり、確認済み直接collaboratorは `k999ln`（231327239）、Environment `rock-release-signing`・control branch `codex/release-signing-control`・workflow `.github/workflows/release-signing.yml` は各404です。本資料はその観測を引き継いでおり、APIを再取得していません。独立reviewerと鍵の保管責任者は未決定です。

GitHubの手動実行仕様はworkflowのdefault branch配置を要求します。CLI `--ref` とREST `ref` は実行先branch/tagの選択で、未登録workflowを登録する別APIではありません。[手動実行](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[REST dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

イベント仕様には、一度実行されたworkflowはAPI/CLIから他refへdispatchできる記述もあります。しかし今回の未登録・未実行・`workflow_dispatch`専用workflowを、別eventなしで初回実行する手段にはなりません。[workflow_dispatch仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)

ユーザーは最終承認前のmain変更/mergeと一般公開を禁止しています。一方、このGitHub方式のLCH03実証にはworkflowの初回登録が必要です。**main変更をLCH03実証後だけに置くと順序が循環します。** 限定されたdefault-branch bootstrapの明示承認、または別途承認された方式/順序の変更が必要です。製品全体のmerge・公開まで承認されたと解釈しません。

公開repoではEnvironment/required reviewersの機能を利用できます。管理権限不足やプラン不足が原因とは表示しません。必要なのは所有者が指定する独立した適格Userです。自己承認・bot・仮IDで代替しません。直接collaboratorが一人という観測だけで、他の公開repo閲覧者全員が不適格と断定もしません。[Environment設定](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)、[承認者・自己承認防止](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers)

今進められる実作業はunsigned candidate/index、全asset照合、public fixture/改ざん拒否試験、最終controlコードと設定payloadの準備です。実装・試験後、**最終review済み40桁SHAで新control branchを作り、lock/admin enforcement/force-push・削除禁止/PR承認1件以上/stale破棄/last-push approval/空のbypass allowancesを設定する事前準備に、追加の具体的な安全上の問題は見つかりません。** 作成後はrefと保護設定を実取得で確認します。branch作成はdispatch登録・人の承認・本番署名の実証ではありません。[ref作成](https://docs.github.com/en/rest/git/refs#create-a-reference)、[branch protection](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection)

404を消すだけの空Environment、仮reviewer/fingerprint、試験鍵の本番登録は不要です。policy読取資格情報は最小権限で別途用意し、ローカルの広い管理資格情報をActionsへ移しません。本調査はremoteとrepoを変更していません。

## 未merge bootstrap Draftの独立確認

[Draft PR #5](https://github.com/k999ln/rock/pull/5) を読み取り確認しました。HEAD `a4411622031858d6d9684c599d857cadaf90bb94`、base/live mainとも `7cdbb5fedc86ee3978ed329d9312147d137c9199`、変更は `.github/workflows/release-signing.yml` 1件（追加95行、削除0行）のみ。APIから取得した4399bytesのSHA-256は `5a6638e70a5b04b69b396e3d38b484c590e24fb32c2a3b756bd634b70db5f336` で、既存review済みworkflowに一致します。

この未merge Draft準備に具体的な安全上の問題は見つかりません。mainを変えず、必要な限定例外をレビュー可能にしたものです。workflowは明示dispatchだけを受け付け、両jobは正確なrepo・control branch・control SHAを要求します。mainでdispatchしてもbranch条件が偽となるため、bootstrap branchにないcontrol scriptへ進みません。[jobの条件付き実行](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif)

所有者がこの限定変更を明示承認し、後日mainへmergeした後は、保護control refを指定してdispatchし、その `github.sha` をcheckoutする設計です。default branchに製品コード全体を先行mergeする必要はありません。実登録・実runのworkflow/ref/SHA・独立承認の読戻しは後日の検証であり、今回成功したとは扱いません。[ref指定](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[workflow/refのcontext](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context)

PR本文は未承認/未mergeと限定bootstrap→署名実証→残りgate→別の最終承認→製品PR #4の順序を明記しています。bootstrap後にはmainが変わるため、PR #4の最終tree/CIを再照合します。Draft自体はmerge不可で、準備した事実がmain変更・本番署名・一般公開の承認を意味しません。[Draft PR仕様](https://docs.github.com/en/pull-requests/reference/pull-requests#draft-pull-requests)
