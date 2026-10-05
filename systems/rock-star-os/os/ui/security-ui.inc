/* Actual Platform metadata only. Animation has no authority or IPC access. */
static int spider_guard_current(struct rock_ui *ui, json_object *guard)
{
    const char *status = string(guard, "status");
    json_object *alive = field(guard, "workerAlive"), *fresh = field(guard, "fresh");
    return ui->connected && json_object_is_type(alive, json_type_boolean) &&
           json_object_is_type(fresh, json_type_boolean) &&
           json_object_get_boolean(alive) && json_object_get_boolean(fresh) &&
           (!strcmp(status, "watching") || !strcmp(status, "scanning"));
}

int rock_ui_spider_tick(struct rock_ui *ui, int64_t now_ms)
{
    json_object *guard = field(ui->snapshot, "security");
    json_object *findings = field(guard, "findings");
    json_object *blocked = field(guard, "blocked");
    struct rock_spider_input input = {0};
    input.active = ui->page == PAGE_SYSTEM && ui->scroll > 150 && !ui->power_receipt &&
                   spider_guard_current(ui, guard);
    input.blocked_valid = blocked && json_object_is_type(blocked, json_type_int);
    input.blocked = json_object_get_int64(blocked);
    size_t count = array_size(findings); if (count > 3) count = 3;
    for (size_t i = 0; i < count; i++) {
        json_object *finding = array_item(findings, i);
        const char *id = string(finding, "id");
        if (!id[0]) break;
        uint64_t hash = UINT64_C(14695981039346656037);
        for (size_t j = 0; id[j] && j < 128; j++) { hash ^= (unsigned char)id[j]; hash *= UINT64_C(1099511628211); }
        input.ids[i] = hash;
        input.secret[i] = !strcmp(string(finding, "kind"), "secret");
        input.count++;
    }
    struct rock_spider_motion prior = ui->spider;
    rock_spider_step(&ui->spider, &input, now_ms / 1000.0);
    return ui->spider.active || prior.active != ui->spider.active;
}

static void spider_rgba(cairo_t *cr, unsigned rgb, double alpha)
{
    cairo_set_source_rgba(cr, ((rgb >> 16) & 255) / 255., ((rgb >> 8) & 255) / 255.,
                          (rgb & 255) / 255., alpha);
}

static void spider_creature(struct rock_ui *ui, double y, int current, int secret)
{
    const struct rock_spider_motion *s = &ui->spider;
    struct rock_spider_motion fallback = {0};
    if (!s->initialized) {
        const struct rock_spider_input inactive = {0};
        rock_spider_step(&fallback, &inactive, 0);
        s = &fallback;
    }
    int active = current && s->active;
    double phase = active ? s->phase : 0;
    double cx = s->x, cy = y + s->y;
    unsigned core = !active ? 0x7e94a0 : s->alert > 0 ? 0xffc278 : secret ? 0xef9acb : 0x9ce9e4;
    cairo_t *cr = ui->cr;
    cairo_save(cr);
    cairo_rectangle(cr, 52, y + 113, 174, 210); cairo_clip(cr);
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
    /* Planted feet remain in place while the body approaches the next node.
     * Alternating lifted feet follow eased trajectories, independently. */
    for (int i = 0; i < 8; i++) {
        const struct rock_spider_foot *f = &s->feet[i];
        double a = (i + .5) * 3.141592653589793 / 4;
        double fx = f->x, fy = y + f->y - f->lift;
        double bend = (i < 4 ? 1 : -1) * (11 + 2 * sin(phase * 2 + i));
        double sx = cx + 6 * cos(a), sy = cy + 6 * sin(a);
        for (int glow = 0; glow < 2; glow++) {
            spider_rgba(cr, glow ? 0xc5dced : 0x668ae5, active ? (glow ? .86 : .17) : (glow ? .45 : .06));
            cairo_set_line_width(cr, glow ? 1.05 : 4.5);
            cairo_move_to(cr, sx, sy);
            cairo_curve_to(cr, sx + (fx - sx) * .37 + bend, sy + (fy - sy) * .15,
                           fx - (fx - sx) * .16 + bend, fy - 14 * sin(a), fx, fy);
            cairo_stroke(cr);
        }
        spider_rgba(cr, active ? 0x849afa : 0x637383, active ? .82 : .45);
        cairo_set_line_width(cr, .9);
        cairo_arc(cr, fx, fy, 2.5 + f->lift * .07, 0, 6.28318530718); cairo_stroke(cr);
        cairo_arc(cr, fx, fy, .85, 0, 6.28318530718); cairo_fill(cr);
        /* A subtle joint, not a particle trail that could imply extra findings. */
        cairo_arc(cr, sx + (fx - sx) * .52 + bend * .4, sy + (fy - sy) * .5, .85, 0, 6.28318530718);
        cairo_fill(cr);
    }
    if (active && s->alert > 0) {
        spider_rgba(cr, core, s->alert * .55);
        cairo_set_line_width(cr, 1.2);
        double radius = 14 + 9 * (1 + sin(phase * 12)) / 2;
        cairo_arc(cr, cx, cy, radius, 0, 6.28318530718); cairo_stroke(cr);
    }
    cairo_save(cr); cairo_translate(cr, cx, cy); cairo_rotate(cr, s->heading * .35 + .785398163);
    spider_rgba(cr, core, .12); cairo_rectangle(cr, -11, -11, 22, 22); cairo_fill(cr);
    spider_rgba(cr, core, .82); cairo_set_line_width(cr, 1);
    cairo_rectangle(cr, -6, -6, 12, 12); cairo_stroke(cr);
    cairo_restore(cr);
    spider_rgba(cr, core, active ? .95 : .55);
    cairo_arc(cr, cx, cy, 3.4 + (active ? .4 * sin(phase * 2) : 0), 0, 6.28318530718); cairo_fill(cr);
    cairo_restore(cr);
}

