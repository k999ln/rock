#define _GNU_SOURCE
#include "ui.h"
#include "ipc.h"

#include <inttypes.h>
#include <linux/input.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define COLOR_BG 0xf5f3ed
#define COLOR_INK 0x173b34
#define COLOR_MUTED 0x677971
#define COLOR_LINE 0xdbe2d9
#define COLOR_ACCENT 0x1f6651
#define COLOR_GOLD 0xe5b45a
#define COLOR_WHITE 0xffffff
#define COLOR_ERROR 0xa14135

static json_object *field(json_object *object, const char *name)
{
    json_object *value = NULL;
    if (object && json_object_is_type(object, json_type_object))
        (void)json_object_object_get_ex(object, name, &value);
    return value;
}

static const char *string(json_object *object, const char *name)
{
    json_object *value = field(object, name);
    return value && json_object_is_type(value, json_type_string) ? json_object_get_string(value) : "";
}

static int boolean(json_object *object, const char *name)
{
    json_object *value = field(object, name);
    return value && (json_object_is_type(value, json_type_boolean) ||
                     json_object_is_type(value, json_type_int)) && json_object_get_boolean(value);
}

static int can_mutate(struct rock_ui *ui)
{
    return ui->connected && (!ui->busy || ui->busy_read) && !ui->queued_request && !ui->retry_request;
}

static int registry_refreshing(json_object *registry)
{
    const char *status = string(registry, "status");
    return !strcmp(status, "refreshing") || !strcmp(status, "queued") || !strcmp(status, "running");
}

static void registry_caption(struct rock_ui *ui, char *out, size_t size)
{
    json_object *registry = field(ui->snapshot, "registry"), *checked = field(registry, "last_checked_unix");
    const char *status = string(registry, "status"), *source = string(registry, "source_label");
    char when[40] = "取得日時不明";
    if (!registry) {
        snprintf(out, size, "カタログ配信元の状態を取得できません");
        return;
    }
    if (!boolean(registry, "configured")) {
        snprintf(out, size, !strcmp(status, "embedded") ? "内蔵カタログ · 配信元未設定" : "保存済みカタログ · 配信元未設定");
        return;
    }
    if (registry_refreshing(registry)) {
        snprintf(out, size, "取得中 · %s", *source ? source : "設定された配信元");
        return;
    }
    if (!strcmp(status, "error")) {
        snprintf(out, size, "取得失敗 · 保存済みの情報を表示");
        return;
    }
    if (checked && (json_object_is_type(checked, json_type_int) || json_object_is_type(checked, json_type_double))) {
        double stamp = json_object_get_double(checked);
        if (isfinite(stamp) && stamp > 0 && stamp <= 4102444800.0) {
            time_t at = (time_t)stamp;
            struct tm local;
            if (localtime_r(&at, &local)) strftime(when, sizeof(when), "%m/%d %H:%M", &local);
        }
    }
    if (!strcmp(status, "ready") && boolean(registry, "fresh"))
        snprintf(out, size, "署名確認済み · %s", when);
    else if (!strcmp(status, "ready") && field(registry, "fresh") && !boolean(registry, "fresh"))
        snprintf(out, size, "期限切れ · 保存済みのカタログ");
    else
        snprintf(out, size, "配信元: %s", *source ? source : "情報未取得");
}

static int is_retry(struct rock_ui *ui, json_object *request)
{
    const char *key = string(request, "key");
    return ui->retry_request && *key && json_object_equal(ui->retry_request, request);
}

static int auth_required(struct rock_ui *ui);
static int auth_active(struct rock_ui *ui);
static double draw_auth_card(struct rock_ui *ui, double y);
static void auth_reset(struct rock_ui *ui);
static void auth_clear_pin(struct rock_ui *ui);

int rock_ui_request_is_read(json_object *request)
{
    const char *operation = string(request, "op");
    return !strcmp(operation, "snapshot") || !strcmp(operation, "remote.status") || !strcmp(operation, "remote.history") ||
           !strcmp(operation, "mcp.snapshot") || !strcmp(operation, "mcp.status") ||
           !strcmp(operation, "wallet.atm.status") || !strcmp(operation, "wallet.atm.history") ||
           !strcmp(operation, "wallet.auth.status") || !strcmp(operation, "auth.status") ||
           !strcmp(operation, "device.activation.snapshot");
}

static size_t array_size(json_object *array)
{
    size_t size = array && json_object_is_type(array, json_type_array) ? json_object_array_length(array) : 0;
    return size > 256 ? 256 : size;
}

static json_object *array_item(json_object *array, size_t index)
{
    return index < array_size(array) ? json_object_array_get_idx(array, index) : NULL;
}

static json_object *hub(struct rock_ui *ui)
{
    return field(ui->snapshot, "hub");
}

static json_object *installed(struct rock_ui *ui, const char *id)
{
    json_object *items = field(hub(ui), "installed");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        if (strcmp(string(item, "id"), id) == 0)
            return item;
    }
    return NULL;
}

static int version_compare(const char *a, const char *b)
{
    while (*a || *b) {
        if (*a >= '0' && *a <= '9' && *b >= '0' && *b <= '9') {
            const char *ae = a, *be = b;
            while (*ae >= '0' && *ae <= '9') ae++;
            while (*be >= '0' && *be <= '9') be++;
            while (a + 1 < ae && *a == '0') a++;
            while (b + 1 < be && *b == '0') b++;
            if (ae - a != be - b)
                return ae - a > be - b ? 1 : -1;
            {
                int difference = strncmp(a, b, (size_t)(ae - a));
                if (difference)
                    return difference > 0 ? 1 : -1;
            }
            a = ae;
            b = be;
        } else {
            if (*a != *b)
                return (unsigned char)*a > (unsigned char)*b ? 1 : -1;
            if (*a) a++;
            if (*b) b++;
        }
    }
    return 0;
}

static json_object *catalog_item(struct rock_ui *ui, const char *id, const char *version)
{
    json_object *catalog = field(ui->snapshot, "catalog"), *best = NULL;
    for (size_t i = 0; i < array_size(catalog); i++) {
        json_object *item = array_item(catalog, i), *manifest = field(item, "manifest");
        if (strcmp(string(manifest, "id"), id) != 0)
            continue;
        if (version && *version && strcmp(string(manifest, "version"), version) == 0)
            return item;
        if ((!version || !*version) && (!best || version_compare(string(manifest, "version"),
                                                       string(field(best, "manifest"), "version")) > 0))
            best = item;
    }
    return best;
}

static json_object *selected_manifest(struct rock_ui *ui)
{
    json_object *item = installed(ui, ui->selected_id);
    if (item)
        return field(item, "manifest");
    item = catalog_item(ui, ui->selected_id, ui->selected_version);
    return field(item, "manifest");
}

static int tool_compatible(json_object *item)
{
    json_object *status = field(item, "compatibility");
    /* Old schema-2/3 snapshots remain usable. Schema 4 needs OS admission data. */
    if (!status)
        return json_object_get_int(field(field(item, "manifest"), "schema_version")) != 4;
    return boolean(status, "compatible");
}

static int manifest_target(json_object *manifest, const char *target)
{
    json_object *items = field(manifest, "execution_targets");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        if (json_object_is_type(item, json_type_string) && !strcmp(json_object_get_string(item), target)) return 1;
    }
    return 0;
}

static const char *tool_name(struct rock_ui *ui, const char *id)
{
    json_object *item = installed(ui, id), *manifest;
    if (!item)
        item = catalog_item(ui, id, NULL);
    manifest = field(item, "manifest");
    return *string(manifest, "name") ? string(manifest, "name") : id;
}

/* A saved result belongs to the executed package, not today's installed or
 * latest catalog version. Missing historical metadata must remain unknown. */
static json_object *job_manifest(struct rock_ui *ui, json_object *item)
{
    const char *id = string(item, "tool_id"), *version = string(item, "version");
    const char *hash = string(item, "package_hash");
    json_object *entry = installed(ui, id);
    if (!*version) return NULL;
    if (!entry || strcmp(string(field(entry, "manifest"), "version"), version) ||
        (*hash && strcmp(string(entry, "hash"), hash)))
        entry = catalog_item(ui, id, version);
    if (!entry || (*hash && strcmp(string(entry, "hash"), hash))) return NULL;
    return field(entry, "manifest");
}

static const char *job_name(struct rock_ui *ui, json_object *item)
{
    const char *name = string(job_manifest(ui, item), "name");
    return *name ? name : string(item, "tool_id");
}

static json_object *job(struct rock_ui *ui, const char *id)
{
    json_object *jobs = field(hub(ui), "jobs");
    for (size_t i = 0; i < array_size(jobs); i++) {
        json_object *item = array_item(jobs, i);
        if (strcmp(string(item, "id"), id) == 0)
            return item;
    }
    return NULL;
}

static void color(cairo_t *cr, unsigned rgb)
{
    cairo_set_source_rgb(cr, ((rgb >> 16) & 255) / 255.0,
                         ((rgb >> 8) & 255) / 255.0, (rgb & 255) / 255.0);
}

static void rounded(cairo_t *cr, double x, double y, double w, double h, double r)
{
    const double pi = 3.14159265358979323846;
    if (r * 2 > h) r = h / 2;
    if (r * 2 > w) r = w / 2;
    cairo_new_sub_path(cr);
    cairo_arc(cr, x + w - r, y + r, r, -pi / 2, 0);
    cairo_arc(cr, x + w - r, y + h - r, r, 0, pi / 2);
    cairo_arc(cr, x + r, y + h - r, r, pi / 2, pi);
    cairo_arc(cr, x + r, y + r, r, pi, pi * 1.5);
    cairo_close_path(cr);
}

static void panel(struct rock_ui *ui, double x, double y, double w, double h, unsigned background)
{
    color(ui->cr, background);
    rounded(ui->cr, x, y, w, h, 20);
    cairo_fill(ui->cr);
}

static void font(struct rock_ui *ui, double size, int bold)
{
    cairo_set_font_face(ui->cr, bold ? ui->bold : ui->font);
    cairo_set_font_size(ui->cr, size);
}

static size_t utf8_character(const char *s)
{
    unsigned char c = (unsigned char)*s;
    if (c < 128) return 1;
    if (c >= 0xc2 && c <= 0xdf && s[1] && ((unsigned char)s[1] & 0xc0) == 0x80) return 2;
    if ((c & 0xf0) == 0xe0 && s[1] && s[2] && ((unsigned char)s[1] & 0xc0) == 0x80 &&
        ((unsigned char)s[2] & 0xc0) == 0x80 && !(c == 0xe0 && (unsigned char)s[1] < 0xa0) &&
        !(c == 0xed && (unsigned char)s[1] >= 0xa0)) return 3;
    if (c >= 0xf0 && c <= 0xf4 && s[1] && s[2] && s[3] && ((unsigned char)s[1] & 0xc0) == 0x80 &&
        ((unsigned char)s[2] & 0xc0) == 0x80 && ((unsigned char)s[3] & 0xc0) == 0x80 &&
        !(c == 0xf0 && (unsigned char)s[1] < 0x90) && !(c == 0xf4 && (unsigned char)s[1] >= 0x90)) return 4;
    return 1;
}

static void clean_text(const char *input, char *output, size_t capacity)
{
    size_t used = 0;
    while (*input && used + 5 < capacity) {
        size_t n = utf8_character(input);
        if (((unsigned char)*input < 32 && *input != '\n' && *input != '\t') ||
            (unsigned char)*input == 127 || ((unsigned char)*input >= 128 && n == 1)) {
            output[used++] = '?';
            input++;
        } else {
            memcpy(output + used, input, n);
            used += n;
            input += n;
        }
    }
    output[used] = '\0';
}

static void text(struct rock_ui *ui, double x, double baseline, double size, int bold,
                 unsigned rgb, const char *value, double max_width)
{
    char safe[2048], clipped[2048] = { 0 };
    cairo_text_extents_t extents;
    size_t used = 0;
    clean_text(value, safe, sizeof(safe));
    font(ui, size, bold);
    color(ui->cr, rgb);
    for (const char *p = safe; *p && *p != '\n';) {
        size_t n = utf8_character(p);
        memcpy(clipped + used, p, n);
        clipped[used + n] = '\0';
        cairo_text_extents(ui->cr, clipped, &extents);
        if (max_width > 0 && extents.x_advance > max_width) {
            if (used + 4 < sizeof(clipped)) {
                memcpy(clipped + used, "…", 4);
                while (used > 0) {
                    cairo_text_extents(ui->cr, clipped, &extents);
                    if (extents.x_advance <= max_width) break;
                    do { used--; } while (used > 0 && ((unsigned char)clipped[used] & 0xc0) == 0x80);
                    memcpy(clipped + used, "…", 4);
                }
            }
            break;
        }
        used += n;
        p += n;
    }
    if (safe[0] == '\0') clipped[0] = '\0';
    cairo_move_to(ui->cr, x, baseline);
    cairo_show_text(ui->cr, clipped);
}

static double wrapped(struct rock_ui *ui, double x, double top, double width, double size,
                      double spacing, unsigned rgb, const char *value, int max_lines)
{
    char safe[65540];
    const char *p = safe;
    int lines = 0;
    clean_text(value, safe, sizeof(safe));
    font(ui, size, 0);
    while (*p && lines < max_lines) {
        char line[2048];
        size_t used = 0;
        cairo_text_extents_t extents;
        while (*p && *p != '\n' && used + 5 < sizeof(line)) {
            size_t n = utf8_character(p);
            memcpy(line + used, p, n);
            line[used + n] = '\0';
            cairo_text_extents(ui->cr, line, &extents);
            if (extents.x_advance > width && used > 0)
                break;
            used += n;
            p += n;
        }
        line[used] = '\0';
        text(ui, x, top + size + lines * spacing, size, 0, rgb, line, width);
        lines++;
        if (*p == '\n') p++;
    }
    return (lines ? lines : 1) * spacing;
}

static void star(struct rock_ui *ui, double x, double y, double radius, unsigned rgb)
{
    color(ui->cr, rgb);
    for (int i = 0; i < 10; i++) {
        double angle = -1.57079632679 + i * 0.62831853071;
        double r = i % 2 ? radius * .45 : radius;
        if (i == 0) cairo_move_to(ui->cr, x + cos(angle) * r, y + sin(angle) * r);
        else cairo_line_to(ui->cr, x + cos(angle) * r, y + sin(angle) * r);
    }
    cairo_close_path(ui->cr);
    cairo_fill(ui->cr);
}

