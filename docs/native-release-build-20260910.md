# 同じsource・imageを固定するbuild入口

対象RQ09・12・16・17 / 明確な楽観主義・べき乗則 / テスト版・配布image・再開コマンドの食い違い / 既存Git archive・native回帰・Buildroot cache / [freeze工具](../scripts/freeze-native-build.py)で対応を検査 / source inventory・image triple・configのhash一致 / 8件のartifact異常系＋実build時の機械manifest。

`scripts/freeze-native-build.py`は、完了済みの実buildを一意なGit archiveとnative試験reportに結ぶ。QEMUを起動せず、D0〜D6合格、再現可能build、配布許可を宣言しない。これは過去の固定パス・固定1089件の手元freeze scriptを、今回の候補へ正しく使える入口にしたもの。

## Linux buildと固定

正本release commitの`git archive --format=tar`を、新しいLinux sourceディレクトリへ展開する。archiveのPAX commentの40桁SHA、全ファイルbytes、native試験入力の完全なinventoryが一致しなければ固定しない。既存のsource・image・保存diskを上書きしない。

```sh
python3 scripts/test-native.py --output /var/tmp/rockstaros-candidate-tests
cd systems/rock-star-os
ROCK_BUILD_DIR=/var/tmp/rockstaros-build-cache bash os/build-os.sh
```

build後、source rootから実際の値を指定する。以下のSHAと各パスは実候補のものに置き換える。最初から空だった証拠がないbuildをfreshとは記録しない。既存cacheを再利用した場合は、その元候補の40桁SHAを必ず指定する。

```sh
python3 scripts/freeze-native-build.py \
  --source-root /var/tmp/rockstaros-candidate \
  --source-archive /var/tmp/rockstaros-candidate.tar \
  --source-commit "$candidate_sha" \
  --source-report /var/tmp/rockstaros-candidate-tests/report.json \
  --build-dir /var/tmp/rockstaros-build-cache \
  --images-dir /var/tmp/rockstaros-candidate/systems/rock-star-os/artifacts/os \
  --cache-origin-commit "$cache_origin_sha"
```

出力はimageディレクトリ内の`freeze-manifest.json`（`rock-build-freeze/2`）。同名manifestの上書きを拒否し、所有者が一致した単一linkのImage/rootfs/stage0のhashを確認してread-only化する。既存`SHA256SUMS`、kernelのARM64識別子、rootfsのext4識別子、Linux/Buildroot設定とsource lockを検査する。実署名factoryと埋込source guardは既存のguest profile preflightでさらに検証する。

packagerは`source_commit`と`files_sha256`を入力候補と一致させる。`source_report_sha256`、`source_files_sha256`、`configuration_sha256`、`build_log_sha256`、build日時、compiler/QEMU版、cache originをその候補の証拠として保存する。freezeが成功しても`acceptance_D0_D6`と`qemu_boot`は`NOT_RUN`のままで、後続受入は別reportに記録する。

## 対応sourceとNOTICE

最終candidateのbuild設定でBuildrootの`legal-info`を生成し、manifest CSV・license text・対応sourceをrelease artifactにまとめる。事前準備に成功しても最終候補の法的条件を満たしたとはしない。製品licenseは未選択であり、新しいlicense条件をこのscriptで作らない。

```sh
make -C /var/tmp/rockstaros-build-cache/buildroot-2026.08 \
  O=/var/tmp/rockstaros-build-cache/output \
  BR2_EXTERNAL=/var/tmp/rockstaros-candidate/systems/rock-star-os/os/buildroot \
  legal-info
```

cacheの容量を確保する際も保存disk・source・原試験報告を消さない。今回の旧失敗build cache退避では、ホストworkへ圧縮archiveを保存して全tar memberをreadback、SHA-256を固定した後、停止・所有者を確認したそのcacheだけを削除した。成功cacheと旧b8287bcの凍結imageは保持する。

## 工具の検証

```sh
python3 scripts/tests/test-freeze-native-build.py -v
```

2026-09-10、Mac上の8件に合格。wrong commit、source改変、新sourceに対する旧test inventory、skip、image改変、hardlink、config不一致を拒否し、cache再利用をfresh buildとして報告しない。これらのsynthetic artifactは実kernel/OS imageではなく、OS受入件数に加算しない。