static const char *spider_agent_focus(json_object *guard, int current)
{
    if (!current) return "監視状態を確認できません";
    const char *state = string(field(guard, "agent"), "state");
    if (!strcmp(state, "recent_block")) return "安全検査により送信を拒否しました";
    if (!strcmp(state, "sensitive_data_detected")) return "秘密情報・個人情報の候補を検出しています";
    if (!strcmp(state, "watching")) return "ファイルの変更と送信内容を監視しています";
    return "OS内の監視サービスが稼働中";
}

static void spider_agent_action(json_object *guard, char *caption, size_t capacity)
{
    const char *fallback = "担当：秘密情報の検出・送信前検査・送信拒否";
    snprintf(caption, capacity, "%s", fallback);
    json_object *action = field(field(guard, "agent"), "lastAction");
    json_object *kinds = field(action, "kinds"), *count = field(action, "count");
    if (strcmp(string(action, "action"), "blocked") ||
        !json_object_is_type(count, json_type_int) || json_object_get_int64(count) < 0 ||
        !json_object_is_type(kinds, json_type_array) || array_size(kinds) > 2) return;
    const char *boundary = string(action, "boundary"), *destination;
    if (!strcmp(boundary, "mcp.prepare") || !strcmp(boundary, "mcp.submit")) destination = "MCP";
    else if (!strcmp(boundary, "remote.prepare") || !strcmp(boundary, "remote.send")) destination = "リモート実行";
    else if (!strcmp(boundary, "unclassified")) destination = "外部";
    else return;
    if (json_object_get_int64(count) == 0 && array_size(kinds) == 0) {
        snprintf(caption, capacity, "直近の対応：安全検査により%s送信を拒否", destination);
        return;
    }
    if (json_object_get_int64(count) == 0 || array_size(kinds) == 0) return;
    int secret = 0, personal = 0;
    for (size_t i = 0; i < array_size(kinds); i++) {
        json_object *kind = array_item(kinds, i);
        if (!json_object_is_type(kind, json_type_string)) return;
        const char *value = json_object_get_string(kind);
        if (!strcmp(value, "secret")) secret = 1;
        else if (!strcmp(value, "personal")) personal = 1;
        else return;
    }
    const char *category = secret && personal ? "機密情報" : secret ? "秘密情報" : "個人情報";
    snprintf(caption, capacity, "直近の対応：%sを含む%s送信を拒否", category, destination);
}