static void icon(struct rock_ui *ui, double x, double y, int style, double size)
{
    static const unsigned colors[] = { 0xe3ece0, 0xf3e6c9, 0xdfeae8 };
    panel(ui, x, y, size, size, colors[style % 3]);
    color(ui->cr, COLOR_INK);
    cairo_set_line_width(ui->cr, 2.4);
    for (int i = 0; i < 3; i++) {
        double line_y = y + size * (.32 + i * .18);
        if (style % 3 == 1) {
            cairo_move_to(ui->cr, x + size * .21, line_y);
            cairo_line_to(ui->cr, x + size * .27, line_y + size * .045);
            cairo_line_to(ui->cr, x + size * .36, line_y - size * .045);
        }
        cairo_move_to(ui->cr, x + size * (style % 3 == 1 ? .46 : .26), line_y);
        cairo_line_to(ui->cr, x + size * (i == 2 ? .62 : .76), line_y);
        cairo_stroke(ui->cr);
    }
}

static void hit(struct rock_ui *ui, double x, double y, double w, double h,
                enum rock_action action, int number, const char *id, const char *version, int enabled)
{
    struct rock_hit *target;
    int fixed = (y >= 868 && action == ACTION_NAV) || action == ACTION_REFRESH ||
                action == ACTION_RETRY || action == ACTION_CONFIRM || action == ACTION_DISMISS || action == ACTION_REGISTRY_REFRESH || action == ACTION_SYSTEM || action == ACTION_ATM_OPEN;
    if (ui->hit_count >= ROCK_UI_HITS || (!fixed && (y + h <= ui->content_top || y >= 856)))
        return;
    target = &ui->hits[ui->hit_count];
    *target = (struct rock_hit){ .x = x, .y = y, .w = w, .h = h,
                               .action = action, .number = number, .enabled = enabled };
    if (!fixed) {
        target->y = fmax(y, ui->content_top);
        target->h = fmin(y + h, 856) - target->y;
    }
    snprintf(target->id, sizeof(target->id), "%s", id ? id : "");
    snprintf(target->version, sizeof(target->version), "%s", version ? version : "");
    if (ui->focus == ui->hit_count && enabled) {
        color(ui->cr, COLOR_GOLD);
        cairo_set_line_width(ui->cr, 3);
        rounded(ui->cr, x - 3, y - 3, w + 6, h + 6, 15);
        cairo_stroke(ui->cr);
    }
    ui->hit_count++;
}

static void button(struct rock_ui *ui, double x, double y, double w, double h,
                   const char *label, enum rock_action action, int number, const char *id,
                   const char *version, int enabled, int primary)
{
    cairo_text_extents_t extents;
    unsigned background = primary ? COLOR_ACCENT : 0xe8ede5;
    unsigned foreground = primary ? COLOR_WHITE : COLOR_INK;
    if (!enabled) { background = 0xe7e7e0; foreground = 0x909990; }
    panel(ui, x, y, w, h, background);
    font(ui, 19, 1);
    cairo_text_extents(ui->cr, label, &extents);
    text(ui, x + fmax(12, (w - extents.x_advance) / 2), y + h / 2 + 7,
         19, 1, foreground, label, w - 24);
    hit(ui, x, y, w, h, action, number, id, version, enabled);
}

static void pill(struct rock_ui *ui, double x, double y, const char *label, unsigned bg, unsigned fg)
{
    cairo_text_extents_t extents;
    font(ui, 14, 1);
    cairo_text_extents(ui->cr, label, &extents);
    panel(ui, x, y, extents.x_advance + 22, 27, bg);
    text(ui, x + 11, y + 19, 14, 1, fg, label, 180);
}

static const char *status_label(const char *status)
{
    if (!strcmp(status, "completed") || !strcmp(status, "succeeded")) return "完了";
    if (!strcmp(status, "running")) return "実行中";
    if (!strcmp(status, "cancel_requested")) return "停止中";
    if (!strcmp(status, "cancelled")) return "キャンセル";
    if (!strcmp(status, "interrupted")) return "中断";
    if (!strcmp(status, "failed")) return "失敗";
    return *status ? status : "状態を確認中";
}

static int active_job(json_object *item)
{
    return !strcmp(string(item, "status"), "running") || !strcmp(string(item, "status"), "cancel_requested");
}

static void money(char *out, size_t size, json_object *object, const char *name)
{
    json_object *value = field(object, name);
    int64_t minor;
    if (!value || !json_object_is_type(value, json_type_int)) {
        snprintf(out, size, "取得できません");
        return;
    }
    minor = json_object_get_int64(value);
    if (minor < 0 || minor > INT64_C(1000000000000)) {
        snprintf(out, size, "値を確認してください");
        return;
    }
    snprintf(out, size, "$%" PRId64 ".%02" PRId64, minor / 100, minor % 100);
}

static void price_text(char *out, size_t size, json_object *manifest)
{
    json_object *price = field(manifest, "price"), *value = field(price, "amount_minor");
    if (!value || !json_object_is_type(value, json_type_int))
        snprintf(out, size, "料金未取得");
    else if (json_object_get_int64(value) == 0)
        snprintf(out, size, "無料");
    else {
        char amount[80];
        money(amount, sizeof(amount), price, "amount_minor");
        snprintf(out, size, "%s %s", amount, string(price, "currency"));
    }
}

#include "service-ui.inc"

static void empty_state(struct rock_ui *ui, double y, const char *title, const char *body)
{
    panel(ui, 32, y, 656, 238, COLOR_WHITE);
    icon(ui, 320, y + 26, 0, 70);
    text(ui, 72, y + 145, 23, 1, COLOR_INK, title, 576);
    wrapped(ui, 72, y + 163, 576, 17, 28, COLOR_MUTED, body, 2);
}

static int contains_folded(const char *text_value, const char *query)
{
    if (!*query) return 1;
    for (; *text_value; text_value++) {
        const unsigned char *a = (const unsigned char *)text_value, *b = (const unsigned char *)query;
        while (*a && *b) {
            unsigned char left = *a, right = *b;
            if (left >= 'A' && left <= 'Z') left = (unsigned char)(left + 'a' - 'A');
            if (right >= 'A' && right <= 'Z') right = (unsigned char)(right + 'a' - 'A');
            if (left != right) break;
            a++; b++;
        }
        if (!*b) return 1;
    }
    return 0;
}

static void draw_catalog(struct rock_ui *ui, int show_installed)
{
    json_object *items = show_installed ? field(hub(ui), "installed") : field(ui->snapshot, "catalog");
    double y = ui->content_top + 6 - ui->scroll;
    size_t shown = 0;
    int partial = show_installed ? boolean(hub(ui), "installed_truncated") : boolean(ui->snapshot, "catalog_truncated");
    if (!show_installed) {
        panel(ui, 32, y, 656, 52, COLOR_WHITE);
        text(ui, 51, y + 34, 17, 0, *ui->search ? COLOR_INK : COLOR_MUTED,
             *ui->search ? ui->search : "ツール名・説明・IDで検索", 525);
        hit(ui, 32, y, 555, 52, ACTION_SEARCH, 0, NULL, NULL, 1);
        button(ui, 599, y + 6, 80, 40, "消す", ACTION_SEARCH_CLEAR, 0, NULL, NULL, *ui->search != '\0', 0);
        y += 72;
        if (boolean(field(ui->snapshot, "mcp"), "configured")) {
            button(ui, 32, y, 656, 52, "接続して使う道具", ACTION_MCP_OPEN, 0, NULL, NULL, 1, 0);
            y += 70;
        }
    }
    if (partial) {
        text(ui, 36, y + 19, 15, 0, COLOR_MUTED,
             show_installed ? "保存済みの道具の一部を表示しています。削除されたわけではありません。" : "カタログの一部を表示。検索は表示中のデータが対象です。", 647);
        y += 40;
    }
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i), *manifest = field(item, "manifest");
        const char *id = string(manifest, "id"), *version = string(manifest, "version");
        json_object *existing = installed(ui, id);
        char price[80], meta[320];
        if (!*id || (!show_installed && catalog_item(ui, id, NULL) != item))
            continue;
        if (!show_installed && !contains_folded(id, ui->search) && !contains_folded(string(manifest, "name"), ui->search) &&
            !contains_folded(string(manifest, "description"), ui->search))
            continue;
        panel(ui, 32, y, 656, 144, COLOR_WHITE);
        icon(ui, 52, y + 25, (int)shown, 66);
        text(ui, 138, y + 39, 24, 1, COLOR_INK, string(manifest, "name"), 398);
        text(ui, 138, y + 70, 16, 0, COLOR_MUTED, string(manifest, "description"), 492);
        snprintf(meta, sizeof(meta), "v%s  ·  %s", version, string(manifest, "publisher"));
        text(ui, 138, y + 99, 13, 0, COLOR_MUTED, meta, 485);
        price_text(price, sizeof(price), manifest);
        pill(ui, 553, y + 18, price, 0xeaf1e7, COLOR_ACCENT);
        text(ui, 138, y + 125, 14, 1, existing ? COLOR_ACCENT : COLOR_MUTED,
             existing ? (boolean(existing, "enabled") ? "インストール済み · 利用可能" : "インストール済み · 権限の確認が必要")
                      : manifest_target(manifest, "device_local") ? "この端末で使う" : "送信先を確認して使う", 480);
        text(ui, 644, y + 105, 26, 0, COLOR_MUTED, "›", 25);
        hit(ui, 32, y, 656, 144, ACTION_DETAIL, 0, id, version, 1);
        y += 160;
        shown++;
    }
    if (!shown) {
        empty_state(ui, y, show_installed ? (partial ? "道具の情報を表示できません" : "道具をインストールしてみましょう") : *ui->search ? "表示中のカタログに一致なし" : "カタログにツールがありません",
                    show_installed ? (partial ? "一覧の一部が省略されています。状態更新で取得内容を再確認できます。" : "Hubで道具を選び、権限を確認すると使えるようになります。") : *ui->search ? "名前・説明・IDの一部で検索できます。\n「消す」で検索条件を解除します。" : "サービスのカタログを取得できたときに、ここに表示します。");
        y += 254;
    }
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void joined_array(char *out, size_t size, json_object *array, int permissions)
{
    size_t used = 0;
    out[0] = '\0';
    for (size_t i = 0; i < array_size(array) && i < 12; i++) {
        json_object *item = array_item(array, i);
        const char *value = json_object_is_type(item, json_type_string) ? json_object_get_string(item) : "?";
        int n;
        if (permissions && !strcmp(value, "text.input")) value = "入力テキスト";
        if (permissions && !strcmp(value, "text.output")) value = "結果の表示";
        if (permissions && !strcmp(value, "execution.remote")) value = "入力を外部で処理";
        if (!strcmp(value, "device_local")) value = "この端末";
        if (!strcmp(value, "cloud")) value = "クラウド";
        if (!strcmp(value, "pc_usb")) value = "PC / USB";
        n = snprintf(out + used, size - used, "%s%s", i ? " / " : "", value);
        if (n < 0 || (size_t)n >= size - used) break;
        used += (size_t)n;
    }
    if (!out[0]) snprintf(out, size, "なし");
}

static const char *rollback_version(json_object *item)
{
    json_object *versions = field(item, "cached_versions");
    const char *current = string(item, "version"), *best = "";
    for (size_t i = 0; i < array_size(versions); i++) {
        json_object *value = array_item(versions, i);
        const char *version = json_object_is_type(value, json_type_string) ? json_object_get_string(value) : "";
        if (*version && strcmp(version, current) != 0 && (!*best || version_compare(version, best) > 0))
            best = version;
    }
    return best;
}

