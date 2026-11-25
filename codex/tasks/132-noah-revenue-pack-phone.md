# 132 本人用収益パックを携帯とPCの共通Noahへ

本人指示: 2026-11-25。収益Agentを探し一括実行、本人無料、Mac停止中も携帯で利用。別画面だったPCと携帯を共通Noahへ揃える。
対象: services/noah-revenue-runtime、toolkits/noah-revenue-pack、lib/noah-revenue-pack.ts、lib/noah-revenue-pack-proxy.ts、components/noah-revenue-pack.tsx、app/noah/revenue-pack、app/api/noah/revenue-pack、関連試験とガイド。
合格: 無認証のデータ取得0、cross-origin操作0、既存Noah cookieの外部転送0、管理者キーのWeb露出0、重複生成0、停止後の次段0。390px/1280pxで同じ入口・フォーム・成果。無料プランを実画面で確認し、Mac runner停止後のクラウド3担当完了を記録。PR前verify。
現状: クラウド実行は実測済み。共通UIと公開受入は進行中。

参照した最新チャット: `01a20699-f175-70a1-8217-301a103545ef`（PR67/68と本番のマイAgent）、`01a20bf9-77fb-75a3-9717-c089fc04cfbb`（PR63は公開待ち）、`01a20bfe-6540-7011-ad56-3851d574c630`（自動改善の実装範囲）、`01a1ffd5-a3cb-7122-a603-bd3b8ff158a9`（既存収益運用の認証切れ）。既存の収益運用Worker・保存先・登録情報はこのパックと混同しない。公開版241の独自差分を最新mainと統合し、task128と道具カタログはmainの新しい値を保全する。

検証経過: 共通UIのproxy認証4試験とパック/携帯CLI/alarm16試験は通過。390pxと1280pxのChromeで同じフォーム、架空サンプル、保存済みの3担当を表示した。全体テスト初回5489件のうち2件を修正（一般訪問時のメニュー不要通信、サブプロジェクト依存の不足）；該当23件は再検証通過。最終verifyの結果と本番受入は続けて記録する。