static double draw_spider_guard(struct rock_ui *ui, double y)
{
    json_object *guard = field(ui->snapshot, "security");
    json_object *findings = field(guard, "findings");
    const struct rock_spider_motion *s = &ui->spider;
    char caption[160];
    const unsigned ink = 0xdce7eb, blue = 0xbedce6, muted = 0x8d9fae;
    panel(ui, 32, y, 656, 454, 0x0e1520);
    text(ui, 56, y + 36, 24, 1, ink, "SPIDER", 110);
    text(ui, 166, y + 34, 13, 0, muted, "セキュリティーエージェント", 282);
    int current = spider_guard_current(ui, guard);
    if (current && s->alert > 0)
        text(ui, 456, y + 33, 13, 1, 0xffc278, "送信をブロック", 190);
    text(ui, 56, y + 69, 16, 0, current ? blue : 0xe4b18c,
         spider_agent_focus(guard, current), 600);
    if (guard) {
        snprintf(caption, sizeof(caption), "秘密の候補 %lld  /  個人情報の候補 %lld  /  拒否 %lld",
                 (long long)json_object_get_int64(field(guard, "secretCount")),
                 (long long)json_object_get_int64(field(guard, "personalCount")),
                 (long long)json_object_get_int64(field(guard, "blocked")));
        text(ui, 56, y + 103, 15, 0, ink, caption, 600);
    } else text(ui, 56, y + 103, 15, 0, muted, "未取得の結果を安全とは表示しません。", 600);
    size_t count = array_size(findings); if (count > 3) count = 3;
    int selected_secret = 0;
    for (size_t i = 0; i < count; i++) {
        json_object *finding = array_item(findings, i);
        double row = y + 126 + i * 60;
        int secret = !strcmp(string(finding, "kind"), "secret");
        int selected = current && s->active && s->target == (int)i;
        unsigned accent = secret ? 0xef9acb : 0x9ce9e4;
        if (selected) selected_secret = secret;
        if (selected && s->settled) {
            cairo_save(ui->cr);
            /* This outline selects a real finding; it does not claim remediation. */
            spider_rgba(ui->cr, accent, .055);
            cairo_rectangle(ui->cr, 232, row - 3, 424, 53); cairo_fill(ui->cr);
            spider_rgba(ui->cr, accent, .65); cairo_set_line_width(ui->cr, 1);
            for (int side = 0; side < 2; side++) {
                double x = side ? 656 : 232, sign = side ? -1 : 1;
                cairo_move_to(ui->cr, x + sign * 13, row - 3); cairo_line_to(ui->cr, x, row - 3);
                cairo_line_to(ui->cr, x, row + 50); cairo_line_to(ui->cr, x + sign * 13, row + 50);
            }
            cairo_stroke(ui->cr); cairo_restore(ui->cr);
        }
        spider_rgba(ui->cr, accent, selected ? .8 : .24);
        cairo_set_line_width(ui->cr, 1);
        cairo_move_to(ui->cr, 195, row + 23); cairo_line_to(ui->cr, 223, row + 23); cairo_stroke(ui->cr);
        cairo_arc(ui->cr, 195, row + 23, selected ? 5 : 3, 0, 6.28318530718); cairo_stroke(ui->cr);
        if (selected && s->settled) {
            cairo_arc(ui->cr, 195, row + 23, 11, s->phase * .8, s->phase * .8 + 4.7); cairo_stroke(ui->cr);
        }
        text(ui, 240, row + 19, 15, 1, ink, string(finding, "label"), 405);
        snprintf(caption, sizeof(caption), "%.110s : %lld", string(finding, "path"),
                 (long long)json_object_get_int64(field(finding, "line")));
        text(ui, 240, row + 40, 12, 0, muted, caption, 405);
    }
    if (!count) wrapped(ui, 235, y + 154, 415, 15, 25, muted,
                       current ? "対象ファイルの候補はありません。\n送信内容は実行の直前にも検査します。" :
                       "接続後に実際の検出結果を表示します。", 3);
    spider_creature(ui, y, current, selected_secret);
    spider_agent_action(guard, caption, sizeof(caption));
    text(ui, 56, y + 342, 15, 1, ink, caption, 600);
    wrapped(ui, 56, y + 359, 596, 13, 23, muted,
            "MCP・リモート実行への秘密／個人情報を検出すると送信を拒否します。\nこのOSの管理データが対象です。OS全通信や画像の監視ではありません。", 3);
    text(ui, 56, y + 430, 12, 0, boolean(guard, "coverageLimited") ? 0xe4b18c : muted,
         boolean(guard, "coverageLimited") ? "検査できない対象があります。検出ゼロは安全の保証ではありません。" :
         "値は表示しません。停止・電源OFF中は監視できません。", 600);
    return y + 474;
}