static void draw_detail(struct rock_ui *ui)
{
    json_object *manifest = selected_manifest(ui), *item = installed(ui, ui->selected_id);
    json_object *latest_item = catalog_item(ui, ui->selected_id, NULL);
    json_object *latest = field(latest_item, "manifest");
    json_object *selected = item ? item : catalog_item(ui, ui->selected_id, ui->selected_version);
    double y = ui->content_top - ui->scroll;
    char value[400];
    int installation_unknown = !item && boolean(hub(ui), "installed_truncated");
    int can_act = can_mutate(ui) && !installation_unknown;
    button(ui, 32, y, 140, 42, "‹ 一覧へ", ACTION_NAV, ui->return_page, NULL, NULL, 1, 0);
    y += 59;
    if (!manifest) {
        empty_state(ui, y, "ツール情報を取得できません", "Hubに戻り、カタログを更新してください。");
        ui->content_height = y + 260 + ui->scroll - ui->content_top;
        return;
    }
    icon(ui, 32, y, 0, 82);
    text(ui, 137, y + 32, 29, 1, COLOR_INK, string(manifest, "name"), 545);
    snprintf(value, sizeof(value), "バージョン %s", string(manifest, "version"));
    text(ui, 137, y + 65, 17, 0, COLOR_MUTED, value, 540);
    y += 99;
    snprintf(value, sizeof(value), "作成者  %s", string(manifest, "publisher"));
    text(ui, 34, y + 21, 16, 0, COLOR_MUTED, value, 650);
    y += 38;
    y += wrapped(ui, 34, y, 650, 20, 32, COLOR_INK, string(manifest, "description"), 4) + 20;
    if (!item) {
        json_object *catalog = field(ui->snapshot, "catalog");
        int choices = 0;
        for (size_t i = 0; i < array_size(catalog); i++) {
            json_object *entry = array_item(catalog, i), *candidate = field(entry, "manifest");
            const char *version = string(candidate, "version");
            if (!strcmp(string(candidate, "id"), ui->selected_id) && *version && *string(entry, "hash") &&
                strlen(version) < sizeof(ui->selected_version) && catalog_item(ui, ui->selected_id, version) == entry)
                choices++;
        }
        if (choices > 1) {
            text(ui, 35, y + 25, 20, 1, COLOR_INK, "選べるバージョン", 650);
            y += 43;
            for (size_t i = 0; i < array_size(catalog); i++) {
                json_object *entry = array_item(catalog, i), *candidate = field(entry, "manifest");
                const char *version = string(candidate, "version");
                if (strcmp(string(candidate, "id"), ui->selected_id) || !*version || !*string(entry, "hash") ||
                    strlen(version) >= sizeof(ui->selected_version) || catalog_item(ui, ui->selected_id, version) != entry)
                    continue;
                int chosen = entry == selected;
                snprintf(value, sizeof(value), chosen ? "v%s を選択中%s" : "v%s を選ぶ%s", version,
                         entry == latest_item ? "（最新版）" : "");
                button(ui, 32, y, 656, 48, value, ACTION_VERSION, 0, ui->selected_id, version,
                       can_act && !chosen, 0);
                y += 60;
            }
            y += wrapped(ui, 35, y, 650, 16, 26, COLOR_MUTED,
                         "選んだ版の権限と料金を確認してから、インストールしてください。", 2) + 18;
        }
    }
    panel(ui, 32, y, 656, 226, COLOR_WHITE);
    text(ui, 56, y + 35, 19, 1, COLOR_INK, "このツールが使うもの", 590);
    text(ui, 56, y + 77, 16, 0, COLOR_MUTED, "権限", 145);
    joined_array(value, sizeof(value), field(manifest, "permissions"), 1);
    text(ui, 220, y + 77, 17, 0, COLOR_INK, value, 438);
    text(ui, 56, y + 117, 16, 0, COLOR_MUTED, "処理する場所", 150);
    joined_array(value, sizeof(value), field(manifest, "execution_targets"), 0);
    text(ui, 220, y + 117, 17, 0, COLOR_INK, value, 438);
    text(ui, 56, y + 157, 16, 0, COLOR_MUTED, "送信先", 145);
    joined_array(value, sizeof(value), field(field(manifest, "data"), "destinations"), 0);
    text(ui, 220, y + 157, 17, 0, COLOR_INK, value, 438);
    text(ui, 56, y + 197, 16, 0, COLOR_MUTED, "ツール本体", 145);
    price_text(value, sizeof(value), manifest);
    text(ui, 220, y + 197, 17, 1, COLOR_ACCENT, value, 438);
    y += 248;
    if (manifest_target(manifest, "cloud"))
        y = draw_purchaser_service(ui, y, "cloud");
    if (field(manifest, "compatibility")) {
        json_object *required = field(manifest, "compatibility");
        snprintf(value, sizeof(value), "必要なOS: %s以上 · Tool実行機能: %s以上",
                 string(required, "min_os_version"), string(required, "min_runtime_version"));
        y += wrapped(ui, 35, y, 650, 16, 25, COLOR_MUTED, value, 2) + 16;
    }
    snprintf(value, sizeof(value), "v%s をインストール", string(manifest, "version"));
    button(ui, 32, y, 656, 60,
           !tool_compatible(selected) ? "OSの更新が必要です" : item ? (boolean(item, "enabled") ? "ツールを開く" : "この権限を確認して利用を許可") : installation_unknown ? "インストール状態が未取得" : value,
           item ? (boolean(item, "enabled") ? ACTION_EDITOR : ACTION_APPROVE) : ACTION_INSTALL,
           0, ui->selected_id, string(manifest, "version"), can_act && tool_compatible(selected), 1);
    y += 80;
    if (item) {
        int newer = latest && version_compare(string(latest, "version"), string(item, "version")) > 0;
        const char *old_version = rollback_version(item);
        snprintf(value, sizeof(value), newer ? (tool_compatible(latest_item) ? "v%sへ更新" : "OS更新が必要") : "最新版", string(latest, "version"));
        button(ui, 32, y, 210, 52, value, ACTION_UPDATE, 0, ui->selected_id,
               string(latest, "version"), can_act && newer && tool_compatible(latest_item), 0);
        button(ui, 255, y, 210, 52, "以前の版へ", ACTION_ROLLBACK, 0, ui->selected_id,
               old_version, can_act && *old_version, 0);
        button(ui, 478, y, 210, 52, "削除", ACTION_UNINSTALL, 0, ui->selected_id, NULL, can_act, 0);
        y += 70;
        button(ui, 32, y, 656, 52, boolean(item, "enabled") ? "ツールの利用を停止" : "停止中 · 再開には権限の確認が必要",
               ACTION_DISABLE, 0, ui->selected_id, NULL, can_act && boolean(item, "enabled"), 0);
        y += 70;
        if (newer && !tool_compatible(latest_item)) {
            json_object *required = field(latest, "compatibility");
            snprintf(value, sizeof(value), "新しいToolにはOS %s以上・実行機能 %s以上が必要です。現在の版は引き続き使えます。",
                     string(required, "min_os_version"), string(required, "min_runtime_version"));
            y += wrapped(ui, 35, y, 650, 16, 25, COLOR_MUTED, value, 3) + 16;
        }
        if (*old_version) {
            snprintf(value, sizeof(value), "戻せるバージョン: %s · 更新後は権限を再確認します", old_version);
            text(ui, 35, y + 19, 14, 0, COLOR_MUTED, value, 650);
            y += 42;
        }
    }
    ui->content_height = y + 8 + ui->scroll - ui->content_top;
}

static void text_entry(struct rock_ui *ui, double y, const char *value, int amount)
{
    double height = amount ? 64 : 238;
    panel(ui, 32, y, 656, height, COLOR_WHITE);
    color(ui->cr, ui->select_all && ui->editing == (amount ? 2 : 1) ? COLOR_GOLD :
          ui->editing == (amount ? 2 : 1) ? COLOR_ACCENT : COLOR_LINE);
    cairo_set_line_width(ui->cr, ui->editing == (amount ? 2 : 1) ? 2 : 1);
    rounded(ui->cr, 32, y, 656, height, 18);
    cairo_stroke(ui->cr);
    cairo_save(ui->cr);
    cairo_rectangle(ui->cr, 48, y + 9, 625, height - 18);
    cairo_clip(ui->cr);
    if (*value)
        wrapped(ui, 53, y + 14, 612, amount ? 25 : 21, 34, COLOR_INK, value, amount ? 1 : 6);
    else
        text(ui, 53, y + 41, 20, 0, 0x8b978f, amount ? "例: 10.00" : "ここにテキストを入力…", 610);
    if (ui->editing == (amount ? 2 : 1))
        text(ui, 653, y + height - 19, 21, 0, COLOR_ACCENT, "│", 20);
    cairo_restore(ui->cr);
    hit(ui, 32, y, 656, height, amount ? ACTION_AMOUNT : ACTION_INPUT, 0, NULL, NULL, 1);
}

static void draw_editor(struct rock_ui *ui)
{
    json_object *item = installed(ui, ui->selected_id);
    double y = ui->content_top - ui->scroll;
    char count[120];
    button(ui, 32, y, 156, 42, "‹ ツール詳細", ACTION_DETAIL, 0, ui->selected_id, ui->selected_version, 1, 0);
    y += 72;
    text(ui, 34, y + 28, 27, 1, COLOR_INK, tool_name(ui, ui->selected_id), 650);
    y += 56;
    text(ui, 34, y + 21, 18, 1, COLOR_INK, "入力テキスト", 600);
    y += 39;
    text_entry(ui, y, ui->text, 0);
    y += 256;
    snprintf(count, sizeof(count), "%zu / %d bytes  ·  %s", strlen(ui->text), ROCK_UI_TEXT_MAX,
             manifest_target(field(item, "manifest"), "device_local") ? "この端末で処理" : "送信先の確認が必要です");
    text(ui, 36, y + 18, 15, 0, COLOR_MUTED, count, 645);
    y += 46;
    button(ui, 32, y, 320, 49, "サンプルを入力", ACTION_SAMPLE, 0, NULL, NULL, 1, 0);
    button(ui, 368, y, 320, 49, "入力を消す", ACTION_CLEAR, 0, NULL, NULL, *ui->text != '\0', 0);
    y += 72;
    button(ui, 32, y, 656, 61, ui->busy ? "処理中…" : "実行する", ACTION_RUN, 0,
           ui->selected_id, NULL, can_mutate(ui) && boolean(item, "enabled") &&
           manifest_target(field(item, "manifest"), "device_local"), 1);
    y += 85;
    if (manifest_target(field(item, "manifest"), "cloud") || manifest_target(field(item, "manifest"), "pc_usb")) {
        button(ui, 32, y, 656, 56, "別の場所で実行 · 送信内容を確認", ACTION_REMOTE_OPEN, 0, NULL, NULL,
               boolean(item, "enabled") && y >= ui->content_top && y + 56 <= 856, 0);
        y += 78;
    }
    text(ui, 36, y + 16, 14, 0, COLOR_MUTED, "Tabで移動 · Ctrl+Enterで実行 · 入力は英数キーボード対応", 650);
    ui->content_height = y + 45 + ui->scroll - ui->content_top;
}

