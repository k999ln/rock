# 31 hardware profile: phone / pro / pixel-native と、Buildroot・Android 系の対応表

## やること
1. `systems/rock-star-os/targets/{phone,pro,pixel-native}/README.md` を task 22 と同じ書式で作る。phone = eSIM＋client（Android carrier app / iOS PWA）。pro = GPU・local LLM 大。pixel-native = GrapheneOS 系 native（docs/native-os-integration.md）。
2. `docs/rockstaros/os-lineages.md`: 1 表。行 = Buildroot native（systems/rock-star-os/os）、Android native（android/, os/）、cloud runtime＋client（app/, lib/）。列 = どの profile で使うか、起動・更新・回復の仕組み、現状の証拠（docs/evidence のパスを 1 つだけ）。
3. `lib/rockstar-service-setup.ts` の初期設定を「account ログイン → 端末束縛 → profile 選択 → 続きを復元」の 4 段に揃え、eSIM / mii / Pro の入口を同じ関数に通す（UI は後）。
4. `npm run device-support:check`, `npm run android:architecture:check` を通す。

## 合格条件
- 4 profile の README が同じ見出し構成。os-lineages.md に「別OSを作らない」の 1 文。
