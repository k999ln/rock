## 何をしたか

[task 128](../blob/main/codex/tasks/128-noah-ux-debug.md) の D7（押す所は 44px 以上）の続き。PR #37（Noah Agent Store）の行の形で、本番の avoado.si（スマホ幅・触れる画面）を測ると、次が 44px より小さかった。

| 押す所 | 前 | 後 | 規則 |
| --- | --- | --- | --- |
| 行の評価の札（「Docker 取得 …」のリンク） | 30px | 44px | `@media (max-width:680px), (hover:none) { .storeItem .sources a { min-height:44px } }` |
| 行の「その他の操作」 | 38px | 44px | 同じ所で `.storeItem .more summary { width:44px; height:44px }` |
| 詳細の「利用条件を見る」 | 40px | 44px | `.page .productPill { min-height:44px }` |

PC の幅でマウスの時は、今の行の形（30px・38px）のまま。

## 確かめた事

- 本番のページに同じ規則を足して測ると、評価の札 30→44px、「その他の操作」38→44px。
- `tests/noah-store-tap-targets.test.mjs`（2 本）。`project:check`・`design:check`: 通った。gitleaks: 0 件。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
