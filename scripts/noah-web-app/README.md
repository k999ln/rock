# NoahのDock入口

`NoahWebApp.swift` は既定ブラウザで `https://avoado.si/noah` を開き、終了する小さなmacOSアプリ。通常起動で旧Mac実行器・端末登録・バックグラウンド処理を開始しない。既存の `noah://connect?agent=<id>` は公開Agent詳細へ渡す。URLの送り先は変更できない。

開発者向けビルド（Apple Silicon、macOS 14以降）:

```sh
xcrun swiftc -parse-as-library scripts/noah-web-app/NoahWebApp.swift -o /tmp/Noah -framework AppKit -target arm64-apple-macosx14.0
```

既存アプリを更新する場合は、Launch Servicesで実際のbundleを確認し、元のbundle全体をZIPへ保存してから `Contents/MacOS/Noah` を差し替え、同じidentifierでローカル署名を更新する。古い実行器・端末セッション・仕事データは削除しない。通常起動後に公開Noahが表示されることを確認する。ローカル開発用のad-hoc署名であり、一般配布用の公証済みアプリではない。
