# 10 eSIM provider 調査 — 「入れるだけで RockstarOS が入る」を成立させる相手を探す

正本: docs/structure/03-esim.md。この task は**調べて表にする**。契約の判断は本人。

## 背景（Codex が前提にしてよいこと）
- 売るのは GB ではなく RockstarOS の回線付き利用権（月額）。
- Android で「eSIM を入れたら client が自動で入る」には、profile の access rule（ARF / BF76）に当社 client の署名証明書ハッシュが入っていること、かつ Google の carrier partner として Play 自動導入が有効なことが要る。
- iOS は universal link（`https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$<SM-DP+>$<matching-id>`）でワンタップ導入。アプリ内発行（CTCellularPlanProvisioning）は Apple の carrier entitlement が要る。
- 現行コードは esim-go（lib/esimgo-*.ts）。再販 API なので ARF は通常触れない。

## やること
1. `docs/esim/provider-comparison.md` を作る。候補（最低 8 社）: 日本 IIJ（自社 SM-DP+、フルMVNO）、SORACOM、NTT docomo / KDDI の MVNE 窓口、楽天の MVNE、海外 1GLOBAL（旧 Truphone）、Telna、Kigen、Thales（SM-DP+ ベンダ）、Airalo/esim-go（比較用）。列: 自社 SM-DP+ か / ARF(BF76) に顧客証明書を入れられるか / 私設 APN / 日米両方で発行できるか / 月額の仕組み（Stripe 連携か carrier billing か）/ 最小ロット / Apple・Google partner 実績 / 公開資料 URL / 不明点。
2. `docs/esim/rfq-questionnaire.md`: 本人が送る質問票（日英）。質問は 03-esim.md §6-2 の 5 点＋「音声番号なしのデータ専用 profile 可否」「profile の再発行・機種変更時の移行手順」「EID/ICCID を当社 API に webhook で通知できるか」「解約・未払い時の回線停止 API」。
3. `docs/esim/regulatory-notes.md`: 日本（届出電気通信事業者）、米国（FCC MVNO 登録、CPNI、USF）、EU（必要なら）。各 1 段落、根拠 URL 付き。**法的助言ではなく論点整理**と冒頭に書く。
4. Google carrier partner（Play の carrier app 自動導入）と Apple carrier entitlement の申請入口・条件を `docs/esim/platform-partner-programs.md` に。
5. 結果を 03-esim.md §3 の表に「現状」として 1 行ずつ反映。

## 合格条件
- 4 ファイルがあり、各行に出典 URL。
- 「ARF に当社証明書を入れられる」と明記できる候補が 2 社以上見つかる（見つからなければ「見つからない」と書き、次善策＝iOS 同様の手動導入を提案）。

## やらないこと
- 契約・申込・問い合わせ送信（本人がやる）。価格の決定。