static void draw_history(struct rock_ui *ui)
{
    json_object *jobs = field(hub(ui), "jobs");
    double y = ui->content_top + 6 - ui->scroll;
    size_t count = array_size(jobs);
    for (size_t i = 0; i < count; i++) {
        json_object *item = array_item(jobs, i), *created = field(item, "created");
        const char *status = string(item, "status");
        char date[100] = "日時未取得", meta[240];
        if (created && (json_object_is_type(created, json_type_double) || json_object_is_type(created, json_type_int))) {
            time_t timestamp = (time_t)json_object_get_double(created);
            struct tm local;
            if (localtime_r(&timestamp, &local))
                strftime(date, sizeof(date), "%m/%d %H:%M:%S", &local);
        }
        panel(ui, 32, y, 656, 132, COLOR_WHITE);
        text(ui, 55, y + 35, 22, 1, COLOR_INK, job_name(ui, item), 435);
        pill(ui, 553, y + 18, status_label(status), active_job(item) ? 0xf8ebcf : 0xe9efe5,
             !strcmp(status, "failed") ? COLOR_ERROR : COLOR_ACCENT);
        snprintf(meta, sizeof(meta), "%s · v%s", date, string(item, "version"));
        text(ui, 55, y + 69, 16, 0, COLOR_MUTED, meta, 595);
        text(ui, 55, y + 105, 17, 0, COLOR_MUTED,
             *string(item, "output") ? string(item, "output") :
             (*string(item, "error") ? string(item, "error") : status_label(status)), 575);
        text(ui, 646, y + 102, 27, 0, COLOR_MUTED, "›", 20);
        hit(ui, 32, y, 656, 132, ACTION_RESULT, 0, string(item, "id"), NULL, 1);
        y += 148;
    }
    if (!count) {
        empty_state(ui, y, "まだ実行履歴はありません", "実行したツールの状態と結果が、ここに残ります。");
        y += 252;
    }
    if (boolean(hub(ui), "jobs_truncated")) {
        y += wrapped(ui, 36, y + 2, 648, 16, 28, COLOR_MUTED,
                     "この画面には直近の履歴を表示しています。以前の記録はサービスに保存されています。", 3) + 25;
    }
    button(ui, 32, y + 12, 656, 54, "別の場所での実行履歴", ACTION_REMOTE_HISTORY, 0, NULL, NULL, 1, 0);
    y += 88;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_result(struct rock_ui *ui)
{
    json_object *item = job(ui, ui->selected_job);
    double y = ui->content_top - ui->scroll;
    const char *output;
    button(ui, 32, y, 148, 42, "‹ 実行履歴", ACTION_NAV, PAGE_HISTORY, NULL, NULL, 1, 0);
    y += 70;
    if (!item) {
        empty_state(ui, y, "結果を取得しています", "サービスに接続すると、実行状態が更新されます。");
        ui->content_height = y + 270 + ui->scroll - ui->content_top;
        return;
    }
    text(ui, 34, y + 28, 27, 1, COLOR_INK, job_name(ui, item), 644);
    y += 48;
    pill(ui, 34, y, status_label(string(item, "status")), 0xe4ecdf, COLOR_ACCENT);
    char context[200];
    snprintf(context, sizeof(context), "v%s · この端末で処理", string(item, "version"));
    text(ui, 175, y + 19, 15, 0, COLOR_MUTED, context, 470);
    y += 60;
    if (active_job(item)) {
        button(ui, 32, y, 656, 55, "実行をキャンセル", ACTION_CANCEL, 0, string(item, "id"), NULL,
               can_mutate(ui), 0);
        y += 78;
    }
    if (*string(item, "error")) {
        y += wrapped(ui, 35, y, 649, 20, 31, COLOR_ERROR, string(item, "error"), 8) + 24;
    }
    output = string(item, "output");
    text(ui, 35, y + 22, 20, 1, COLOR_INK, "実行結果", 646);
    y += 43;
    {
        char shown[16385];
        size_t length = strlen(output), copy = length < sizeof(shown) - 1 ? length : sizeof(shown) - 1;
        double height;
        while (copy > 0 && ((unsigned char)output[copy] & 0xc0) == 0x80) copy--;
        memcpy(shown, output, copy);
        shown[copy] = '\0';
        cairo_save(ui->cr);
        cairo_push_group(ui->cr);
        height = wrapped(ui, 56, y + 19, 609, 20, 32, COLOR_INK,
                         *shown ? shown : (active_job(item) ? "実行中です…" : "出力は空です。"), 240);
        cairo_pattern_t *rendered = cairo_pop_group(ui->cr);
        panel(ui, 32, y, 656, fmax(108, height + 43), COLOR_WHITE);
        cairo_set_source(ui->cr, rendered);
        cairo_paint(ui->cr);
        cairo_pattern_destroy(rendered);
        cairo_restore(ui->cr);
        y += fmax(108, height + 43) + 24;
        if (length > copy || height >= 240 * 32 || boolean(item, "output_truncated")) {
            char notice[160];
            json_object *bytes = field(item, "output_bytes");
            if (bytes && json_object_is_type(bytes, json_type_int))
                snprintf(notice, sizeof(notice), "全%" PRId64 " bytesの結果を先頭16 KiB・240行まで表示しています。", json_object_get_int64(bytes));
            else
                snprintf(notice, sizeof(notice), "長い結果は先頭16 KiB・240行まで表示しています。");
            text(ui, 36, y + 20, 15, 0, COLOR_MUTED, notice, 644);
            y += 45;
        }
    }
    if (boolean(field(ui->snapshot, "wallet"), "simulation_only")) {
        panel(ui, 32, y, 656, 134, COLOR_WHITE);
        text(ui, 56, y + 32, 19, 1, COLOR_INK, "費用と入金の確認", 600);
        text(ui, 56, y + 67, 17, 0, COLOR_MUTED, "実費・実収益の接続: 未接続", 600);
        wrapped(ui, 56, y + 80, 600, 16, 25, COLOR_MUTED,
                "この処理の完了でテスト残高は増えません。結果は実行履歴から再表示できます。", 2);
        y += 152;
        button(ui, 32, y, 656, 54, "Walletのテスト状態を確認", ACTION_NAV, PAGE_WALLET, NULL, NULL, 1, 0);
        y += 72;
    }
    button(ui, 32, y, 656, 54, "このツールを開く", ACTION_EDITOR, 0, string(item, "tool_id"), NULL,
           installed(ui, string(item, "tool_id")) != NULL, 0);
    y += 78;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int wallet_terms_valid(json_object *membership)
{
    json_object *fee = field(membership, "monthly_fee_minor");
    return boolean(membership, "simulation_only") && fee && json_object_is_type(fee, json_type_int) &&
           json_object_get_int64(fee) == 888 && !strcmp(string(membership, "currency"), "USD") &&
           !strcmp(string(membership, "terms_version"), "simulator-monthly-usd-8.88-v1");
}

static int wallet_allowed(struct rock_ui *ui, enum rock_action action)
{
    json_object *wallet = field(ui->snapshot, "wallet"), *membership = field(wallet, "membership");
    json_object *entitlement = field(membership, "entitlement");
    if (!can_mutate(ui) || !boolean(wallet, "simulation_only") || !boolean(membership, "simulation_only")) return 0;
    json_object *backend = field(wallet, "backend");
    if (backend) {
        if (!boolean(backend, "connected") || boolean(backend, "stale") || boolean(backend, "pending_reconciliation")) return 0;
        if (action == ACTION_SALE || action == ACTION_SETTLE || action == ACTION_RESERVE ||
            action == ACTION_DISPENSE || action == ACTION_UNKNOWN || action == ACTION_RECONCILE) return 0;
    }
    if (action == ACTION_WALLET_REGISTER)
        return !boolean(membership, "registered") &&
               !strcmp(string(membership, "registration_status"), "REGISTRATION_REQUIRED");
    if (!boolean(membership, "registered")) return 0;
    if (auth_required(ui) && !auth_active(ui)) return 0;
    if (action == ACTION_SETTLE || action == ACTION_DISPENSE || action == ACTION_UNKNOWN || action == ACTION_RECONCILE)
        return 1;
    if (action == ACTION_CONSENT)
        return wallet_terms_valid(membership) &&
               (boolean(entitlement, "auto_renew") || boolean(entitlement, "device_eligible"));
    if (action == ACTION_BILL)
        return wallet_terms_valid(membership) && boolean(entitlement, "device_eligible") && boolean(entitlement, "auto_renew");
    return boolean(entitlement, "device_eligible");
}

static const char *membership_label(const char *state)
{
    if (!strcmp(state, "CONSENT_REQUIRED")) return "月額テストへの同意はまだありません";
    if (!strcmp(state, "AWAITING_FIRST_PAYMENT")) return "初回のテスト請求を待っています";
    if (!strcmp(state, "ACTIVE")) return "テスト利用期間中";
    if (!strcmp(state, "PAST_DUE")) return "テスト請求を確認してください";
    if (!strcmp(state, "CANCEL_AT_PERIOD_END")) return "自動更新は停止済み · 月末まで利用できます";
    if (!strcmp(state, "CANCELED")) return "自動更新は停止しています";
    if (!strcmp(state, "DEVICE_SUSPENDED")) return "開発用端末の利用条件は停止中です";
    if (!strcmp(state, "IDENTITY_EXPIRED")) return "開発用引渡し情報の期限が切れています";
    return "登録状態を取得できません";
}

static const char *billing_label(const char *state)
{
    if (!strcmp(state, "due")) return "受付済み · 請求結果は未確定";
    if (!strcmp(state, "processing")) return "処理中 · 請求結果は未確定";
    if (!strcmp(state, "paid")) return "テスト請求が完了しました";
    if (!strcmp(state, "retry_wait")) return "再試行待ち · 残高などを確認してください";
    if (!strcmp(state, "blocked")) return "テスト請求を停止しています";
    return "請求記録はまだありません";
}

static double draw_membership(struct rock_ui *ui, double y, json_object *membership, json_object *billing)
{
    json_object *entitlement = field(membership, "entitlement");
    char caption[240];
    if (!membership || !json_object_is_type(membership, json_type_object)) {
        panel(ui, 32, y, 656, 133, COLOR_WHITE);
        text(ui, 56, y + 36, 23, 1, COLOR_INK, "登録情報を取得できません", 600);
        wrapped(ui, 56, y + 56, 604, 17, 28, COLOR_MUTED,
                "接続を確認して状態を更新してください。登録・同意・新しいテスト操作は停止しています。", 2);
        return y + 153;
    }
    if (!boolean(membership, "registered")) {
        int handoff = !strcmp(string(membership, "registration_status"), "HANDOFF_REQUIRED");
        panel(ui, 32, y, 656, 246, COLOR_WHITE);
        text(ui, 56, y + 36, 25, 1, COLOR_INK, "Wallet のテスト登録", 596);
        wrapped(ui, 56, y + 59, 604, 17, 29, COLOR_MUTED,
                handoff ? "開発用の端末引渡し情報を待っています。登録に使う情報が届くまで開始できません。" :
                          "端末の引渡しテスト情報を使って登録します。\n追加の個人情報は入力しません。", 2);
        text(ui, 56, y + 143, 15, 0, COLOR_MUTED, "実サービス・本人確認には接続していません。", 603);
        button(ui, 56, y + 170, 608, 52, handoff ? "引渡し情報が必要です" : "テスト登録を始める",
               ACTION_WALLET_REGISTER, 0, NULL, NULL, wallet_allowed(ui, ACTION_WALLET_REGISTER), 1);
        return y + 266;
    }
    panel(ui, 32, y, 656, 132, COLOR_WHITE);
    text(ui, 56, y + 34, 23, 1, COLOR_INK, "テスト登録済み", 596);
    text(ui, 56, y + 71, 17, 0, COLOR_ACCENT, membership_label(string(entitlement, "subscription_state")), 602);
    text(ui, 56, y + 105, 14, 0, COLOR_MUTED, "開発用引渡し情報を使用 · 本人確認の実接続なし", 604);
    y += 150;
    y = draw_auth_card(ui, y);
    panel(ui, 32, y, 656, 348, COLOR_WHITE);
    text(ui, 56, y + 34, 23, 1, COLOR_INK, "月額料金のテスト", 600);
    text(ui, 56, y + 70, 21, 1, COLOR_INK, wallet_terms_valid(membership) ?
         "$8.88 USD / 月（UTC）" : "この利用条件は表示できません", 600);
    wrapped(ui, 56, y + 89, 604, 16, 27, COLOR_MUTED,
            "同意すると毎月テスト残高から差し引きます。実際の請求はありません。登録だけでは同意になりません。", 2);
    snprintf(caption, sizeof(caption), "条件: %s", string(membership, "terms_version"));
    text(ui, 56, y + 169, 13, 0, COLOR_MUTED, caption, 602);
    json_object *record = array_item(field(billing, "history"), 0);
    snprintf(caption, sizeof(caption), "%s%s%s", string(record, "period"), record ? " · " : "", billing_label(string(record, "status")));
    text(ui, 56, y + 200, 17, 0, COLOR_ACCENT, caption, 604);
    button(ui, 56, y + 220, 608, 50, boolean(entitlement, "auto_renew") ?
           "月額テストの同意を取り消す" : "$8.88 / 月のテストに同意する",
           ACTION_CONSENT, !boolean(entitlement, "auto_renew"), NULL, NULL, wallet_allowed(ui, ACTION_CONSENT), 1);
    button(ui, 56, y + 286, 608, 44, "今月のテスト請求を確認・再試行", ACTION_BILL,
           0, NULL, NULL, wallet_allowed(ui, ACTION_BILL), 0);
    y += 368;
    if (*string(billing, "worker_error") || !boolean(billing, "worker_alive")) {
        y += wrapped(ui, 35, y, 645, 16, 27, COLOR_ERROR,
                     *string(billing, "worker_error") ? string(billing, "worker_error") : "請求処理との接続を確認できません。状態を更新してください。", 3) + 18;
    }
    if (*string(record, "last_error"))
        y += wrapped(ui, 35, y, 645, 16, 27, COLOR_MUTED, string(record, "last_error"), 3) + 18;
    return y;
}

static void draw_wallet(struct rock_ui *ui)
{
    json_object *wallet = field(ui->snapshot, "wallet");
    double y = ui->content_top + 6 - ui->scroll;
    char amount[100], other[100], caption[300];
    int can_act = wallet_allowed(ui, ACTION_SALE), can_resolve = wallet_allowed(ui, ACTION_SETTLE);
    if (!wallet || !json_object_is_type(wallet, json_type_object)) {
        empty_state(ui, y, "Walletを取得できません", "接続を確認して更新してください。残高は取得できるまで表示しません。");
        ui->content_height = y + 255 + ui->scroll - ui->content_top;
        return;
    }
    json_object *backend = field(wallet, "backend");
    if (backend) {
        time_t stamp = (time_t)json_object_get_double(field(backend, "last_sync_unix"));
        struct tm utc;
        char when[64] = "未同期";
        if (stamp > 0 && gmtime_r(&stamp, &utc)) strftime(when, sizeof(when), "%Y/%m/%d %H:%M:%S UTC", &utc);
        panel(ui, 32, y, 656, 144, COLOR_WHITE);
        text(ui, 56, y + 34, 22, 1, COLOR_INK, boolean(backend, "stale") ?
             "通信待ち · 保存済みの残高" : "Wallet サーバーと同期済み", 600);
        snprintf(caption, sizeof(caption), "最終同期: %s", when);
        text(ui, 56, y + 66, 15, 0, COLOR_MUTED, caption, 600);
        wrapped(ui, 56, y + 82, 602, 15, 24, COLOR_MUTED, boolean(backend, "pending_reconciliation") ?
                "前の操作の結果を照合しています。新しい操作は照合後に利用できます。" :
                "月額処理は端末の電源OFF中も試験サーバーで進みます。保存済み残高からは支払いません。", 2);
        y += 162;
    }
    y = draw_membership(ui, y, field(wallet, "membership"), field(wallet, "billing"));
    panel(ui, 32, y, 656, 222, COLOR_INK);
    pill(ui, 56, y + 23, boolean(wallet, "simulation_only") ? "SIMULATOR · USD" : "BACKEND · USD",
         0x31584b, 0xe7eddc);
    text(ui, 58, y + 85, 18, 0, 0xc4d6c8, backend && boolean(backend, "stale") ?
         "保存済みのテスト残高" : "利用可能なテスト残高", 550);
    money(amount, sizeof(amount), wallet, "available_minor");
    text(ui, 54, y + 154, 57, 1, COLOR_WHITE, amount, 599);
    text(ui, 58, y + 193, 15, 0, 0xc4d6c8, "テスト台帳の数値です。実際のお金ではありません。", 596);
    star(ui, 634, y + 52, 18, COLOR_GOLD);
    y += 240;
    panel(ui, 32, y, 320, 108, COLOR_WHITE);
    panel(ui, 368, y, 320, 108, COLOR_WHITE);
    text(ui, 56, y + 34, 16, 0, COLOR_MUTED, "未確定のテスト売上", 272);
    text(ui, 392, y + 34, 16, 0, COLOR_MUTED, "引出し予約中", 272);
    money(amount, sizeof(amount), wallet, "pending_minor");
    money(other, sizeof(other), wallet, "held_minor");
    text(ui, 56, y + 78, 31, 1, COLOR_INK, amount, 272);
    text(ui, 392, y + 78, 31, 1, COLOR_INK, other, 272);
    y += 126;
    button(ui, 32, y, 656, 54, ui->wallet_expanded ? "テスト操作を閉じる  −" : "テスト操作を開く  ＋",
           ACTION_WALLET_EXPAND, 0, NULL, NULL, boolean(wallet, "simulation_only") && !backend, 0);
    y += 76;
    if (ui->wallet_expanded && !backend) {
        text(ui, 34, y + 23, 21, 1, COLOR_INK, "シミュレーターの操作", 645);
        y += 41;
        y += wrapped(ui, 35, y, 645, 17, 28, COLOR_MUTED,
                     "以下の操作はローカルのテスト台帳を変更します。入金、請求、ATMとの接続はありません。", 3) + 20;
        text(ui, 35, y + 20, 18, 1, COLOR_INK, "テスト金額 (USD)", 644);
        y += 40;
        text_entry(ui, y, ui->amount, 1);
        y += 82;
        button(ui, 32, y, 320, 53, "売上を作る", ACTION_SALE, 0, NULL, NULL, can_act, 1);
        button(ui, 368, y, 320, 53, auth_required(ui) ? "ATMで内容を確認" : "引出しを予約",
               auth_required(ui) ? ACTION_ATM_OPEN : ACTION_RESERVE, 0, NULL, NULL, can_act, 0);
        y += 70;
        {
            json_object *sales = field(wallet, "sales");
            text(ui, 35, y + 22, 20, 1, COLOR_INK, "テスト売上", 643);
            y += 43;
            if (!array_size(sales)) {
                text(ui, 35, y + 22, 17, 0, COLOR_MUTED, "まだテスト売上はありません。", 643);
                y += 45;
            }
            for (size_t i = 0; i < array_size(sales) && i < 10; i++) {
                json_object *sale = array_item(sales, i);
                panel(ui, 32, y, 656, 100, COLOR_WHITE);
                money(amount, sizeof(amount), sale, "amount_minor");
                text(ui, 54, y + 38, 24, 1, COLOR_INK, amount, 335);
                text(ui, 54, y + 72, 14, 0, COLOR_MUTED, string(sale, "status"), 360);
                button(ui, 464, y + 25, 199, 50, "売上を確定", ACTION_SETTLE, 0,
                       string(sale, "id"), NULL, can_resolve && !strcmp(string(sale, "status"), "PENDING_SETTLEMENT"), 0);
                y += 116;
            }
        }
        {
            json_object *withdrawals = field(wallet, "withdrawals");
            text(ui, 35, y + 22, 20, 1, COLOR_INK, "引出しシミュレーション", 643);
            y += 44;
            if (!array_size(withdrawals)) {
                text(ui, 35, y + 21, 17, 0, COLOR_MUTED, "まだ引出し予約はありません。", 643);
                y += 44;
            }
            for (size_t i = 0; i < array_size(withdrawals) && i < 10; i++) {
                json_object *withdrawal = array_item(withdrawals, i);
                const char *status = string(withdrawal, "status");
                int pending = strcmp(status, "DISPENSED") && strcmp(status, "REVERSED") && strcmp(status, "PARTIAL_REVERSED");
                panel(ui, 32, y, 656, pending ? 215 : 123, COLOR_WHITE);
                money(amount, sizeof(amount), withdrawal, "amount_minor");
                money(other, sizeof(other), withdrawal, "dispensed_minor");
                snprintf(caption, sizeof(caption), "予約 %s · 累計排出 %s", amount, other);
                text(ui, 55, y + 38, 19, 1, COLOR_INK, caption, 609);
                text(ui, 55, y + 73, 15, 0, COLOR_MUTED, status, 608);
                if (pending) {
                    text(ui, 55, y + 108, 14, 0, COLOR_MUTED, auth_required(ui) ? "ATMの現在状態を確認して、未使用の予約を取り消せます。" : "上のテスト金額を累計排出額として使います。", 605);
                    if (auth_required(ui)) {
                        button(ui, 53, y + 136, 612, 52, "ATMの現在状態へ", ACTION_ATM_RESULT, 0,
                               string(withdrawal, "id"), NULL, can_resolve, 0);
                    } else {
                    button(ui, 53, y + 136, 190, 52, "排出を記録", ACTION_DISPENSE, 0, string(withdrawal, "id"), NULL, can_resolve, 0);
                    button(ui, 260, y + 136, 190, 52, "結果不明", ACTION_UNKNOWN, 0, string(withdrawal, "id"), NULL, can_resolve, 0);
                    button(ui, 467, y + 136, 198, 52, "照会して確定", ACTION_RECONCILE, 0, string(withdrawal, "id"), NULL, can_resolve, 0);
                    }
                }
                y += pending ? 231 : 139;
            }
        }
        money(amount, sizeof(amount), wallet, "billed_minor");
        money(other, sizeof(other), wallet, "dispensed_minor");
        snprintf(caption, sizeof(caption), "テスト請求累計 %s · テスト排出累計 %s", amount, other);
        text(ui, 35, y + 20, 16, 0, COLOR_MUTED, caption, 645);
        y += 48;
        y += wrapped(ui, 35, y, 645, 15, 27, COLOR_MUTED,
                     "売上と引出しは直近10件まで表示します。残高と累計はテスト台帳全体の数値です。", 3) + 24;
    }
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int power_operation(const char *operation)
{
    return !strcmp(operation, "device.poweroff") || !strcmp(operation, "device.reboot");
}

static void draw_system(struct rock_ui *ui)
{
    double y = ui->content_top + 6 - ui->scroll;
    json_object *device = field(ui->snapshot, "device");
    panel(ui, 32, y, 656, 136, COLOR_WHITE);
    text(ui, 56, y + 37, 25, 1, COLOR_INK, "Rock star os", 600);
    text(ui, 56, y + 76, 17, 0, COLOR_MUTED, *string(device, "hardware") ? string(device, "hardware") :
         "ネイティブ開発端末", 598);
    text(ui, 56, y + 109, 15, 0, COLOR_MUTED, "画面の案内に従って終了・再起動します。", 599);
    y += 157;
    if (field(ui->snapshot, "device_activation")) {
        button(ui, 32, y, 656, 52, "端末の利用開始・確認", ACTION_NAV, PAGE_ACTIVATION, NULL, NULL, 1, 0);
        y += 71;
    }
    if (ui->power_receipt) {
        panel(ui, 32, y, 656, 159, 0xe1ecdb);
        text(ui, 56, y + 36, 22, 1, COLOR_ACCENT, !strcmp(string(ui->power_receipt, "op"), "reboot") ?
             "再起動の要求を受け付けました" : "電源を切る要求を受け付けました", 600);
        wrapped(ui, 56, y + 58, 604, 18, 30, COLOR_INK,
                "これは要求の受領応答です。端末の終了や再起動が完了したことは、まだ確認できません。", 3);
        y += 181;
    }
    text(ui, 35, y + 23, 22, 1, COLOR_INK, "端末の操作", 641);
    y += 45;
    y += wrapped(ui, 35, y, 645, 18, 30, COLOR_MUTED,
                 "次の画面で確認すると、OS がサービスを終了し、\n保存済みのデータを同期します。", 3) + 27;
    button(ui, 32, y, 656, 60, "再起動する…", ACTION_REBOOT, 0, NULL, NULL, can_mutate(ui), 0);
    y += 78;
    button(ui, 32, y, 656, 60, "電源を切る…", ACTION_POWEROFF, 0, NULL, NULL, can_mutate(ui), 1);
    y += 85;
    y += wrapped(ui, 35, y, 645, 16, 28, COLOR_MUTED,
                 "実行中の道具は停止します。保存していない入力は失われます。", 3) + 24;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void navigate(struct rock_ui *ui, enum rock_page page)
{
    auth_clear_pin(ui);
    ui->atm_code_visible = 0;
    ui->page = page;
    ui->scroll = 0;
    ui->focus = -1;
    ui->editing = 0;
    ui->message[0] = '\0';
}

static json_object *request_new(const char *operation)
{
    json_object *request = json_object_new_object();
    json_object_object_add(request, "v", json_object_new_int(1));
    json_object_object_add(request, "op", json_object_new_string(operation));
    return request;
}

static void put_string(json_object *request, const char *name, const char *value)
{
    json_object_object_add(request, name, json_object_new_string(value));
}

static void send_request(struct rock_ui *ui, json_object *request)
{
    if (ui->busy) {
        if (ui->busy_read && !rock_ui_request_is_read(request) && !ui->queued_request) {
            ui->queued_request = json_object_get(request);
            snprintf(ui->message, sizeof(ui->message), "表示更新の後に、この操作を実行します。");
            ui->message_error = 0;
            return;
        }
        snprintf(ui->message, sizeof(ui->message), "現在の処理が終わるまでお待ちください。");
        return;
    }
    if (ui->submit(ui->submit_context, request) == 0) {
        ui->busy = 1;
        ui->busy_read = rock_ui_request_is_read(request);
        if (!rock_ui_request_is_read(request)) ui->message[0] = '\0';
    } else {
        if (ui->refresh_background && rock_ui_request_is_read(request)) {
            ui->connected = 0;
            snprintf(ui->connection_error, sizeof(ui->connection_error), "状態の読み取りを開始できませんでした。");
        } else {
            snprintf(ui->message, sizeof(ui->message), "要求を送信できませんでした。");
            ui->message_error = 1;
        }
    }
}

void rock_ui_flush_queued(struct rock_ui *ui)
{
    if (ui->busy || !ui->queued_request) return;
    json_object *request = ui->queued_request;
    ui->queued_request = NULL;
    if (ui->connected) send_request(ui, request);
    if (!ui->connected || !ui->busy) {
        if (ui->retry_request) json_object_put(ui->retry_request);
        ui->retry_request = json_object_get(request);
        snprintf(ui->message, sizeof(ui->message), "この操作はまだ送信していません。同じ要求で再試行できます。");
        ui->message_error = 1;
    }
    json_object_put(request);
}

#include "remote-ui.inc"
static int amount_minor(const char *value, int64_t *minor);
#include "atm-ui.inc"
#include "auth-ui.inc"
#include "activation-ui.inc"
#include "mcp-ui.inc"

int rock_ui_refresh_interval(struct rock_ui *ui)
{
    if (activation_pending(ui)) return ui->startup_retry_ms ? ui->startup_retry_ms : 1000;
    if (!ui->connected || ui->queued_request || ui->retry_request || ui->page == PAGE_ACTIVATION)
        return 1000;
    if (ui->page == PAGE_WALLET || ui->page == PAGE_REMOTE || ui->page == PAGE_REMOTE_RESULT ||
        ui->page == PAGE_REMOTE_HISTORY || ui->page == PAGE_ATM || ui->page == PAGE_ATM_STATUS || ui->page >= PAGE_MCP)
        return 1500;
    json_object *jobs = field(hub(ui), "jobs");
    for (size_t i = 0; i < array_size(jobs); i++) if (active_job(array_item(jobs, i))) return 1000;
    if (registry_refreshing(field(ui->snapshot, "registry"))) return 1000;
    return 10000;
}

void rock_ui_poll_reset(struct rock_ui *ui)
{
    ui->refresh_due_ms = 0;
    ui->startup_waiting = ui->startup_retry_ms = 0;
}

void rock_ui_poll_completed(struct rock_ui *ui, int64_t now_ms, int mutation)
{
    /* Measure from completion: a slow read must not immediately start another.
     * Keep normal boot responsive for 30 seconds before backing off a prolonged
     * unavailable state. Only an explicit user action can repeat a mutation. */
    if (activation_pending(ui)) {
        if (!ui->startup_waiting) {
            ui->startup_waiting = 1;
            ui->startup_wait_ms = now_ms;
        }
        if (now_ms - ui->startup_wait_ms < 30000) ui->startup_retry_ms = 1000;
        else if (ui->startup_retry_ms < 8000) ui->startup_retry_ms =
            ui->startup_retry_ms < 2000 ? 2000 : ui->startup_retry_ms * 2;
    } else {
        ui->startup_waiting = ui->startup_retry_ms = 0;
    }
    ui->refresh_due_ms = mutation ? now_ms : now_ms + rock_ui_refresh_interval(ui);
}

int rock_ui_poll(struct rock_ui *ui, int64_t now_ms)
{
    if (ui->busy || ui->queued_request || ui->page == PAGE_AUTH_PIN || now_ms < ui->refresh_due_ms)
        return 0;
    ui->refresh_background = 1;
    rock_ui_refresh(ui);
    if (!ui->busy) {
        ui->refresh_background = 0;
        rock_ui_poll_completed(ui, now_ms, 0);
    }
    return 1;
}

void rock_ui_refresh(struct rock_ui *ui)
{
    if (ui->page == PAGE_AUTH_PIN) return; /* Do not replace displayed authorization while confirming. */
    if (ui->page >= PAGE_MCP) {
        mcp_refresh(ui);
        return;
    }
    if (ui->page == PAGE_WALLET && auth_required(ui) && atm_registered(ui) && ui->auth_poll++ % 2 == 0) {
        json_object *request = request_new("wallet.auth.status");
        send_request(ui, request);
        json_object_put(request);
        return;
    }
    if ((ui->page == PAGE_ATM || ui->page == PAGE_ATM_STATUS) && ui->atm_poll++ % 2 == 0 && atm_registered(ui)) {
        atm_read(ui, ui->page == PAGE_ATM_STATUS);
        return;
    }
    if (ui->page == PAGE_REMOTE_RESULT && *ui->remote_key && ui->remote_poll++ % 2 == 0) {
        remote_read_status(ui);
        return;
    }
    json_object *request = request_new("snapshot");
    send_request(ui, request);
    json_object_put(request);
}

static int amount_minor(const char *value, int64_t *minor)
{
    int64_t whole = 0, fraction = 0;
    int digits = 0, decimal = 0, any = 0;
    for (; *value; value++) {
        if (*value == '.' && !decimal) {
            decimal = 1;
            continue;
        }
        if (*value < '0' || *value > '9') return -1;
        any = 1;
        if (!decimal) {
            whole = whole * 10 + *value - '0';
            if (whole > 1000000) return -1;
        } else {
            if (++digits > 2) return -1;
            fraction = fraction * 10 + *value - '0';
        }
    }
    if (!any) return -1;
    if (digits == 1) fraction *= 10;
    *minor = whole * 100 + fraction;
    return *minor <= 100000000 ? 0 : -1;
}

static void activate(struct rock_ui *ui, const struct rock_hit *target)
{
    json_object *request = NULL;
    char key[40];
    int64_t minor = 0;
    if (!target->enabled) return;
    if (auth_activate(ui, target)) return;
    if (atm_activate(ui, target)) return;
    if (remote_activate(ui, target)) return;
    if (mcp_activate(ui, target)) return;
    switch (target->action) {
    case ACTION_SYSTEM:
        if (ui->page != PAGE_SYSTEM) ui->system_return_page = ui->page;
        navigate(ui, PAGE_SYSTEM);
        return;
    case ACTION_NAV:
        navigate(ui, (enum rock_page)target->number);
        return;
    case ACTION_DETAIL:
        if (ui->page == PAGE_HUB || ui->page == PAGE_INSTALLED) ui->return_page = ui->page;
        snprintf(ui->selected_id, sizeof(ui->selected_id), "%s", target->id);
        snprintf(ui->selected_version, sizeof(ui->selected_version), "%s", target->version);
        navigate(ui, PAGE_DETAIL);
        return;
    case ACTION_VERSION: {
        json_object *entry = catalog_item(ui, target->id, target->version);
        if (ui->page != PAGE_DETAIL || !can_mutate(ui) || installed(ui, ui->selected_id) ||
            boolean(hub(ui), "installed_truncated") || strcmp(target->id, ui->selected_id) ||
            !*target->version || !entry || !*string(entry, "hash")) return;
        snprintf(ui->selected_version, sizeof(ui->selected_version), "%s", target->version);
        ui->scroll = 0;
        ui->focus = -1;
        ui->editing = 0;
        return;
    }
    case ACTION_EDITOR:
        snprintf(ui->selected_id, sizeof(ui->selected_id), "%s", target->id);
        navigate(ui, PAGE_EDITOR);
        return;
    case ACTION_RESULT:
        snprintf(ui->selected_job, sizeof(ui->selected_job), "%s", target->id);
        navigate(ui, PAGE_RESULT);
        return;
    case ACTION_REFRESH:
        rock_ui_poll_reset(ui);
        rock_ui_refresh(ui);
        return;
    case ACTION_INPUT:
        ui->editing = 1;
        return;
    case ACTION_SEARCH:
        ui->editing = 3;
        return;
    case ACTION_SEARCH_CLEAR:
        ui->search[0] = '\0';
        ui->scroll = 0;
        return;
    case ACTION_AMOUNT:
        ui->editing = 2;
        return;
    case ACTION_CLEAR:
        ui->text[0] = '\0';
        return;
    case ACTION_SAMPLE:
        if (!strcmp(ui->selected_id, "org.rockstar.citation-organizer"))
            snprintf(ui->text, sizeof(ui->text),
                     "紹介文（出典: [店舗情報](https://example.test/store)）です。\n\n"
                     "```text\n（出典: [コード内の例](https://example.test/code)）\n```\n");
        else if (!strcmp(ui->selected_id, "org.rockstar.proposal-draft"))
            snprintf(ui->text, sizeof(ui->text),
                     "{\"title\":\"店舗紹介の記事\",\"requirements\":[\"日本語で読みやすく\",\"営業時間を確認する\"],"
                     "\"deliverables\":[\"紹介文の下書き\"],\"deadline\":\"内容確認後に相談\",\"price\":\"見積り後に相談\"}");
        else
            snprintf(ui->text, sizeof(ui->text), "  Plan the day  \n\n\n  Make something useful  \n  Share the result  ");
        return;
    case ACTION_WALLET_EXPAND:
        ui->wallet_expanded = !ui->wallet_expanded;
        return;
    case ACTION_RETRY:
        if (ui->retry_request) send_request(ui, ui->retry_request);
        return;
    case ACTION_DISMISS:
        if (ui->confirm_request) json_object_put(ui->confirm_request);
        ui->confirm_request = NULL;
        ui->focus = -1;
        return;
    case ACTION_CONFIRM:
        if (ui->confirm_request) {
            send_request(ui, ui->confirm_request);
            json_object_put(ui->confirm_request);
            ui->confirm_request = NULL;
        }
        ui->focus = -1;
        return;
    default:
        break;
    }
    if (!can_mutate(ui)) return;
    switch (target->action) {
    case ACTION_INSTALL:
        if (!installed(ui, target->id) && boolean(hub(ui), "installed_truncated")) {
            snprintf(ui->message, sizeof(ui->message), "状態一覧の一部が未取得のため、インストール状態を確認できません。");
            ui->message_error = 1;
            return;
        }
        if (installed(ui, target->id) || strcmp(target->id, ui->selected_id) ||
            strcmp(target->version, ui->selected_version) || !*target->version ||
            !catalog_item(ui, target->id, target->version) ||
            !tool_compatible(catalog_item(ui, target->id, target->version))) return;
        request = request_new("install");
        break;
    case ACTION_APPROVE: request = request_new("approve"); break;
    case ACTION_UPDATE: request = request_new("update"); break;
    case ACTION_ROLLBACK: request = request_new("rollback"); break;
    case ACTION_UNINSTALL: request = request_new("uninstall"); break;
    case ACTION_DISABLE:
        if (!boolean(installed(ui, target->id), "enabled")) return;
        request = request_new("disable"); break;
    case ACTION_RUN:
        if (!manifest_target(field(installed(ui, target->id), "manifest"), "device_local")) return;
        request = request_new("run"); break;
    case ACTION_CANCEL: request = request_new("cancel"); break;
    case ACTION_REGISTRY_REFRESH:
        if (!boolean(field(ui->snapshot, "registry"), "configured") ||
            !boolean(field(ui->snapshot, "registry"), "can_refresh") || registry_refreshing(field(ui->snapshot, "registry")))
            return;
        request = request_new("registry.refresh");
        break;
    case ACTION_POWEROFF: request = request_new("device.poweroff"); break;
    case ACTION_REBOOT: request = request_new("device.reboot"); break;
    case ACTION_DEVICE_ACTIVATE:
        if (!activation_ready(ui) || !can_mutate(ui)) return;
        request = request_new("device.activation.activate"); break;
    case ACTION_WALLET_REGISTER: request = request_new("wallet.register"); break;
    case ACTION_CONSENT: request = request_new("wallet.consent"); break;
    case ACTION_SALE: request = request_new("wallet.sale"); break;
    case ACTION_SETTLE: request = request_new("wallet.settle"); break;
    case ACTION_BILL: request = request_new("wallet.bill"); break;
    case ACTION_RESERVE: request = request_new("wallet.reserve"); break;
    case ACTION_DISPENSE: request = request_new("wallet.dispense"); break;
    case ACTION_UNKNOWN: request = request_new("wallet.unknown"); break;
    case ACTION_RECONCILE: request = request_new("wallet.reconcile"); break;
    default: return;
    }
    if ((!strncmp(string(request, "op"), "wallet.", 7)) && !wallet_allowed(ui, target->action)) {
        json_object_put(request);
        return;
    }
    if (rock_request_key(key, sizeof(key)) < 0) {
        snprintf(ui->message, sizeof(ui->message), "要求キーを生成できません。再接続してください。");
        ui->message_error = 1;
        json_object_put(request);
        return;
    }
    put_string(request, "key", key);
    if (*target->id) put_string(request, "id", target->id);
    if (*target->version) put_string(request, "version", target->version);
    if (target->action == ACTION_APPROVE)
        put_string(request, "approved_hash", string(installed(ui, target->id), "hash"));
    if (target->action == ACTION_RUN) {
        put_string(request, "text", ui->text);
        put_string(request, "target", "device_local");
    }
    if (target->action == ACTION_CONSENT) {
        json_object_object_add(request, "accepted", json_object_new_boolean(target->number));
        put_string(request, "terms_version", string(field(field(ui->snapshot, "wallet"), "membership"), "terms_version"));
    }
    if (target->action == ACTION_BILL) {
        char period[16];
        time_t now = time(NULL);
        struct tm utc;
        gmtime_r(&now, &utc);
        strftime(period, sizeof(period), "%Y-%m", &utc);
        put_string(request, "period", period);
    }
    if (target->action == ACTION_SALE || target->action == ACTION_RESERVE ||
        target->action == ACTION_DISPENSE || target->action == ACTION_RECONCILE) {
        if (amount_minor(ui->amount, &minor) < 0 ||
            ((target->action == ACTION_SALE || target->action == ACTION_RESERVE) && minor == 0)) {
            snprintf(ui->message, sizeof(ui->message), "テスト金額を小数点以下2桁以内で入力してください。");
            ui->message_error = 1;
            json_object_put(request);
            return;
        }
        json_object_object_add(request, target->action == ACTION_DISPENSE ? "dispensed_minor" :
                               target->action == ACTION_RECONCILE ? "total_dispensed_minor" : "amount_minor",
                               json_object_new_int64(minor));
    }
    if (target->action == ACTION_UNINSTALL || target->action == ACTION_ROLLBACK || target->action == ACTION_DISABLE ||
        target->action == ACTION_POWEROFF || target->action == ACTION_REBOOT) {
        if (ui->confirm_request) json_object_put(ui->confirm_request);
        ui->confirm_request = request;
        snprintf(ui->confirm_title, sizeof(ui->confirm_title), target->action == ACTION_UNINSTALL ?
                 "このツールを削除しますか？" : target->action == ACTION_DISABLE ? "このツールの利用を停止しますか？" :
                 target->action == ACTION_ROLLBACK ? "以前のバージョンへ戻しますか？" :
                 target->action == ACTION_POWEROFF ? "端末の電源を切りますか？" : "端末を再起動しますか？");
        ui->focus = -1;
        ui->editing = 0;
        return;
    }
    send_request(ui, request);
    json_object_put(request);
}

void rock_ui_response(struct rock_ui *ui, json_object *request, json_object *response, const char *error)
{
    const char *operation = string(request, "op");
    int snapshot = !strcmp(operation, "snapshot");
    int read_only = rock_ui_request_is_read(request);
    int background_read = ui->refresh_background && read_only;
    ui->refresh_background = 0;
    ui->busy = 0;
    ui->busy_read = 0;
    if (rock_auth_operation(operation)) { (void)auth_response(ui, request, response); return; }
    if (!response) {
        if (!strcmp(operation, "mcp.snapshot")) mcp_replace(&ui->mcp_view, NULL);
        if (!strcmp(operation, "mcp.status")) mcp_replace(&ui->mcp_status, NULL);
        ui->atm_code_visible = 0;
        if (ui->atm_status) json_object_put(ui->atm_status);
        ui->atm_status = NULL;
        ui->connected = 0;
        snprintf(ui->connection_error, sizeof(ui->connection_error), "%s", error && *error ? error : "応答を取得できません");
        if (!read_only) {
            if (ui->retry_request) json_object_put(ui->retry_request);
            ui->retry_request = json_object_get(request);
            snprintf(ui->message, sizeof(ui->message), "結果を確認できません。同じ要求キーで再試行できます。");
            ui->message_error = 1;
        }
        return;
    }
    if (!boolean(response, "ok")) {
        if (!strcmp(operation, "mcp.snapshot")) mcp_replace(&ui->mcp_view, NULL);
        if (!strcmp(operation, "mcp.status")) mcp_replace(&ui->mcp_status, NULL);
        const char *message = string(response, "error");
        if (!*message) message = string(field(response, "error"), "message");
        ui->atm_code_visible = 0;
        if (ui->atm_status) json_object_put(ui->atm_status);
        ui->atm_status = NULL;
        if ((power_operation(operation) || (!strncmp(operation, "remote.", 7) && !read_only) ||
             (!strncmp(operation, "mcp.", 4) && !read_only) ||
             (!strncmp(operation, "wallet.", 7) && !read_only) ||
             !strcmp(operation, "device.activation.activate")) &&
            !strcmp(string(response, "code"), "unavailable")) {
            rock_ui_response(ui, request, NULL, *message ? message : "端末操作の受領結果を確認できません");
            return;
        }
        if (!background_read) {
            snprintf(ui->message, sizeof(ui->message), "%s", *message ? message : "サービスが要求を拒否しました。");
            ui->message_error = 1;
        }
        if (is_retry(ui, request) && (!strcmp(string(response, "code"), "rejected") ||
                                      !strcmp(string(response, "code"), "unauthorized") ||
                                      (power_operation(operation) && !strcmp(string(response, "code"), "busy")))) {
            json_object_put(ui->retry_request);
            ui->retry_request = NULL;
        }
        if (snapshot) {
            ui->connected = 0;
            snprintf(ui->connection_error, sizeof(ui->connection_error), "スナップショットを取得できません");
        }
        return;
    }
    if (auth_response(ui, request, response)) return;
    if (remote_response(ui, request, response)) return;
    if (atm_response(ui, request, response)) return;
    if (activation_response(ui, request, response)) return;
    if (mcp_response(ui, request, response)) return;
    if (power_operation(operation)) {
        json_object *result = field(response, "result"), *accepted_value = field(result, "accepted");
        if (!accepted_value || !json_object_is_type(accepted_value, json_type_boolean) || !json_object_get_boolean(accepted_value) ||
            strcmp(string(result, "key"), string(request, "key")) || strcmp(string(result, "op"), operation + 7) ||
            strlen(string(result, "boot_id")) != 36) {
            rock_ui_response(ui, request, NULL, "端末操作の受領応答が不完全です。同じ要求で再確認してください。");
            return;
        }
    }
    if (snapshot) {
        json_object *state = field(response, "snapshot");
        if (!state || !json_object_is_type(state, json_type_object) ||
            !json_object_is_type(field(state, "hub"), json_type_object) ||
            !json_object_is_type(field(state, "catalog"), json_type_array)) {
            ui->connected = 0;
            snprintf(ui->connection_error, sizeof(ui->connection_error), "サービスの状態データが不完全です");
            return;
        }
        if (ui->snapshot) json_object_put(ui->snapshot);
        ui->snapshot = json_object_get(state);
        if (ui->wallet_auth) { json_object_put(ui->wallet_auth); ui->wallet_auth = NULL; }
        ui->connected = 1;
        ui->connection_error[0] = '\0';
        json_object *activation = field(state, "device_activation");
        if (activation && !strict_bool(activation, "recovery_required", 0) &&
            !strcmp(ui->message, "利用開始を記録しました。Hubからツールを追加できます。")) ui->message[0] = '\0';
        if (!ui->activation_seen && activation &&
            strict_string(field(state, "service_access"), "mode", "purchaser-fixture")) {
            ui->activation_seen = 1;
            if (ui->page == PAGE_HUB && !ui->retry_request && !ui->queued_request &&
                !ui->editing && !ui->confirm_request && !ui->message_error &&
                (!activation_view_valid(activation) || !strict_string(activation, "state", "ACTIVE") ||
                 !strict_bool(activation, "recovery_required", 0))) navigate(ui, PAGE_ACTIVATION);
        }
        if (ui->page == PAGE_RESULT && job(ui, ui->selected_job) && !active_job(job(ui, ui->selected_job)) &&
            !strcmp(ui->message, "実行要求を受け付けました。状態を取得しています。"))
            ui->message[0] = '\0';
    } else {
        if (is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
        ui->message_error = 0;
        if (power_operation(operation)) {
            if (ui->power_receipt) json_object_put(ui->power_receipt);
            ui->power_receipt = json_object_get(field(response, "result"));
            navigate(ui, PAGE_SYSTEM);
        } else if (!strcmp(operation, "run")) {
            const char *id = string(field(response, "result"), "id");
            if (*id) {
                snprintf(ui->selected_job, sizeof(ui->selected_job), "%s", id);
                navigate(ui, PAGE_RESULT);
            }
            snprintf(ui->message, sizeof(ui->message), "実行要求を受け付けました。状態を取得しています。");
        } else if (!strcmp(operation, "install") || !strcmp(operation, "update")) {
            snprintf(ui->message, sizeof(ui->message), "インストールしました。権限を確認して利用を許可してください。");
        } else if (!strcmp(operation, "approve")) {
            snprintf(ui->message, sizeof(ui->message), "このツールの利用を許可しました。");
        } else if (!strcmp(operation, "disable")) {
            snprintf(ui->message, sizeof(ui->message), "ツールの利用を停止しました。再開するときは権限を確認してください。");
        } else if (!strcmp(operation, "uninstall")) {
            navigate(ui, PAGE_INSTALLED);
            snprintf(ui->message, sizeof(ui->message), "ツールを削除しました。実行履歴は残ります。");
        } else if (!strcmp(operation, "registry.refresh")) {
            snprintf(ui->message, sizeof(ui->message), "カタログの取得を受け付けました。結果はこの画面で確認できます。");
        } else if (!strcmp(operation, "wallet.register")) {
            ui->scroll = 0;
            ui->focus = -1;
            snprintf(ui->message, sizeof(ui->message), "テスト登録を行いました。月額テストへの同意は別の操作です。");
        } else if (!strcmp(operation, "wallet.consent")) {
            snprintf(ui->message, sizeof(ui->message), boolean(request, "accepted") ?
                     "月額テストへの同意を記録しました。請求結果はまだ確定していません。" :
                     "今後の月額テストへの同意を取り消しました。処理中の請求は照合が続きます。");
        } else if (!strcmp(operation, "wallet.bill")) {
            snprintf(ui->message, sizeof(ui->message), "請求要求を受け付けました。完了は請求状況で確認してください。");
        } else if (!strncmp(operation, "wallet.", 7)) {
            snprintf(ui->message, sizeof(ui->message), "テスト台帳を更新しました。");
        } else {
            snprintf(ui->message, sizeof(ui->message), "要求を受け付けました。状態を更新しています。");
        }
    }
}

static void nav_icon(struct rock_ui *ui, double x, double y, int page, unsigned rgb)
{
    cairo_t *cr = ui->cr;
    cairo_new_path(cr);
    color(cr, rgb);
    cairo_set_line_width(cr, 2);
    if (page == PAGE_HUB) {
        for (int i = 0; i < 4; i++) {
            rounded(cr, x + (i % 2) * 12, y + (i / 2) * 12, 8, 8, 2);
            cairo_stroke(cr);
        }
    } else if (page == PAGE_INSTALLED) {
        rounded(cr, x, y + 1, 23, 19, 4);
        cairo_stroke(cr);
        cairo_move_to(cr, x + 6, y + 10);
        cairo_line_to(cr, x + 10, y + 14);
        cairo_line_to(cr, x + 17, y + 6);
        cairo_stroke(cr);
    } else if (page == PAGE_HISTORY) {
        cairo_arc(cr, x + 11, y + 11, 10, 0, 6.28318530718);
        cairo_move_to(cr, x + 11, y + 4);
        cairo_line_to(cr, x + 11, y + 11);
        cairo_line_to(cr, x + 16, y + 14);
        cairo_stroke(cr);
    } else {
        rounded(cr, x - 1, y + 2, 25, 18, 3);
        cairo_stroke(cr);
        rounded(cr, x + 13, y + 7, 11, 9, 2);
        cairo_stroke(cr);
    }
}

void rock_ui_draw(struct rock_ui *ui)
{
    static const char *titles[] = { "自動化を探す", "マイツール", "実行履歴", "Wallet", "ツールの詳細", "ツールを使う", "実行結果", "端末",
                                    "送信内容の確認", "遠隔の実行結果", "遠隔の実行履歴", "ATMテスト", "予約の状態", "試験認証の確認", "使い始める",
                                    "接続して使う道具", "内容を確認する", "接続先の実行結果" };
    static const char *tabs[] = { "Hub", "ツール", "履歴", "Wallet" };
    char clock_text[32], subtitle[200];
    time_t now = time(NULL);
    struct tm local;
    int active = ui->page <= PAGE_WALLET ? (int)ui->page :
                 (ui->page == PAGE_RESULT || ui->page == PAGE_REMOTE_RESULT || ui->page == PAGE_REMOTE_HISTORY) ? PAGE_HISTORY :
                 (ui->page >= PAGE_ATM && ui->page <= PAGE_AUTH_PIN) ? PAGE_WALLET :
                 ui->page == PAGE_SYSTEM || ui->page == PAGE_ACTIVATION ? -1 : ui->page >= PAGE_MCP ? PAGE_HUB : PAGE_INSTALLED;
    json_object *registry = field(ui->snapshot, "registry");
    int registry_failed = ui->page == PAGE_HUB && ui->connected && !strcmp(string(registry, "status"), "error");
    const char *banner = ui->message[0] ? ui->message : NULL;
    if (ui->retry_request && !banner)
        banner = "結果が未確認の要求があります。同じ要求で再確認できます。";
    if (registry_failed && !ui->message_error && !ui->retry_request)
        banner = *string(registry, "last_error") ? string(registry, "last_error") : "カタログの取得に失敗しました。保存済みの情報を表示しています。";
    if (!ui->connected && !banner)
        banner = ui->snapshot ? "オフライン · 最後に取得した情報を表示しています" : "サービスに接続できません。再接続を試みています。";
    cairo_t *cr = ui->cr;
    cairo_identity_matrix(cr);
    color(cr, 0x13271f);
    cairo_paint(cr);
    cairo_translate(cr, ui->offset_x, ui->offset_y);
    cairo_scale(cr, ui->scale, ui->scale);
    cairo_save(cr);
    cairo_rectangle(cr, 0, 0, ROCK_UI_WIDTH, ROCK_UI_HEIGHT);
    cairo_clip(cr);
    color(cr, COLOR_BG);
    cairo_paint(cr);
    ui->hit_count = 0;
    ui->content_top = banner ? 200 : 158;
    if (localtime_r(&now, &local)) strftime(clock_text, sizeof(clock_text), "%H:%M", &local);
    else snprintf(clock_text, sizeof(clock_text), "--:--");
    text(ui, 34, 31, 16, 1, COLOR_INK, clock_text, 160);
    text(ui, 219, 31, 15, 1, COLOR_INK, "RockstarOS", 168);
    json_object *wallet_backend = (ui->page == PAGE_WALLET || ui->page == PAGE_ATM || ui->page == PAGE_ATM_STATUS) ?
        field(field(ui->snapshot, "wallet"), "backend") : NULL;
    int wallet_wait = wallet_backend && (!boolean(wallet_backend, "connected") || boolean(wallet_backend, "stale"));
    int wallet_pending = wallet_backend && boolean(wallet_backend, "pending_reconciliation");
    const char *connection_label = !ui->connected ? "未接続" : wallet_wait ? "同期待ち" :
        wallet_pending ? "照合中" : wallet_backend ? "同期済み" : "接続中";
    color(cr, !ui->connected ? COLOR_ERROR : (wallet_wait || wallet_pending) ? COLOR_GOLD : COLOR_ACCENT);
    cairo_new_path(cr);
    cairo_arc(cr, 397, 26, 3.5, 0, 6.28318530718);
    cairo_fill(cr);
    text(ui, 409, 31, 12, 0, COLOR_MUTED, connection_label, 75);
    text(ui, 32, 97, 32, 1, COLOR_INK, titles[ui->page], 500);
    if (ui->page == PAGE_HUB)
        registry_caption(ui, subtitle, sizeof(subtitle));
    else if (ui->page == PAGE_INSTALLED) {
        json_object *total = field(hub(ui), "total_installed");
        if (boolean(hub(ui), "installed_truncated") && total && json_object_is_type(total, json_type_int))
            snprintf(subtitle, sizeof(subtitle), "全%" PRId64 "個のうち%zu個を表示", json_object_get_int64(total), array_size(field(hub(ui), "installed")));
        else
            snprintf(subtitle, sizeof(subtitle), ui->snapshot ? "%zu個の道具 · この端末で使えます" : "サービスに接続すると道具が表示されます", array_size(field(hub(ui), "installed")));
    }
    else if (ui->page == PAGE_HISTORY) {
        json_object *total = field(hub(ui), "total_jobs");
        if (boolean(hub(ui), "jobs_truncated") && total && json_object_is_type(total, json_type_int))
            snprintf(subtitle, sizeof(subtitle), "直近%zu件を表示 · 全%" PRId64 "件の記録", array_size(field(hub(ui), "jobs")), json_object_get_int64(total));
        else
            snprintf(subtitle, sizeof(subtitle), ui->snapshot ? "%zu件の実行記録 · 状態と結果を確認" : "サービスに接続すると履歴が表示されます", array_size(field(hub(ui), "jobs")));
    }
    else if (ui->page == PAGE_SYSTEM)
        snprintf(subtitle, sizeof(subtitle), "保存してから、端末を終了・再起動");
    else if (ui->page == PAGE_ACTIVATION)
        snprintf(subtitle, sizeof(subtitle), "確認済みの端末から、ひとつのタップで");
    else if (ui->page >= PAGE_MCP)
        snprintf(subtitle, sizeof(subtitle), "接続・確認・解除 · 所有環境での開発試験");
    else if (ui->page >= PAGE_ATM)
        snprintf(subtitle, sizeof(subtitle), "シミュレーター · 実ATMには接続しません");
    else if (ui->page >= PAGE_REMOTE)
        snprintf(subtitle, sizeof(subtitle), "送信先と入力を選び、状態と結果を確認");
    else if (ui->page == PAGE_WALLET)
        snprintf(subtitle, sizeof(subtitle), "シミュレーター · 実際の資金ではありません");
    else
        snprintf(subtitle, sizeof(subtitle), "使う道具も、渡すデータも、自分で選ぶ。");
    text(ui, 34, 134, 16, 0, registry_failed ? COLOR_ERROR : COLOR_MUTED, subtitle,
         ui->page == PAGE_HUB ? 482 : 648);
    button(ui, 558, 62, 130, 42, ui->busy && !ui->busy_read ? "処理中…" : "更新", ACTION_REFRESH, 0, NULL, NULL, !ui->busy, 0);
    if (ui->page == PAGE_HUB)
        button(ui, 528, 109, 160, 36, registry_refreshing(registry) ? "取得中…" : "一覧を更新", ACTION_REGISTRY_REFRESH,
               0, NULL, NULL, can_mutate(ui) && boolean(registry, "configured") && boolean(registry, "can_refresh") &&
               !registry_refreshing(registry), 0);
    if (banner) {
        int error = ui->message_error || !ui->connected || registry_failed;
        panel(ui, 32, 148, 656, 40, error ? 0xf2e1d9 : 0xe1ecdb);
        text(ui, 47, 174, 15, 0, error ? COLOR_ERROR : COLOR_ACCENT, banner,
             ui->retry_request ? 482 : 620);
        if (ui->retry_request)
            button(ui, 541, 152, 139, 32, "同じ要求で再試行", ACTION_RETRY, 0, NULL, NULL, !ui->busy, 0);
    }
    cairo_save(cr);
    cairo_rectangle(cr, 0, ui->content_top, ROCK_UI_WIDTH, 856 - ui->content_top);
    cairo_clip(cr);
    if (!ui->snapshot) {
        double y = ui->content_top + 10;
        empty_state(ui, y, "サービスへの接続を待っています", "カタログ、実行履歴、残高はサービスから取得した値だけを表示します。");
        wrapped(ui, 40, y + 269, 640, 16, 27, COLOR_ERROR, ui->connection_error, 4);
        button(ui, 32, y + 397, 656, 56, "もう一度接続する", ACTION_REFRESH, 0, NULL, NULL, !ui->busy, 1);
        ui->content_height = 0;
    } else {
        switch (ui->page) {
        case PAGE_HUB: draw_catalog(ui, 0); break;
        case PAGE_INSTALLED: draw_catalog(ui, 1); break;
        case PAGE_DETAIL: draw_detail(ui); break;
        case PAGE_EDITOR: draw_editor(ui); break;
        case PAGE_HISTORY: draw_history(ui); break;
        case PAGE_RESULT: draw_result(ui); break;
        case PAGE_WALLET: draw_wallet(ui); break;
        case PAGE_SYSTEM: draw_system(ui); break;
        case PAGE_REMOTE: draw_remote(ui); break;
        case PAGE_REMOTE_RESULT: draw_remote_result(ui); break;
        case PAGE_REMOTE_HISTORY: draw_remote_history(ui); break;
        case PAGE_MCP: draw_mcp(ui); break;
        case PAGE_MCP_TOOL: draw_mcp_tool(ui); break;
        case PAGE_MCP_RESULT: draw_mcp_result(ui); break;
        case PAGE_ATM: draw_atm(ui); break;
        case PAGE_ATM_STATUS: draw_atm_status(ui); break;
        case PAGE_AUTH_PIN: break; /* Full native confirmation overlay below. */
        case PAGE_ACTIVATION: draw_activation(ui); break;
        }
    }
    cairo_restore(cr);
    if (ui->content_height > 856 - ui->content_top) {
        double range = 856 - ui->content_top;
        double thumb = fmax(25, range * range / ui->content_height);
        double position = ui->scroll / (ui->content_height - range) * (range - thumb);
        panel(ui, 710, ui->content_top + position, 4, thumb, 0xb6c6b7);
    }
    color(cr, COLOR_LINE);
    cairo_set_line_width(cr, 1);
    cairo_move_to(cr, 32, 867);
    cairo_line_to(cr, 688, 867);
    cairo_stroke(cr);
    for (int i = 0; i < 4; i++) {
        double x = 32 + 164 * i;
        if (active == i) panel(ui, x + 5, 878, 154, 66, 0xe1e9dc);
        nav_icon(ui, x + 71, 888, i, active == i ? COLOR_ACCENT : COLOR_MUTED);
        font(ui, 14, active == i);
        cairo_text_extents_t extents;
        cairo_text_extents(cr, tabs[i], &extents);
        text(ui, x + (164 - extents.x_advance) / 2, 934, 14, active == i,
             active == i ? COLOR_ACCENT : COLOR_MUTED, tabs[i], 155);
        hit(ui, x, 878, 164, 68, ACTION_NAV, i, NULL, NULL, 1);
    }
    /* Added last to preserve existing Hub/detail keyboard focus order. */
    button(ui, 584, 7, 104, 39, "端末", ACTION_SYSTEM, 0, NULL, NULL, 1, 0);
    if (ui->page == PAGE_WALLET)
        button(ui, 490, 7, 82, 39, "ATM", ACTION_ATM_OPEN, 0, NULL, NULL, 1, 0);
    if (ui->confirm_request) {
        ui->hit_count = 0;
        cairo_set_source_rgba(cr, .05, .13, .10, .55);
        cairo_paint(cr);
        panel(ui, 64, 318, 592, 312, COLOR_WHITE);
        text(ui, 94, 369, 24, 1, COLOR_INK, ui->confirm_title, 531);
        int power = power_operation(string(ui->confirm_request, "op"));
        int atm = !strcmp(string(ui->confirm_request, "op"), "wallet.atm.issue");
        int terms = !strcmp(string(ui->confirm_request, "op"), "wallet.terms");
        char atm_amount[80];
        money(atm_amount, sizeof(atm_amount), ui->confirm_request, "amount_minor");
        text(ui, 94, 414, 20, 0, COLOR_INK, terms ? "rock-wallet-development/1" : atm ? atm_amount : power ? "端末全体の操作です" :
             tool_name(ui, string(ui->confirm_request, "id")), 531);
        wrapped(ui, 94, 441, 531, 17, 29, COLOR_MUTED, terms ?
                "公開情報を使うWallet・ATMの開発試験です。\n実資金・実ATM・本人確認には接続しません。\n月額料金への同意は、この後の別操作です。" : atm ?
                "SIM-ATM-001の開発試験です。\n予約額をテスト残高から保留へ移します。\nコード未使用なら取消で戻せます。" : power ?
                "実行中の道具を終了します。\n保存していない入力は失われます。\n準備ができてから実行してください。" :
                !strcmp(string(ui->confirm_request, "op"), "uninstall") ?
                "インストールしたツールを削除します。実行履歴は残ります。" :
                !strcmp(string(ui->confirm_request, "op"), "disable") ?
                "このツールの利用を停止します。\n実行中の処理も停止対象です。\n再開するときは権限を確認してください。" :
                "選択した保存済みバージョンに戻します。権限は再確認が必要です。", 3);
        button(ui, 93, 550, 254, 53, "戻る", ACTION_DISMISS, 0, NULL, NULL, 1, 0);
        button(ui, 369, 550, 256, 53, "確認して実行", ACTION_CONFIRM, 0, NULL, NULL, can_mutate(ui), 1);
    }
    if (ui->page == PAGE_AUTH_PIN) draw_auth_pin(ui);
    if (ui->pointer_visible) {
        double x = (ui->pointer_x - ui->offset_x) / ui->scale;
        double y = (ui->pointer_y - ui->offset_y) / ui->scale;
        cairo_set_source_rgba(cr, .1, .3, .23, .65);
        cairo_new_path(cr);
        cairo_arc(cr, x, y, 7, 0, 6.28318530718);
        cairo_fill_preserve(cr);
        color(cr, COLOR_WHITE);
        cairo_set_line_width(cr, 1.5);
        cairo_stroke(cr);
    }
    cairo_restore(cr);
    cairo_surface_flush(ui->surface);
}

int rock_ui_init(struct rock_ui *ui, int width, int height, const char *font_path,
                 int (*submit)(void *, json_object *), void *context,
                 char *error, size_t size)
{
    memset(ui, 0, sizeof(*ui));
    ui->width = width;
    ui->height = height;
    ui->scale = fmin(width / (double)ROCK_UI_WIDTH, height / (double)ROCK_UI_HEIGHT);
    ui->offset_x = (width - ROCK_UI_WIDTH * ui->scale) / 2;
    ui->offset_y = (height - ROCK_UI_HEIGHT * ui->scale) / 2;
    ui->page = PAGE_HUB;
    ui->return_page = PAGE_HUB;
    ui->focus = -1;
    ui->submit = submit;
    ui->submit_context = context;
    snprintf(ui->connection_error, sizeof(ui->connection_error), "ローカルサービスへ接続しています…");
    if (FT_Init_FreeType(&ui->ft) || FT_New_Face(ui->ft, font_path, 0, &ui->face) ||
        FT_New_Face(ui->ft, font_path, 0, &ui->bold_face)) {
        snprintf(error, size, "Japanese font could not be loaded: %s", font_path);
        rock_ui_destroy(ui);
        return -1;
    }
    ui->font = cairo_ft_font_face_create_for_ft_face(ui->face, FT_LOAD_DEFAULT);
    ui->bold = cairo_ft_font_face_create_for_ft_face(ui->bold_face, FT_LOAD_DEFAULT);
    cairo_ft_font_face_set_synthesize(ui->bold, CAIRO_FT_SYNTHESIZE_BOLD);
    ui->surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, width, height);
    ui->cr = cairo_create(ui->surface);
    if (cairo_font_face_status(ui->font) != CAIRO_STATUS_SUCCESS ||
        cairo_font_face_status(ui->bold) != CAIRO_STATUS_SUCCESS ||
        cairo_status(ui->cr) != CAIRO_STATUS_SUCCESS) {
        snprintf(error, size, "Cairo renderer initialization failed");
        rock_ui_destroy(ui);
        return -1;
    }
    cairo_font_options_t *options = cairo_font_options_create();
    cairo_font_options_set_antialias(options, CAIRO_ANTIALIAS_GRAY);
    cairo_font_options_set_hint_style(options, CAIRO_HINT_STYLE_SLIGHT);
    cairo_set_font_options(ui->cr, options);
    cairo_font_options_destroy(options);
    return 0;
}

void rock_ui_destroy(struct rock_ui *ui)
{
    auth_reset(ui);
    if (ui->wallet_auth) json_object_put(ui->wallet_auth);
    if (ui->snapshot) json_object_put(ui->snapshot);
    if (ui->remote_prepared) json_object_put(ui->remote_prepared);
    if (ui->queued_request) json_object_put(ui->queued_request);
    if (ui->atm_history) json_object_put(ui->atm_history);
    if (ui->atm_status) json_object_put(ui->atm_status);
    if (ui->atm_issue) json_object_put(ui->atm_issue);
    if (ui->remote_status) json_object_put(ui->remote_status);
    if (ui->mcp_view) json_object_put(ui->mcp_view);
    if (ui->mcp_prepared) json_object_put(ui->mcp_prepared);
    if (ui->mcp_status) json_object_put(ui->mcp_status);
    if (ui->power_receipt) json_object_put(ui->power_receipt);
    if (ui->retry_request) json_object_put(ui->retry_request);
    if (ui->confirm_request) json_object_put(ui->confirm_request);
    if (ui->cr) cairo_destroy(ui->cr);
    if (ui->surface) cairo_surface_destroy(ui->surface);
    if (ui->font) cairo_font_face_destroy(ui->font);
    if (ui->bold) cairo_font_face_destroy(ui->bold);
    if (ui->face) FT_Done_Face(ui->face);
    if (ui->bold_face) FT_Done_Face(ui->bold_face);
    if (ui->ft) FT_Done_FreeType(ui->ft);
    memset(ui, 0, sizeof(*ui));
}

void rock_ui_scroll(struct rock_ui *ui, double amount)
{
    double maximum = fmax(0, ui->content_height - (856 - ui->content_top));
    ui->scroll = fmin(maximum, fmax(0, ui->scroll + amount));
    ui->focus = -1;
}

void rock_ui_pointer(struct rock_ui *ui, int x, int y, int state)
{
    double logical_x = (x - ui->offset_x) / ui->scale;
    double logical_y = (y - ui->offset_y) / ui->scale;
    ui->pointer_x = x;
    ui->pointer_y = y;
    ui->pointer_visible = 1;
    if (state == 1 && !ui->pointer_down) {
        ui->pointer_down = 1;
        ui->press_x = x;
        ui->press_y = y;
        ui->press_scroll = ui->scroll;
        ui->dragged = 0;
    } else if (state == 0 && ui->pointer_down) {
        ui->pointer_down = 0;
        if (!ui->dragged) {
            for (int i = ui->hit_count - 1; i >= 0; i--) {
                const struct rock_hit *target = &ui->hits[i];
                if (logical_x >= target->x && logical_x < target->x + target->w &&
                    logical_y >= target->y && logical_y < target->y + target->h && target->enabled) {
                    struct rock_hit copy = *target;
                    ui->focus = i;
                    ui->editing = 0;
                    ui->select_all = 0;
                    activate(ui, &copy);
                    break;
                }
            }
        }
    } else if (ui->pointer_down && !ui->confirm_request && ui->page != PAGE_AUTH_PIN &&
               (ui->press_y - ui->offset_y) / ui->scale >= ui->content_top &&
               (ui->press_y - ui->offset_y) / ui->scale < 856 && abs(y - ui->press_y) > 12) {
        ui->dragged = 1;
        rock_ui_scroll(ui, ui->press_scroll + (ui->press_y - y) / ui->scale - ui->scroll);
    }
}

int rock_ui_text(struct rock_ui *ui, const char *value)
{
    char *destination = ui->editing == 4 ? ui->auth_pin : ui->editing == 3 ? ui->search : ui->editing == 2 ? ui->amount : ui->text;
    size_t capacity = ui->editing == 4 ? sizeof(ui->auth_pin) : ui->editing == 3 ? sizeof(ui->search) : ui->editing == 2 ? sizeof(ui->amount) : sizeof(ui->text);
    size_t existing = ui->select_all ? 0 : strlen(destination), addition = strlen(value);
    if (!ui->editing || ui->confirm_request) return -1;
    if (addition >= capacity - existing) {
        snprintf(ui->message, sizeof(ui->message), ui->editing == 4 ? "試験PINは数字4桁です。" : ui->editing == 3 ? "検索は128 bytesまでです。" : ui->editing == 2 ? "金額の入力が長すぎます。" : "入力は4096 bytesまでです。");
        ui->message_error = 1;
        return -1;
    }
    if (ui->editing == 4) {
        if (ui->page != PAGE_AUTH_PIN || ui->busy || ui->retry_request) return -1;
        for (const char *p = value; *p; p++) if (*p < '0' || *p > '9') return -1;
    }
    if (ui->editing == 2) {
        for (const char *p = value; *p; p++) if ((*p < '0' || *p > '9') && *p != '.') return -1;
    }
    if (ui->editing == 3) {
        for (const unsigned char *p = (const unsigned char *)value; *p; p++) if (*p < 32 || *p == 127) return -1;
        ui->scroll = 0;
    }
    if (ui->select_all) { destination[0] = '\0'; ui->select_all = 0; }
    memcpy(destination + existing, value, addition + 1);
    return 0;
}

static char key_character(unsigned code, int upper, int shift)
{
    static const struct { unsigned code; char normal, shifted; } symbols[] = {
        { KEY_1, '1', '!' }, { KEY_2, '2', '@' }, { KEY_3, '3', '#' }, { KEY_4, '4', '$' },
        { KEY_5, '5', '%' }, { KEY_6, '6', '^' }, { KEY_7, '7', '&' }, { KEY_8, '8', '*' },
        { KEY_9, '9', '(' }, { KEY_0, '0', ')' }, { KEY_MINUS, '-', '_' }, { KEY_EQUAL, '=', '+' },
        { KEY_LEFTBRACE, '[', '{' }, { KEY_RIGHTBRACE, ']', '}' }, { KEY_SEMICOLON, ';', ':' },
        { KEY_APOSTROPHE, '\'', '"' }, { KEY_GRAVE, '`', '~' }, { KEY_BACKSLASH, '\\', '|' },
        { KEY_COMMA, ',', '<' }, { KEY_DOT, '.', '>' }, { KEY_SLASH, '/', '?' }, { KEY_SPACE, ' ', ' ' }
    };
    static const unsigned letters[] = { KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F, KEY_G,
        KEY_H, KEY_I, KEY_J, KEY_K, KEY_L, KEY_M, KEY_N, KEY_O, KEY_P, KEY_Q, KEY_R,
        KEY_S, KEY_T, KEY_U, KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z };
    for (size_t i = 0; i < sizeof(letters) / sizeof(letters[0]); i++)
        if (code == letters[i]) return (char)((upper ? 'A' : 'a') + i);
    for (size_t i = 0; i < sizeof(symbols) / sizeof(symbols[0]); i++)
        if (code == symbols[i].code) return shift ? symbols[i].shifted : symbols[i].normal;
    return '\0';
}

void rock_ui_key(struct rock_ui *ui, unsigned code, int value)
{
    if (code == KEY_LEFTSHIFT || code == KEY_RIGHTSHIFT) { ui->shift = value != 0; return; }
    if (code == KEY_LEFTCTRL || code == KEY_RIGHTCTRL) { ui->control = value != 0; return; }
    if (value == 0) return;
    ui->pointer_visible = 0;
    if (code == KEY_CAPSLOCK && value == 1) { ui->caps_lock = !ui->caps_lock; return; }
    if (code == KEY_ESC) {
        if (ui->page == PAGE_AUTH_PIN) {
            struct rock_hit back = { .action = ACTION_AUTH_BACK, .enabled = 1 };
            auth_activate(ui, &back);
            return;
        }
        if (ui->confirm_request) {
            struct rock_hit dismiss = { .action = ACTION_DISMISS, .enabled = 1 };
            activate(ui, &dismiss);
        } else if (ui->editing) {
            ui->editing = 0;
            ui->select_all = 0;
        } else if (ui->page == PAGE_SYSTEM) navigate(ui, ui->system_return_page);
        else if (ui->page == PAGE_ATM) navigate(ui, PAGE_WALLET);
        else if (ui->page == PAGE_ATM_STATUS) navigate(ui, PAGE_ATM);
        else if (ui->page == PAGE_REMOTE) navigate(ui, PAGE_EDITOR);
        else if (ui->page == PAGE_REMOTE_RESULT) navigate(ui, PAGE_REMOTE_HISTORY);
        else if (ui->page == PAGE_REMOTE_HISTORY) navigate(ui, PAGE_HISTORY);
        else if (ui->page >= PAGE_MCP) navigate(ui, ui->page == PAGE_MCP ? PAGE_HUB : PAGE_MCP);
        else if (ui->page > PAGE_WALLET) navigate(ui, ui->return_page);
        return;
    }
    if (ui->control && code == KEY_R) {
        if (!ui->busy) { rock_ui_poll_reset(ui); rock_ui_refresh(ui); }
        return;
    }
    if (ui->control && code == KEY_ENTER && ui->page == PAGE_EDITOR && can_mutate(ui)) {
        struct rock_hit run = { .action = ACTION_RUN, .enabled = boolean(installed(ui, ui->selected_id), "enabled") };
        snprintf(run.id, sizeof(run.id), "%s", ui->selected_id);
        activate(ui, &run);
        return;
    }
    if (ui->control && code == KEY_A && ui->editing) { ui->select_all = 1; return; }
    if (code == KEY_TAB || (!ui->editing && (code == KEY_DOWN || code == KEY_UP || code == KEY_LEFT || code == KEY_RIGHT))) {
        int step = (code == KEY_UP || code == KEY_LEFT || (code == KEY_TAB && ui->shift)) ? -1 : 1;
        ui->editing = 0;
        ui->select_all = 0;
        for (int tries = 0; tries < ui->hit_count; tries++) {
            ui->focus = (ui->focus + step + ui->hit_count) % ui->hit_count;
            if (ui->hits[ui->focus].enabled) break;
        }
        if (ui->focus >= 0 && ui->focus < ui->hit_count) {
            if (ui->hits[ui->focus].action == ACTION_INPUT) ui->editing = 1;
            if (ui->hits[ui->focus].action == ACTION_AMOUNT) ui->editing = 2;
            if (ui->hits[ui->focus].action == ACTION_SEARCH) ui->editing = 3;
            if (ui->hits[ui->focus].action == ACTION_AUTH_PIN) ui->editing = 4;
        }
        return;
    }
    if (code == KEY_PAGEDOWN || code == KEY_PAGEUP) {
        rock_ui_scroll(ui, code == KEY_PAGEDOWN ? 300 : -300);
        return;
    }
    if (code == KEY_BACKSPACE && ui->editing) {
        char *destination = ui->editing == 4 ? ui->auth_pin : ui->editing == 3 ? ui->search : ui->editing == 2 ? ui->amount : ui->text;
        size_t length = strlen(destination);
        if (ui->select_all) { destination[0] = '\0'; ui->select_all = 0; }
        else if (length) {
            do { length--; } while (length > 0 && ((unsigned char)destination[length] & 0xc0) == 0x80);
            destination[length] = '\0';
        }
        if (ui->editing == 3) ui->scroll = 0;
        return;
    }
    if (code == KEY_ENTER || code == KEY_KPENTER) {
        if (ui->editing == 1) { (void)rock_ui_text(ui, "\n"); return; }
        if (ui->editing == 2 || ui->editing == 3 || ui->editing == 4) { ui->editing = 0; return; }
        if (ui->focus >= 0 && ui->focus < ui->hit_count) {
            struct rock_hit target = ui->hits[ui->focus];
            activate(ui, &target);
        }
        return;
    }
    if (!ui->control && ui->editing) {
        char character[2] = { key_character(code, ui->shift ^ ui->caps_lock, ui->shift), '\0' };
        if (*character) (void)rock_ui_text(ui, character);
    }
}
