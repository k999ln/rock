/* Actual Platform metadata only. The animation never authorizes an operation. */
static double draw_spider_guard(struct rock_ui *ui, double y)
{
    json_object *guard = field(ui->snapshot, "security");
    json_object *findings = field(guard, "findings");
    char caption[160];
    const unsigned ink = 0xdce7eb, blue = 0xbedce6, muted = 0x8d9fae;
    panel(ui, 32, y, 656, 454, 0x0e1520);
    text(ui, 56, y + 36, 24, 1, ink, "Spider Guard", 600);
    const char *status = string(guard, "status");
    int current = ui->connected && boolean(guard, "workerAlive") && boolean(guard, "fresh") &&
                  (!strcmp(status, "watching") || !strcmp(status, "scanning"));
    text(ui, 56, y + 69, 16, 0, current ? blue : 0xe4b18c,
         current ? "OS内の監視サービスが稼働中" : "監視状態を確認できません", 600);
    if (guard) {
        snprintf(caption, sizeof(caption), "秘密の候補 %lld  /  個人情報の候補 %lld  /  拒否 %lld",
                 (long long)json_object_get_int64(field(guard, "secretCount")),
                 (long long)json_object_get_int64(field(guard, "personalCount")),
                 (long long)json_object_get_int64(field(guard, "blocked")));
        text(ui, 56, y + 103, 15, 0, ink, caption, 600);
    } else text(ui, 56, y + 103, 15, 0, muted, "未取得の結果を安全とは表示しません。", 600);
    size_t count = array_size(findings); if (count > 3) count = 3;
    for (size_t i = 0; i < count; i++) {
        json_object *finding = array_item(findings, i);
        double row = y + 126 + i * 60;
        color(ui->cr, !strcmp(string(finding, "kind"), "secret") ? 0xcbaade : blue);
        cairo_set_line_width(ui->cr, 1);
        cairo_move_to(ui->cr, 187, row + 23); cairo_line_to(ui->cr, 229, row + 23); cairo_stroke(ui->cr);
        text(ui, 240, row + 19, 15, 1, ink, string(finding, "label"), 405);
        snprintf(caption, sizeof(caption), "%.110s : %lld", string(finding, "path"),
                 (long long)json_object_get_int64(field(finding, "line")));
        text(ui, 240, row + 40, 12, 0, muted, caption, 405);
    }
    if (!count) wrapped(ui, 235, y + 154, 415, 15, 25, muted,
                       current ? "対象ファイルの候補はありません。\n送信内容は実行の直前にも検査します。" :
                       "接続後に実際の検出結果を表示します。", 3);
    struct timespec clock;
    clock_gettime(CLOCK_MONOTONIC, &clock);
    double phase = current ? (double)clock.tv_sec + clock.tv_nsec / 1e9 : 0;
    double cx = 129 + (current ? 12 * sin(phase * .7) : 0);
    double cy = y + 213 + (current ? 39 * sin(phase * .4) : 0);
    color(ui->cr, current ? blue : muted);
    cairo_set_line_width(ui->cr, 1.7);
    for (int side = -1; side <= 1; side += 2) {
        for (int leg = 0; leg < 4; leg++) {
            double dy = (leg - 1.5) * 13;
            double stride = current ? sin(phase * 3 + leg * 1.7 + side) * 6 : 0;
            cairo_move_to(ui->cr, cx + side * 5, cy + dy * .3);
            cairo_line_to(ui->cr, cx + side * (28 + stride), cy + dy);
            cairo_line_to(ui->cr, cx + side * (46 - stride), cy + dy * 1.6 + stride);
        }
    }
    cairo_stroke(ui->cr);
    cairo_save(ui->cr); cairo_translate(ui->cr, cx, cy); cairo_scale(ui->cr, 1, 1.7);
    cairo_arc(ui->cr, 0, 0, 7, 0, 6.28318530718); cairo_stroke(ui->cr); cairo_restore(ui->cr);
    text(ui, 56, y + 342, 15, 1, ink, "送信前の検査は画面を閉じても継続", 600);
    wrapped(ui, 56, y + 359, 596, 13, 23, muted,
            "MCP・リモート実行への秘密／個人情報を検出すると送信を拒否します。\nこのOSの管理データが対象です。OS全通信や画像の監視ではありません。", 3);
    text(ui, 56, y + 430, 12, 0, boolean(guard, "coverageLimited") ? 0xe4b18c : muted,
         boolean(guard, "coverageLimited") ? "検査できない対象があります。検出ゼロは安全の保証ではありません。" :
         "値は表示しません。停止・電源OFF中は監視できません。", 600);
    return y + 474;
}
