#define _GNU_SOURCE
#include "ui.h"
#include "device.h"
#include "ipc.h"
#include <linux/input.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "spider-motion.h"

/* Explicit test fixtures. No test data is linked into the installed rock-ui. */
static json_object *last_request;
static int request_count;
static const char *test_image_directory;

static void require(int success, const char *message)
{
    if (!success) { fprintf(stderr, "FAIL %s\n", message); exit(1); }
}

static int capture(void *unused, json_object *request)
{
    (void)unused;
    request_count++;
    if (last_request) json_object_put(last_request);
    last_request = json_object_get(request);
    return 0;
}

static const char *value(json_object *object, const char *name)
{
    json_object *item = NULL;
    if (!object || !json_object_object_get_ex(object, name, &item)) return "";
    return json_object_get_string(item);
}

static json_object *fixture(int installed, int enabled)
{
    json_object *response = json_tokener_parse(
        "{\"ok\":true,\"snapshot\":{\"catalog\":[{\"hash\":\"test-package-hash\",\"size\":100,"
        "\"filename\":\"test.rock.json\",\"manifest\":{\"id\":\"test.native\",\"version\":\"1.0.0\","
        "\"name\":\"テスト用の道具\",\"description\":\"これは自動テスト専用のデータです。\","
        "\"publisher\":\"test.publisher\",\"permissions\":[\"text.input\",\"text.output\"],"
        "\"execution_targets\":[\"device_local\"],\"data\":{\"destinations\":[]},"
        "\"price\":{\"currency\":\"USD\",\"amount_minor\":0}}}],"
        "\"hub\":{\"installed\":[],\"jobs\":[]},\"wallet\":{\"simulation_only\":true,\"currency\":\"USD\","
        "\"available_minor\":0,\"pending_minor\":0,\"held_minor\":0,\"monthly_fee_minor\":888,"
        "\"consent\":{\"accepted\":false},\"sales\":[],\"withdrawals\":[],"
        "\"membership\":{\"simulation_only\":true,\"registered\":true,\"registration_status\":\"REGISTERED\","
        "\"monthly_fee_minor\":888,\"currency\":\"USD\",\"terms_version\":\"simulator-monthly-usd-8.88-v1\","
        "\"entitlement\":{\"auto_renew\":false,\"device_eligible\":true,\"subscription_state\":\"CONSENT_REQUIRED\"}},"
        "\"billing\":{\"worker_alive\":true,\"history\":[]}}}}");
    if (installed) {
        json_object *snapshot, *catalog, *hub_state, *list, *manifest;
        json_object_object_get_ex(response, "snapshot", &snapshot);
        json_object_object_get_ex(snapshot, "catalog", &catalog);
        json_object_object_get_ex(snapshot, "hub", &hub_state);
        json_object_object_get_ex(hub_state, "installed", &list);
        json_object_object_get_ex(json_object_array_get_idx(catalog, 0), "manifest", &manifest);
        json_object *item = json_object_new_object();
        json_object_object_add(item, "id", json_object_new_string("test.native"));
        json_object_object_add(item, "version", json_object_new_string("1.0.0"));
        json_object_object_add(item, "hash", json_object_new_string("test-package-hash"));
        json_object_object_add(item, "enabled", json_object_new_int(enabled));
        json_object_object_add(item, "manifest", json_object_get(manifest));
        json_object_object_add(item, "cached_versions", json_object_new_array());
        json_object_array_add(list, item);
    }
    return response;
}

static void snapshot(struct rock_ui *ui, int installed, int enabled)
{
    json_object *request = json_tokener_parse("{\"v\":1,\"op\":\"snapshot\"}");
    json_object *response = fixture(installed, enabled);
    rock_ui_response(ui, request, response, "");
    json_object_put(request);
    json_object_put(response);
    rock_ui_draw(ui);
    require(cairo_status(ui->cr) == CAIRO_STATUS_SUCCESS, "snapshot renders");
}

static void click(struct rock_ui *ui, enum rock_action action)
{
    ui->scroll = 0;
    for (int scroll = 0; scroll < 30; scroll++) {
        rock_ui_draw(ui);
        for (int i = 0; i < ui->hit_count; i++) {
            struct rock_hit *hit = &ui->hits[i];
            if (hit->action == action && hit->enabled) {
                int x = (int)(ui->offset_x + (hit->x + hit->w / 2) * ui->scale);
                int y = (int)(ui->offset_y + (hit->y + hit->h / 2) * ui->scale);
                rock_ui_pointer(ui, x, y, 1);
                rock_ui_pointer(ui, x, y, 0);
                return;
            }
        }
        rock_ui_scroll(ui, 100);
    }
    fprintf(stderr, "action=%d page=%d content_height=%f scroll=%f\n", action, ui->page, ui->content_height, ui->scroll);
    require(0, "expected visible action exists");
}

static void accepted(struct rock_ui *ui)
{
    json_object *response = json_tokener_parse("{\"ok\":true,\"result\":{}}" );
    rock_ui_response(ui, last_request, response, "");
    json_object_put(response);
}

static int action_enabled(struct rock_ui *ui, enum rock_action action)
{
    ui->scroll = 0;
    for (int scroll = 0; scroll < 35; scroll++) {
        rock_ui_draw(ui);
        for (int i = 0; i < ui->hit_count; i++)
            if (ui->hits[i].action == action && ui->hits[i].enabled) return 1;
        rock_ui_scroll(ui, 100);
    }
    return 0;
}

static void coordinate_click(struct rock_ui *ui, int x, int y, enum rock_action expected)
{
    rock_ui_draw(ui);
    int matched = 0;
    for (int i = 0; i < ui->hit_count; i++) {
        struct rock_hit *h = &ui->hits[i];
        if (h->action == expected && h->enabled && x >= h->x && x < h->x + h->w && y >= h->y && y < h->y + h->h)
            matched = 1;
    }
    if (!matched) {
        fprintf(stderr, "coordinate=%d,%d expected=%d scroll=%f top=%f\n", x, y, expected, ui->scroll, ui->content_top);
        for (int i = 0; i < ui->hit_count; i++)
            fprintf(stderr, "hit=%d y=%f h=%f enabled=%d\n", ui->hits[i].action, ui->hits[i].y, ui->hits[i].h, ui->hits[i].enabled);
    }
    require(matched, "documented QMP coordinate targets an enabled visible control");
    rock_ui_pointer(ui, x, y, 1);
    rock_ui_pointer(ui, x, y, 0);
    rock_ui_draw(ui);
}

static void wallet_geometry_test(struct rock_ui *ui)
{
    ui->busy = ui->editing = ui->wallet_expanded = 0;
    ui->page = PAGE_WALLET;
    ui->scroll = 0;
    ui->message[0] = '\0';
    snapshot(ui, 0, 0);
    json_object *wallet, *membership, *entitlement, *billing, *sales;
    json_object_object_get_ex(ui->snapshot, "wallet", &wallet);
    json_object_object_get_ex(wallet, "membership", &membership);
    json_object_object_get_ex(membership, "entitlement", &entitlement);
    json_object_object_get_ex(wallet, "billing", &billing);
    json_object_object_get_ex(wallet, "sales", &sales);
    json_object_object_add(entitlement, "auto_renew", json_object_new_boolean(1));
    json_object_object_add(billing, "history", json_tokener_parse("[{\"period\":\"2026-09\",\"status\":\"retry_wait\",\"last_error\":\"insufficient available funds\"}]"));
    coordinate_click(ui, 360, 559, ACTION_CONSENT);
    ui->busy = 0;
    coordinate_click(ui, 360, 622, ACTION_BILL);
    ui->busy = 0;
    for (int i = 0; i < 3; i++) { rock_ui_key(ui, KEY_PAGEDOWN, 1); rock_ui_draw(ui); }
    coordinate_click(ui, 360, 807, ACTION_WALLET_EXPAND);
    for (int i = 0; i < 2; i++) { rock_ui_key(ui, KEY_PAGEDOWN, 1); rock_ui_draw(ui); }
    coordinate_click(ui, 250, 443, ACTION_AMOUNT);
    snprintf(ui->amount, sizeof(ui->amount), "20.00");
    coordinate_click(ui, 195, 521, ACTION_SALE);
    require(!strcmp(value(last_request, "op"), "wallet.sale") && !strcmp(value(last_request, "amount_minor"), "2000"),
            "QMP sequence enters actual exact simulator credit");
    accepted(ui);
    json_object_array_add(sales, json_tokener_parse("{\"id\":\"test-sale\",\"amount_minor\":2000,\"status\":\"PENDING_SETTLEMENT\"}"));
    coordinate_click(ui, 560, 700, ACTION_SETTLE);
    require(!strcmp(value(last_request, "op"), "wallet.settle") && !strcmp(value(last_request, "id"), "test-sale"),
            "QMP sequence settles the actual displayed sale identity");
    accepted(ui);
}

static void test_image(struct rock_ui *ui, const char *name)
{
    if (!test_image_directory) return;
    char path[4096];
    require(snprintf(path, sizeof(path), "%s/%s.png", test_image_directory, name) < (int)sizeof(path), "test image path fits");
    rock_ui_draw(ui);
    require(cairo_surface_write_to_png(ui->surface, path) == CAIRO_STATUS_SUCCESS, "unit renderer image saved");
}

static uint64_t image_region(struct rock_ui *ui, int x, int y, int width, int height)
{
    require(ui->scale == 1 && ui->offset_x == 0 && ui->offset_y == 0,
            "renderer comparison uses native test geometry");
    require(x >= 0 && y >= 0 && x + width <= ui->width && y + height <= ui->height,
            "renderer comparison stays inside image");
    cairo_surface_flush(ui->surface);
    const unsigned char *pixels = cairo_image_surface_get_data(ui->surface);
    int stride = cairo_image_surface_get_stride(ui->surface);
    uint64_t hash = UINT64_C(14695981039346656037);
    for (int row = y; row < y + height; row++)
        for (int col = x * 4; col < (x + width) * 4; col++) {
            hash ^= pixels[row * stride + col];
            hash *= UINT64_C(1099511628211);
        }
    return hash;
}

static int security_panel(struct rock_ui *ui)
{
    rock_ui_draw(ui);
    rock_ui_scroll(ui, 10000);
    rock_ui_draw(ui);
    int top = (int)(ui->content_top + ui->content_height - ui->scroll - 474);
    require(top >= ui->content_top && top + 454 <= 856,
            "complete Spider Guard panel fits below existing power controls");
    return top;
}

static void spider_motion_test(void)
{
    struct rock_spider_motion motion = {0};
    struct rock_spider_input input = {.active = 1, .blocked_valid = 1, .blocked = 4};
    double now = 1;
    rock_spider_step(&motion, &input, now);
    require(motion.active && motion.target == -1 && motion.alert == 0,
            "initial monitor count starts patrol without fabricating a finding or block event");
    double x = motion.x, y = motion.y;
    rock_spider_step(&motion, &input, now);
    require(motion.x == x && motion.y == y && motion.alert == 0,
            "same timestamp is deterministic and does not advance patrol");
    int planted = 0;
    for (int frame = 0; frame < 100; frame++) {
        struct rock_spider_foot previous[8];
        memcpy(previous, motion.feet, sizeof(previous));
        x = motion.x; y = motion.y; now += .05;
        rock_spider_step(&motion, &input, now);
        require(isfinite(motion.x) && isfinite(motion.y) && isfinite(motion.phase) &&
                hypot(motion.x - x, motion.y - y) < 15,
                "fixed-step patrol stays finite and moves smoothly without teleporting");
        for (int leg = 0; leg < 8; leg++) {
            require(isfinite(motion.feet[leg].x) && isfinite(motion.feet[leg].y) &&
                    isfinite(motion.feet[leg].lift), "all eight articulated feet stay finite");
            if (!previous[leg].stepping && !motion.feet[leg].stepping) {
                require(previous[leg].x == motion.feet[leg].x && previous[leg].y == motion.feet[leg].y,
                        "planted supporting feet do not slide between gait steps");
                planted++;
            }
        }
    }
    require(planted > 20, "articulated gait retains supporting feet across patrol frames");
    input.count = 1; input.ids[0] = 101; input.secret[0] = 1;
    for (int frame = 0; frame < 160; frame++) {
        now += .05;
        rock_spider_step(&motion, &input, now);
    }
    require(motion.target == 0 && hypot(motion.x - 135, motion.y - 149) < 55,
            "spider approaches the real finding instead of remaining in unrelated patrol");
    require(motion.alert == 0, "finding arrival alone does not fabricate an outbound block");

    input.blocked = 5; now += .05;
    rock_spider_step(&motion, &input, now);
    require(motion.alert > 0 && motion.alert <= 1, "actual blocked-counter increase starts a bounded reaction");
    double alert = motion.alert, remaining = motion.alert_left;
    now += .05;
    rock_spider_step(&motion, &input, now);
    require(motion.alert > 0 && motion.alert <= alert && motion.alert_left < remaining,
            "unchanged blocked counter decays instead of retriggering the reaction");
    for (int frame = 0; frame < 80; frame++) {
        now += .05;
        rock_spider_step(&motion, &input, now);
    }
    require(motion.alert == 0, "outbound block reaction expires while normal motion continues");
    input.blocked = 1; now += .05;
    rock_spider_step(&motion, &input, now);
    require(motion.alert == 0, "counter reset does not fabricate a new block");
    input.active = 0; input.blocked = 2; now += .05;
    rock_spider_step(&motion, &input, now);
    x = motion.x; y = motion.y;
    require(!motion.active && motion.alert == 0, "unavailable worker clears the active reaction");
    now += 1;
    rock_spider_step(&motion, &input, now);
    require(motion.x == x && motion.y == y, "inactive controller does not patrol");
    input.active = 1; input.blocked = 3; now += .05;
    rock_spider_step(&motion, &input, now);
    require(motion.alert == 0, "resume baselines historical blocks without replaying them");
    input.blocked = 4; now += 60;
    rock_spider_step(&motion, &input, now);
    require(motion.alert == 0, "long observation gap does not replay historical block events");
    input.blocked_valid = 0; input.blocked = 999; now += .05;
    rock_spider_step(&motion, &input, now);
    require(motion.alert == 0, "invalid block count never becomes a reaction");

    struct rock_spider_motion selected = {0};
    struct rock_spider_input nodes = {.active = 1, .count = 3,
        .ids = {301, 302, 303}, .secret = {0, 1, 0}};
    rock_spider_step(&selected, &nodes, 1);
    require(selected.target == 1 && selected.target_id == 302,
            "real secret finding receives first inspection priority");
    nodes.ids[0] = 302; nodes.ids[1] = 301;
    nodes.secret[0] = 1; nodes.secret[1] = 0;
    rock_spider_step(&selected, &nodes, 1.05);
    require(selected.target == 0 && selected.target_id == 302,
            "reordered findings preserve target identity instead of following the wrong row");
    nodes.count = 0;
    rock_spider_step(&selected, &nodes, 1.1);
    require(selected.target == -1 && selected.target_id == 0,
            "removed findings cannot remain as fabricated targets");
}

static json_object *security_fixture(void)
{
    return json_tokener_parse(
        "{\"status\":\"watching\",\"workerAlive\":true,\"fresh\":true,"
        "\"intervalSeconds\":30,\"filesScanned\":4,\"candidateCount\":3,"
        "\"secretCount\":2,\"personalCount\":1,\"blocked\":4,\"coverageLimited\":true,"
        "\"agent\":{\"id\":\"spider\",\"role\":\"security\",\"scope\":\"platform-data\","
        "\"duties\":[\"watch_platform_data\",\"inspect_outbound\",\"deny_sensitive_outbound\",\"report_health\"],"
        "\"state\":\"sensitive_data_detected\",\"lastAction\":null},"
        "\"findings\":[{\"id\":\"fixture-a\",\"kind\":\"secret\",\"label\":\"API credential\",\"path\":\"local.env\",\"line\":2},"
        "{\"id\":\"fixture-b\",\"kind\":\"personal\",\"label\":\"Email address\",\"path\":\"notes.txt\",\"line\":5},"
        "{\"id\":\"fixture-c\",\"kind\":\"secret\",\"label\":\"Private key\",\"path\":\"draft.txt\",\"line\":9}]}");
}

static void security_fixture_block(json_object *guard, int blocked)
{
    json_object *agent;
    json_object_object_get_ex(guard, "agent", &agent);
    json_object_object_add(guard, "blocked", json_object_new_int(blocked));
    json_object_object_add(agent, "state", json_object_new_string("recent_block"));
    json_object_object_add(agent, "lastAction", json_tokener_parse(
        "{\"action\":\"blocked\",\"boundary\":\"mcp.submit\",\"count\":1,\"kinds\":[\"secret\"],\"time\":1790971203}"));
}

static void security_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->editing = ui->pointer_visible = 0;
    ui->message[0] = '\0';
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    snapshot(ui, 0, 0);
    ui->page = PAGE_SYSTEM;
    json_object *guard = security_fixture();
    json_object_object_add(ui->snapshot, "security", guard);
    int before = request_count;
    int top = security_panel(ui);
    int64_t frame_ms = 1000;
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    uint64_t active_status = image_region(ui, 56, top + 49, 596, 25);
    uint64_t agent_identity = image_region(ui, 56, top + 13, 390, 28);
    uint64_t no_agent_action = image_region(ui, 56, top + 321, 596, 26);
    uint64_t spider = image_region(ui, 56, top + 114, 173, 212);
    uint64_t counts = image_region(ui, 56, top + 82, 596, 25);
    uint64_t rows = image_region(ui, 235, top + 126, 410, 204);
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    require(spider == image_region(ui, 56, top + 114, 173, 212),
            "same native tick renders an identical spider frame");
    int moving = 0;
    for (int retry = 0; retry < 10 && !moving; retry++) {
        frame_ms += 50;
        rock_ui_spider_tick(ui, frame_ms);
        rock_ui_draw(ui);
        moving = spider != image_region(ui, 56, top + 114, 173, 212);
    }
    require(moving, "fresh connected living worker animates native spider");
    for (int frame = 0; frame < 60; frame++) {
        frame_ms += 50;
        rock_ui_spider_tick(ui, frame_ms);
    }
    rock_ui_draw(ui);
    require(ui->spider.target == 0 && ui->spider.settled && ui->spider.alert == 0,
            "native metadata tick reaches the first real secret without a fake block reaction");
    test_image(ui, "unit-spider-guard-active");
    rows = image_region(ui, 235, top + 126, 410, 204);
    json_object *agent;
    json_object_object_get_ex(guard, "agent", &agent);
    require(!strcmp(value(agent, "id"), "spider") && !strcmp(value(agent, "role"), "security"),
            "native fixture uses the fixed security-agent identity contract");
    json_object_object_add(agent, "state", json_object_new_string("watching"));
    rock_ui_draw(ui);
    uint64_t watching_status = image_region(ui, 56, top + 49, 596, 25);
    require(watching_status != active_status,
            "actual agent state distinguishes watching from detected sensitive information");
    json_object_object_add(agent, "state", json_object_new_string("unknown-test-state"));
    json_object_object_add(agent, "lastAction", json_tokener_parse(
        "{\"action\":\"unknown-test-action\",\"boundary\":\"untrusted-test-description\",\"kinds\":[\"secret\"]}"));
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    uint64_t unknown_status = image_region(ui, 56, top + 49, 596, 25);
    require(unknown_status != active_status && unknown_status != watching_status &&
            no_agent_action == image_region(ui, 56, top + 321, 596, 26) && ui->spider.alert == 0,
            "unknown agent state and action cannot fabricate detection or response claims");
    require(agent_identity == image_region(ui, 56, top + 13, 390, 28),
            "security-agent identity remains visible while its reported activity changes");
    json_object_object_add(agent, "state", json_object_new_string("sensitive_data_detected"));
    json_object_object_add(agent, "lastAction", NULL);
    rock_ui_draw(ui);
    require(active_status == image_region(ui, 56, top + 49, 596, 25),
            "recognized agent detection state restores the metadata-derived focus line");

    json_object *findings, *first;
    json_object_object_get_ex(guard, "findings", &findings);
    first = json_object_array_get_idx(findings, 0);
    json_object_object_add(first, "label", json_object_new_string("Password assignment"));
    json_object_object_add(first, "path", json_object_new_string("changed.txt"));
    json_object_object_add(first, "line", json_object_new_int(17));
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    require(ui->spider.alert == 0, "finding metadata update alone does not announce a block");
    require(rows != image_region(ui, 235, top + 126, 410, 204),
            "actual finding label path and line change rendered metadata");
    security_fixture_block(guard, 23);
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    require(ui->spider.alert > 0, "native snapshot blocked-counter increase triggers the rendered reaction");
    require(counts != image_region(ui, 56, top + 82, 596, 25),
            "actual block count changes rendered count");
    uint64_t blocked_action = image_region(ui, 56, top + 321, 596, 26);
    uint64_t blocked_status = image_region(ui, 56, top + 49, 596, 25);
    require(blocked_action != no_agent_action,
            "actual sanitized last action renders the security agent's outbound refusal");
    json_object_object_add(agent, "lastAction", json_tokener_parse(
        "{\"action\":\"blocked\",\"boundary\":\"remote.send\",\"count\":1,\"kinds\":[\"personal\"],\"time\":1790971203}"));
    double prior_reaction = ui->spider.alert_left;
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    rock_ui_draw(ui);
    require(blocked_action != image_region(ui, 56, top + 321, 596, 26) &&
            ui->spider.alert_left < prior_reaction,
            "last-action boundary and kind update the description without inventing another block");
    json_object_object_add(agent, "lastAction", json_tokener_parse(
        "{\"action\":\"blocked\",\"boundary\":\"mcp.submit\",\"count\":0,\"kinds\":[],\"time\":1790971203}"));
    rock_ui_draw(ui);
    uint64_t limit_action = image_region(ui, 56, top + 321, 596, 26);
    require(limit_action != no_agent_action && limit_action != blocked_action &&
            blocked_status == image_region(ui, 56, top + 49, 596, 25),
            "inspection-limit refusal reports an actual safety rejection without claiming sensitive-data detection");
    test_image(ui, "unit-spider-guard-limit-blocked");
    const char *inconsistent_actions[] = {
        "{\"action\":\"blocked\",\"boundary\":\"mcp.submit\",\"count\":0,\"kinds\":[\"secret\"]}",
        "{\"action\":\"blocked\",\"boundary\":\"mcp.submit\",\"count\":1,\"kinds\":[]}"
    };
    for (size_t i = 0; i < sizeof(inconsistent_actions) / sizeof(inconsistent_actions[0]); i++) {
        json_object_object_add(agent, "lastAction", json_tokener_parse(inconsistent_actions[i]));
        rock_ui_draw(ui);
        require(no_agent_action == image_region(ui, 56, top + 321, 596, 26),
                "inconsistent refusal count and kinds cannot fabricate an agent action description");
    }
    security_fixture_block(guard, 23);
    rock_ui_draw(ui);
    test_image(ui, "unit-spider-guard-blocked");
    rows = image_region(ui, 235, top + 126, 410, 204);
    json_object_array_add(findings, json_tokener_parse(
        "{\"kind\":\"secret\",\"label\":\"FOURTH ROW MUST NOT RENDER\",\"path\":\"extra.txt\",\"line\":4}"));
    rock_ui_draw(ui);
    require(rows == image_region(ui, 235, top + 126, 410, 204),
            "native finding preview is bounded to three metadata rows");
    json_object_array_del_idx(findings, 3, 1);
    ui->page = PAGE_HUB;
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    require(!ui->spider.active && ui->spider.alert == 0,
            "leaving the security page stops visual motion without retaining a block flash");
    json_object_object_add(guard, "blocked", json_object_new_int(24));
    ui->page = PAGE_SYSTEM;
    frame_ms += 50;
    rock_ui_spider_tick(ui, frame_ms);
    require(ui->spider.active && ui->spider.alert == 0,
            "returning to the page does not present an unseen historical counter increase as live");

    const char *states[] = {"stale", "dead", "failed", "missing-health", "disconnected", "invalid-alive", "invalid-fresh", "missing"};
    uint64_t stopped_spider = 0;
    for (size_t i = 0; i < sizeof(states) / sizeof(states[0]); i++) {
        json_object_object_add(guard, "status", json_object_new_string(i == 2 ? "error" : "watching"));
        json_object_object_add(guard, "workerAlive", json_object_new_boolean(i != 1));
        json_object_object_add(guard, "fresh", json_object_new_boolean(i != 0));
        if (i == 3) {
            json_object_object_del(guard, "workerAlive");
            json_object_object_del(guard, "fresh");
        }
        if (i == 5) json_object_object_add(guard, "workerAlive", json_object_new_int(1));
        if (i == 6) json_object_object_add(guard, "fresh", json_object_new_string("true"));
        ui->connected = i != 4;
        if (i == 7) json_object_object_del(ui->snapshot, "security");
        top = security_panel(ui);
        frame_ms += 50;
        rock_ui_spider_tick(ui, frame_ms);
        rock_ui_draw(ui);
        require(active_status != image_region(ui, 56, top + 49, 596, 25),
                "unavailable guard never renders the active service claim");
        uint64_t current_spider = image_region(ui, 60, top + 128, 125, 171);
        if (!i) stopped_spider = current_spider;
        require(stopped_spider == current_spider,
                "stale dead failed missing and disconnected workers share inactive spider");
        frame_ms += 500;
        rock_ui_spider_tick(ui, frame_ms);
        rock_ui_draw(ui);
        require(current_spider == image_region(ui, 60, top + 128, 125, 171),
                "unavailable guard does not animate between frames");
        char name[80];
        snprintf(name, sizeof(name), "unit-spider-guard-%s", states[i]);
        test_image(ui, name);
    }
    require(request_count == before, "Spider Guard display and animation perform no IPC or mutation");
    snapshot(ui, 0, 0);
    ui->scroll = 0;
}

/* Opt-in motion evidence: explicit synthetic metadata, never installed. */
static void security_frame_evidence(struct rock_ui *ui)
{
    const char *directory = getenv("ROCK_SPIDER_FRAMES");
    if (!directory || !directory[0]) return;
    const char *saved_directory = test_image_directory;
    test_image_directory = directory;
    snapshot(ui, 0, 0);
    ui->page = PAGE_SYSTEM;
    ui->busy = ui->editing = ui->pointer_visible = 0;
    ui->message[0] = '\0';
    memset(&ui->spider, 0, sizeof(ui->spider));
    json_object *guard = security_fixture();
    json_object_object_add(ui->snapshot, "security", guard);
    (void)security_panel(ui);
    int before = request_count;
    for (int tick = 0; tick < 160; tick++) {
        if (tick == 60) security_fixture_block(guard, 5);
        if (tick == 120) {
            json_object_object_add(guard, "findings", json_object_new_array());
            json_object_object_add(guard, "candidateCount", json_object_new_int(0));
            json_object_object_add(guard, "secretCount", json_object_new_int(0));
            json_object_object_add(guard, "personalCount", json_object_new_int(0));
        }
        rock_ui_spider_tick(ui, 1000 + tick * 50);
        if (tick < 60 || tick >= 108)
            require(ui->spider.alert == 0, "motion fixture only reacts during the observed block event");
        if (tick == 60) require(ui->spider.alert > 0, "motion fixture counter increase creates one real reaction");
        if (tick >= 120) require(ui->spider.target == -1, "motion fixture resumes patrol after findings disappear");
        if (!(tick % 2)) {
            char name[80];
            snprintf(name, sizeof(name), "fixture-spider-%03d", tick / 2);
            test_image(ui, name);
        }
    }
    require(request_count == before, "motion evidence cannot trigger IPC or security mutations");
    test_image_directory = saved_directory;
    snapshot(ui, 0, 0);
    ui->scroll = 0;
}

static void remote_wallet_cache_test(struct rock_ui *ui)
{
    ui->busy = ui->editing = 0;
    ui->message[0] = '\0';
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    snapshot(ui, 0, 0);
    json_object *wallet;
    json_object_object_get_ex(ui->snapshot, "wallet", &wallet);
    json_object *backend = json_tokener_parse("{\"authority\":\"remote_development_backend\",\"connected\":false,\"stale\":true,\"last_sync_unix\":1788879000,\"pending_reconciliation\":false}");
    json_object_object_add(wallet, "backend", backend);
    ui->page = PAGE_WALLET;
    ui->scroll = 0;
    rock_ui_draw(ui);
    require(!action_enabled(ui, ACTION_CONSENT) && !action_enabled(ui, ACTION_BILL), "offline Wallet cache cannot authorize a new financial action");
    ui->scroll = 0; /* Action discovery scrolls; show the actual stale-state header. */
    test_image(ui, "remote-wallet-stale");
    json_object_object_add(backend, "connected", json_object_new_boolean(1));
    json_object_object_add(backend, "stale", json_object_new_boolean(0));
    rock_ui_draw(ui);
    click(ui, ACTION_CONSENT);
    require(!strcmp(value(last_request, "op"), "wallet.consent"), "connected authority accepts explicit consent");
    json_object *unavailable = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"acknowledgement lost\"}");
    json_object *request = json_object_get(last_request);
    rock_ui_response(ui, request, unavailable, NULL);
    require(ui->retry_request && json_object_equal(ui->retry_request, request), "monthly consent uncertainty retains exact request for retry");
    json_object_put(request); json_object_put(unavailable);
    json_object_put(ui->retry_request); ui->retry_request = NULL;
    snapshot(ui, 0, 0);
}

static void power_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->editing = 0;
    ui->message[0] = '\0';
    snapshot(ui, 0, 0);
    ui->page = PAGE_DETAIL;
    ui->return_page = PAGE_HUB;
    coordinate_click(ui, 636, 26, ACTION_SYSTEM);
    rock_ui_key(ui, KEY_ESC, 1);
    require(ui->page == PAGE_DETAIL && ui->return_page == PAGE_HUB, "system return preserves the nested tool page back destination");
    rock_ui_key(ui, KEY_ESC, 1);
    require(ui->page == PAGE_HUB, "second Escape can still leave the tool detail after visiting system");
    json_object_object_add(ui->snapshot, "device", json_tokener_parse("{\"hardware\":\"UI unit fixture · power command is not executed\"}"));
    int before = request_count;
    coordinate_click(ui, 636, 26, ACTION_SYSTEM);
    test_image(ui, "unit-power-page");
    require(ui->page == PAGE_SYSTEM && request_count == before, "opening native device page cannot issue power actions");
    click(ui, ACTION_POWEROFF);
    require(ui->confirm_request && request_count == before &&
            !strcmp(value(ui->confirm_request, "op"), "device.poweroff"), "poweroff requires separate confirmation");
    test_image(ui, "unit-poweroff-confirm");
    rock_ui_key(ui, KEY_ESC, 1);
    require(!ui->confirm_request && request_count == before, "Escape cancels power confirmation without IPC");
    click(ui, ACTION_REBOOT);
    click(ui, ACTION_DISMISS);
    require(!ui->confirm_request && request_count == before, "return button cancels reboot without IPC");
    click(ui, ACTION_REBOOT);
    test_image(ui, "unit-reboot-confirm");
    char key[40];
    snprintf(key, sizeof(key), "%s", value(ui->confirm_request, "key"));
    click(ui, ACTION_CONFIRM);
    require(request_count == before + 1 && !strcmp(value(last_request, "op"), "device.reboot") &&
            json_object_object_length(last_request) == 3 && !strcmp(value(last_request, "key"), key),
            "confirmed reboot sends only exact protocol, operation and original key");
    json_object *unavailable = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"power receipt deadline exceeded\"}");
    rock_ui_response(ui, last_request, unavailable, "");
    json_object_put(unavailable);
    require(ui->retry_request && !ui->power_receipt && !strcmp(value(ui->retry_request, "key"), key),
            "initial structured unavailable response preserves the exact unresolved power request");
    snapshot(ui, 0, 0);
    require(action_enabled(ui, ACTION_RETRY), "structured unavailable exposes native same-request retry after snapshot recovery");
    click(ui, ACTION_RETRY);
    require(!strcmp(value(last_request, "key"), key), "structured unavailable retry sends the original key");
    rock_ui_response(ui, last_request, NULL, "test lost reboot receipt");
    require(ui->retry_request && !ui->power_receipt, "missing receipt cannot imply accepted or completed reboot");
    snapshot(ui, 0, 0);
    require(!action_enabled(ui, ACTION_POWEROFF), "unresolved power request blocks a conflicting new action");
    click(ui, ACTION_RETRY);
    require(!strcmp(value(last_request, "key"), key), "power retry retains the identical request identity");
    json_object *response = json_tokener_parse("{\"ok\":true,\"result\":{\"accepted\":true,\"op\":\"reboot\",\"boot_id\":\"11111111-1111-1111-1111-111111111111\"}}");
    json_object *result;
    json_object_object_get_ex(response, "result", &result);
    json_object_object_add(result, "key", json_object_new_string("different-key"));
    rock_ui_response(ui, last_request, response, "");
    require(ui->retry_request && !ui->power_receipt, "wrong response identity cannot imply accepted power action");
    json_object_object_add(result, "key", json_object_new_string(key));
    rock_ui_response(ui, last_request, response, "");
    json_object_put(response);
    require(ui->power_receipt && !ui->retry_request && ui->page == PAGE_SYSTEM &&
            !strcmp(value(ui->power_receipt, "op"), "reboot"), "matching receipt is retained as acceptance only");
    snapshot(ui, 0, 0);
    json_object_object_add(ui->snapshot, "device", json_tokener_parse("{\"hardware\":\"UI unit fixture · no actual reboot or shutdown\"}"));
    test_image(ui, "unit-power-acceptance-only");
    snapshot(ui, 0, 0);
    require(ui->power_receipt != NULL, "state refresh cannot turn acceptance into completion or silently discard its receipt");
    click(ui, ACTION_POWEROFF);
    click(ui, ACTION_CONFIRM);
    require(!strcmp(value(last_request, "op"), "device.poweroff") && json_object_object_length(last_request) == 3,
            "poweroff also emits no caller path or arbitrary arguments");
    rock_ui_response(ui, last_request, NULL, "test lost busy receipt");
    snapshot(ui, 0, 0);
    click(ui, ACTION_RETRY);
    response = json_tokener_parse("{\"ok\":false,\"code\":\"busy\",\"error\":\"another power action is already accepted for this boot\"}");
    rock_ui_response(ui, last_request, response, "");
    json_object_put(response);
    require(!ui->retry_request && ui->message_error, "durable busy rejection resolves exact-key uncertainty without fake success");
    rock_ui_draw(ui);
    require(cairo_status(ui->cr) == CAIRO_STATUS_SUCCESS, "native power page and confirmation draw safely");
}

static void membership_test(struct rock_ui *ui)
{
    ui->busy = 0;
    ui->page = PAGE_WALLET;
    ui->editing = 0;
    ui->wallet_expanded = 1;
    snapshot(ui, 0, 0);
    json_object *wallet, *membership, *entitlement, *consent, *sales;
    json_object_object_get_ex(ui->snapshot, "wallet", &wallet);
    json_object_object_get_ex(wallet, "membership", &membership);
    json_object_object_get_ex(membership, "entitlement", &entitlement);
    json_object_object_get_ex(wallet, "consent", &consent);
    json_object_object_get_ex(wallet, "sales", &sales);
    json_object_object_add(membership, "registered", json_object_new_boolean(0));
    json_object_object_add(membership, "registration_status", json_object_new_string("HANDOFF_REQUIRED"));
    require(!action_enabled(ui, ACTION_WALLET_REGISTER), "missing handoff cannot be registered");
    json_object_object_add(membership, "registration_status", json_object_new_string("REGISTRATION_REQUIRED"));
    click(ui, ACTION_WALLET_REGISTER);
    require(!strcmp(value(last_request, "op"), "wallet.register") && json_object_object_length(last_request) == 3,
            "registration has no personal data or implicit consent fields");
    accepted(ui);
    require(!action_enabled(ui, ACTION_CONSENT) && !action_enabled(ui, ACTION_SALE),
            "registration reply alone does not fabricate registered snapshot state");
    json_object_object_add(membership, "registered", json_object_new_boolean(1));
    json_object_object_add(membership, "registration_status", json_object_new_string("REGISTERED"));
    json_object_object_add(consent, "accepted", json_object_new_boolean(1));
    click(ui, ACTION_CONSENT);
    require(!strcmp(value(last_request, "accepted"), "true") &&
            !strcmp(value(last_request, "terms_version"), "simulator-monthly-usd-8.88-v1"),
            "current membership intent overrides historical ledger consent and pins displayed terms");
    accepted(ui);
    json_object_object_add(entitlement, "auto_renew", json_object_new_boolean(1));
    json_object_object_add(consent, "accepted", json_object_new_boolean(0));
    click(ui, ACTION_BILL);
    require(!strcmp(value(last_request, "op"), "wallet.bill") && json_object_object_length(last_request) == 4,
            "billing request has only fixed operation, key and UTC period");
    accepted(ui);
    require(strstr(ui->message, "完了は請求状況") != NULL, "async billing acceptance is not a charge-completion claim");
    json_object_object_add(entitlement, "device_eligible", json_object_new_boolean(0));
    require(!action_enabled(ui, ACTION_SALE) && !action_enabled(ui, ACTION_RESERVE) && !action_enabled(ui, ACTION_BILL),
            "expired membership disables new actions and new billing");
    click(ui, ACTION_CONSENT);
    require(!strcmp(value(last_request, "accepted"), "false"), "cancellation remains available after eligibility expires");
    accepted(ui);
    json_object_array_add(sales, json_tokener_parse("{\"id\":\"pending-fixture-sale\",\"status\":\"PENDING_SETTLEMENT\",\"amount_minor\":100}"));
    click(ui, ACTION_SETTLE);
    require(!strcmp(value(last_request, "op"), "wallet.settle"), "existing-sale resolution remains available after expiry");
    accepted(ui);
    json_object_object_add(membership, "terms_version", json_object_new_string("unknown-new-terms"));
    require(!action_enabled(ui, ACTION_CONSENT), "unknown terms cannot be approved by this UI");
    ui->wallet_expanded = 0;
    ui->message[0] = '\0';
    ui->page = PAGE_HUB;
    snapshot(ui, 0, 0);
}

static void registry_test(struct rock_ui *ui)
{
    ui->page = PAGE_HUB;
    ui->message[0] = '\0';
    ui->message_error = 0;
    ui->busy = 0;
    snapshot(ui, 0, 0);
    rock_ui_draw(ui);
    for (int i = 0; i < ui->hit_count; i++)
        if (ui->hits[i].action == ACTION_REGISTRY_REFRESH) require(!ui->hits[i].enabled, "missing registry metadata disables fetch");
    json_object *registry = json_tokener_parse("{\"configured\":true,\"can_refresh\":true,\"status\":\"ready\",\"source_label\":\"TEST FIXTURE ONLY\",\"fresh\":true,\"last_checked_unix\":1788855322}");
    json_object_object_add(ui->snapshot, "registry", registry);
    click(ui, ACTION_REGISTRY_REFRESH);
    require(!strcmp(value(last_request, "op"), "registry.refresh") && strlen(value(last_request, "key")) == 35 &&
            json_object_object_length(last_request) == 3, "catalog refresh carries only version, operation and UI identity");
    accepted(ui);
    require(strstr(ui->message, "受け付けました") != NULL, "catalog acceptance does not claim completed download");
    json_object_object_add(registry, "status", json_object_new_string("refreshing"));
    rock_ui_draw(ui);
    for (int i = 0; i < ui->hit_count; i++)
        if (ui->hits[i].action == ACTION_REGISTRY_REFRESH) require(!ui->hits[i].enabled, "in-progress registry disables duplicate fetch");
    json_object_object_add(registry, "status", json_object_new_string("error"));
    json_object_object_add(registry, "last_error", json_object_new_string("TEST FIXTURE: signature verification failed"));
    ui->message[0] = '\0';
    rock_ui_draw(ui);
    require(ui->content_top == 200 && cairo_status(ui->cr) == CAIRO_STATUS_SUCCESS, "actual registry failure has an error banner");
    json_object_object_add(registry, "status", json_object_new_string("ready"));
    json_object_object_add(registry, "fresh", json_object_new_boolean(0));
    rock_ui_draw(ui);
    require(ui->content_top == 158, "compact registry header reserves the new content boundary");
    json_object_object_add(registry, "configured", json_object_new_boolean(0));
    rock_ui_draw(ui);
    for (int i = 0; i < ui->hit_count; i++)
        if (ui->hits[i].action == ACTION_REGISTRY_REFRESH) require(!ui->hits[i].enabled, "unconfigured registry disables fetch");
}

static int detail_hits(struct rock_ui *ui)
{
    int count = 0;
    rock_ui_draw(ui);
    for (int i = 0; i < ui->hit_count; i++) if (ui->hits[i].action == ACTION_DETAIL) count++;
    return count;
}

static void search_test(struct rock_ui *ui)
{
    snapshot(ui, 0, 0);
    json_object *unchanged_request = last_request;
    const char *queries[] = { "NATIVE", "テスト用", "自動テスト" };
    for (size_t i = 0; i < sizeof(queries) / sizeof(queries[0]); i++) {
        click(ui, ACTION_SEARCH);
        ui->select_all = 1;
        require(rock_ui_text(ui, queries[i]) == 0 && detail_hits(ui) == 1, "search matches id, name and description");
    }
    ui->select_all = 1;
    require(rock_ui_text(ui, "not-in-this-catalog") == 0 && detail_hits(ui) == 0, "search removes unmatched tool cards");
    click(ui, ACTION_SEARCH_CLEAR);
    require(!ui->search[0] && detail_hits(ui) == 1, "clear search restores actual catalog");
    click(ui, ACTION_SEARCH);
    require(rock_ui_text(ui, "日本語") == 0, "search accepts bounded UTF-8");
    rock_ui_key(ui, KEY_BACKSPACE, 1);
    require(!strcmp(ui->search, "日本"), "search backspace removes a complete UTF-8 character");
    rock_ui_key(ui, KEY_ENTER, 1);
    require(ui->editing == 0 && !strchr(ui->search, '\n'), "Enter finishes search without adding newline");
    click(ui, ACTION_SEARCH_CLEAR);
    click(ui, ACTION_SEARCH);
    char maximum[ROCK_UI_SEARCH_MAX + 1];
    memset(maximum, 'x', ROCK_UI_SEARCH_MAX);
    maximum[ROCK_UI_SEARCH_MAX] = '\0';
    require(rock_ui_text(ui, maximum) == 0 && rock_ui_text(ui, "x") < 0, "search is limited to 128 bytes");
    require(last_request == unchanged_request, "local search never mutates or sends user query to the backend");
    ui->search[0] = '\0';
    ui->editing = 0;
    ui->message[0] = '\0';
    ui->message_error = 0;
}

static void partial_installation_test(struct rock_ui *ui)
{
    snapshot(ui, 0, 0);
    json_object *state = NULL;
    json_object_object_get_ex(ui->snapshot, "hub", &state);
    json_object_object_add(state, "installed_truncated", json_object_new_boolean(1));
    json_object_object_add(state, "total_installed", json_object_new_int(120));
    click(ui, ACTION_DETAIL);
    rock_ui_draw(ui);
    int found = 0;
    for (int i = 0; i < ui->hit_count; i++)
        if (ui->hits[i].action == ACTION_INSTALL) {
            found = 1;
            require(!ui->hits[i].enabled, "omitted installation state cannot be treated as uninstalled");
        }
    require(found, "unknown installation state has a disabled primary action");
    ui->page = PAGE_INSTALLED;
    rock_ui_draw(ui);
    require(cairo_status(ui->cr) == CAIRO_STATUS_SUCCESS, "empty partial installed list renders without a false installed-state assumption");
    ui->page = PAGE_HUB;
}

static void compatibility_test(struct rock_ui *ui)
{
    ui->page = PAGE_HUB;
    snapshot(ui, 0, 0);
    json_object *catalog = NULL, *manifest = NULL;
    json_object_object_get_ex(ui->snapshot, "catalog", &catalog);
    json_object *item = json_object_array_get_idx(catalog, 0);
    json_object_object_get_ex(item, "manifest", &manifest);
    json_object_object_add(manifest, "schema_version", json_object_new_int(4));
    json_object_object_add(manifest, "compatibility", json_tokener_parse(
        "{\"os\":\"rock-star-os\",\"min_os_version\":\"999.0.0\",\"min_runtime_version\":\"1.0.0\"}"));
    json_object *status = json_tokener_parse("{\"compatible\":false}");
    json_object_object_add(item, "compatibility", status);
    click(ui, ACTION_DETAIL);
    for (int mode = 0; mode < 3; mode++) {
        if (mode == 1) json_object_object_del(item, "compatibility");
        if (mode == 2) json_object_object_add(item, "compatibility", json_tokener_parse("{\"compatible\":true}"));
        rock_ui_draw(ui);
        int found = 0;
        for (int i = 0; i < ui->hit_count; i++) {
            if (ui->hits[i].action != ACTION_INSTALL) continue;
            found = 1;
            require(ui->hits[i].enabled == (mode == 2), "schema 4 install requires an affirmative OS compatibility result");
        }
        require(found, "incompatible Tool remains inspectable with a disabled install action");
    }
    ui->page = PAGE_HUB;
    snapshot(ui, 1, 1);
    json_object_object_get_ex(ui->snapshot, "catalog", &catalog);
    item = json_object_array_get_idx(catalog, 0);
    json_object *newer = NULL;
    require(json_object_deep_copy(item, &newer, NULL) == 0, "copy independent update manifest");
    json_object_object_get_ex(newer, "manifest", &manifest);
    json_object_object_add(manifest, "version", json_object_new_string("2.0.0"));
    json_object_object_add(manifest, "schema_version", json_object_new_int(4));
    json_object_object_add(manifest, "compatibility", json_tokener_parse(
        "{\"os\":\"rock-star-os\",\"min_os_version\":\"999.0.0\",\"min_runtime_version\":\"1.0.0\"}"));
    json_object_object_add(newer, "compatibility", json_tokener_parse("{\"compatible\":false}"));
    json_object_array_add(catalog, newer);
    click(ui, ACTION_DETAIL);
    rock_ui_draw(ui);
    int update = 0, open = 0;
    for (int i = 0; i < ui->hit_count; i++) {
        if (ui->hits[i].action == ACTION_UPDATE) {
            update++;
            require(!ui->hits[i].enabled, "future-OS update is disabled");
        }
        if (ui->hits[i].action == ACTION_EDITOR) {
            open++;
            require(ui->hits[i].enabled, "compatible installed version remains usable");
        }
    }
    require(update == 1 && open == 1, "update and current Tool have independent compatibility decisions");
    ui->page = PAGE_HUB;
}

static void framebuffer_test(void)
{
    unsigned char memory[16] = { 0 };
    struct rock_fb fb = { .fd = -1, .memory = memory, .memory_size = sizeof(memory), .width = 2, .height = 2 };
    fb.variable.bits_per_pixel = 16;
    fb.variable.red = (struct fb_bitfield){ .offset = 11, .length = 5 };
    fb.variable.green = (struct fb_bitfield){ .offset = 5, .length = 6 };
    fb.variable.blue = (struct fb_bitfield){ .offset = 0, .length = 5 };
    fb.fixed.line_length = 8;
    cairo_surface_t *surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, 2, 2);
    uint32_t *pixels = (uint32_t *)cairo_image_surface_get_data(surface);
    pixels[0] = 0xffff0000;
    pixels[1] = 0xff00ff00;
    pixels[2] = 0xff0000ff;
    pixels[3] = 0xffffffff;
    cairo_surface_mark_dirty(surface);
    require(rock_fb_present(&fb, surface) == 0, "16-bit framebuffer conversion");
    require(memory[0] == 0 && memory[1] == 0xf8 && memory[2] == 0xe0 && memory[3] == 7,
            "RGB565 first row and stride");
    require(memory[8] == 0x1f && memory[9] == 0 && memory[10] == 0xff && memory[11] == 0xff,
            "RGB565 second row");
    cairo_surface_destroy(surface);
    struct input_absinfo range = { .minimum = 0, .maximum = 32767 };
    require(rock_abs_position(0, &range, 720) == 0 && rock_abs_position(32767, &range, 720) == 719 &&
            rock_abs_position(-50, &range, 720) == 0, "absolute pointer bounds");

    struct rock_input input = { .fd = -1, .has_absolute = 1, .x_range = range, .y_range = range };
    struct rock_input_frame frame;
    struct input_event button_first[] = {
        { .type = EV_KEY, .code = BTN_TOUCH, .value = 1 },
        { .type = EV_ABS, .code = ABS_X, .value = 24000 },
        { .type = EV_ABS, .code = ABS_Y, .value = 21000 },
        { .type = EV_SYN, .code = SYN_REPORT, .value = 0 },
    };
    for (size_t i = 0; i < 3; i++)
        require(!rock_input_feed(&input, &button_first[i], 720, 960, &frame), "touch frame waits for SYN_REPORT");
    require(rock_input_feed(&input, &button_first[3], 720, 960, &frame) &&
            frame.state == 1 && frame.x == 527 && frame.y == 615,
            "BTN_TOUCH-first press uses final frame coordinates");
    struct input_event release = { .type = EV_KEY, .code = BTN_TOUCH, .value = 0 };
    require(!rock_input_feed(&input, &release, 720, 960, &frame), "release waits for frame");
    require(rock_input_feed(&input, &button_first[3], 720, 960, &frame) && frame.state == 0,
            "touch release delivered once at SYN_REPORT");
    require(!rock_input_feed(&input, &button_first[3], 720, 960, &frame), "empty input frame has no duplicate event");
}

#include "test_remote.inc"
#include "test_atm.inc"
#include "test_auth.inc"
#include "test_service.inc"
#include "test_activation.inc"
#include "test_mcp.inc"
#include "test_lifecycle.inc"
#include "test_onboarding.inc"
#include "test_game.inc"
#include "test_native_replay.inc"
#include "test_wallet_replay.inc"

int main(int argc, char **argv)
{
    struct rock_ui ui;
    char error[256];
    if (argc == 3 && !strcmp(argv[1], "--wallet-replay")) return wallet_replay_bridge(argv[2]);
    if (argc == 4 && !strcmp(argv[1], "--native-replay")) return native_replay_geometry(argv[2], argv[3]);
    if (argc != 2 && argc != 3) return 2;
    if (argc == 3) test_image_directory = argv[2];
    require(rock_ui_init(&ui, 720, 960, argv[1], capture, NULL, error, sizeof(error)) == 0, error);
    rock_ui_draw(&ui);
    require(!ui.connected && !ui.snapshot && cairo_status(ui.cr) == CAIRO_STATUS_SUCCESS,
            "initial disconnected state contains no fabricated snapshot");
    registry_test(&ui);
    search_test(&ui);
    partial_installation_test(&ui);
    compatibility_test(&ui);
    lifecycle_selection_test(&ui);
    onboarding_test(&ui);
    snapshot(&ui, 0, 0);
    click(&ui, ACTION_DETAIL);
    require(ui.page == PAGE_DETAIL, "pointer opens tool detail");
    click(&ui, ACTION_INSTALL);
    require(!strcmp(value(last_request, "op"), "install") && !strcmp(value(last_request, "id"), "test.native") &&
            strlen(value(last_request, "key")) == 35, "install action carries backend identity and random key");
    accepted(&ui);
    snapshot(&ui, 1, 0);
    click(&ui, ACTION_APPROVE);
    require(!strcmp(value(last_request, "approved_hash"), "test-package-hash"), "approval matches installed package hash");
    accepted(&ui);
    snapshot(&ui, 1, 1);
    click(&ui, ACTION_EDITOR);
    click(&ui, ACTION_INPUT);
    rock_ui_key(&ui, KEY_A, 1);
    rock_ui_key(&ui, KEY_ENTER, 1);
    require(!strcmp(ui.text, "a\n"), "evdev keyboard text entry");
    require(rock_ui_text(&ui, "日本語") == 0, "UTF-8 programmatic input");
    rock_ui_key(&ui, KEY_BACKSPACE, 1);
    require(!strcmp(ui.text, "a\n日本"), "backspace removes one UTF-8 character");
    rock_ui_key(&ui, KEY_LEFTCTRL, 1);
    rock_ui_key(&ui, KEY_A, 1);
    rock_ui_key(&ui, KEY_LEFTCTRL, 0);
    require(rock_ui_text(&ui, "native input") == 0 && !strcmp(ui.text, "native input"), "Ctrl+A replaces complete input");
    click(&ui, ACTION_RUN);
    require(!strcmp(value(last_request, "op"), "run") && !strcmp(value(last_request, "text"), "native input"), "run sends actual input");
    char saved_key[40];
    snprintf(saved_key, sizeof(saved_key), "%s", value(last_request, "key"));
    rock_ui_response(&ui, last_request, NULL, "test-only lost connection");
    require(!ui.connected && ui.retry_request && !strcmp(value(ui.retry_request, "key"), saved_key), "uncertain result preserves request key");
    snapshot(&ui, 1, 1);
    require(ui.connected && ui.retry_request, "snapshot reconnect preserves unresolved mutation");
    rock_ui_draw(&ui);
    for (int i = 0; i < ui.hit_count; i++)
        if (ui.hits[i].action == ACTION_RUN) require(!ui.hits[i].enabled, "new mutation disabled while previous outcome is unresolved");
    json_object *other_request = json_tokener_parse("{\"v\":1,\"op\":\"cancel\",\"key\":\"different-test-key\"}");
    json_object *other_response = json_tokener_parse("{\"ok\":true,\"result\":{}}");
    rock_ui_response(&ui, other_request, other_response, "");
    json_object_put(other_request);
    json_object_put(other_response);
    require(ui.retry_request && !strcmp(value(ui.retry_request, "key"), saved_key), "unrelated success cannot erase unresolved request identity");
    click(&ui, ACTION_RETRY);
    require(!strcmp(value(last_request, "key"), saved_key), "explicit retry reuses identical key");
    json_object *rejection = json_tokener_parse("{\"ok\":false,\"code\":\"rejected\",\"error\":\"test rejection\"}");
    rock_ui_response(&ui, last_request, rejection, "");
    json_object_put(rejection);
    require(ui.message_error && !strcmp(ui.message, "test rejection"), "backend rejection displayed without fake success");
    require(!ui.retry_request, "definitive rejection of same key resolves uncertainty");
    snapshot(&ui, 1, 1);
    ui.page = PAGE_EDITOR;
    ui.editing = 1;
    memset(ui.text, 'x', ROCK_UI_TEXT_MAX);
    ui.text[ROCK_UI_TEXT_MAX] = '\0';
    require(rock_ui_text(&ui, "y") < 0 && strlen(ui.text) == ROCK_UI_TEXT_MAX, "input limit preserves previous input");
    ui.page = PAGE_WALLET;
    ui.scroll = 0;
    click(&ui, ACTION_CONSENT);
    require(!strcmp(value(last_request, "op"), "wallet.consent") && !strcmp(value(last_request, "accepted"), "true"), "simulator consent action");
    accepted(&ui);
    click(&ui, ACTION_WALLET_EXPAND);
    click(&ui, ACTION_AMOUNT);
    require(rock_ui_text(&ui, "12.34") == 0, "wallet amount input");
    click(&ui, ACTION_SALE);
    require(!strcmp(value(last_request, "op"), "wallet.sale") && !strcmp(value(last_request, "amount_minor"), "1234"), "wallet decimal amount converted exactly");
    accepted(&ui);
    for (int page = PAGE_HUB; page <= PAGE_SYSTEM; page++) {
        ui.page = (enum rock_page)page;
        ui.scroll = 0;
        rock_ui_draw(&ui);
        require(cairo_status(ui.cr) == CAIRO_STATUS_SUCCESS, "all native pages render");
    }
    json_object *snapshot_object, *catalog, *manifest;
    snapshot_object = ui.snapshot;
    json_object_object_get_ex(snapshot_object, "catalog", &catalog);
    json_object_object_get_ex(json_object_array_get_idx(catalog, 0), "manifest", &manifest);
    json_object_object_add(manifest, "description", json_object_new_string("\xff\xfe\xc0\xaf"));
    ui.page = PAGE_HUB;
    rock_ui_draw(&ui);
    require(cairo_status(ui.cr) == CAIRO_STATUS_SUCCESS, "invalid UTF-8 data cannot poison Cairo renderer");
    framebuffer_test();
    membership_test(&ui);
    wallet_geometry_test(&ui);
    remote_wallet_cache_test(&ui);
    spider_motion_test();
    security_ui_test(&ui);
    security_frame_evidence(&ui);
    power_ui_test(&ui);
    remote_ui_test(&ui);
    read_queue_test(&ui);
    atm_ui_test(&ui);
    auth_ui_test(&ui);
    purchaser_ui_test(&ui);
    activation_ui_test(&ui);
    activation_poll_test(&ui);
    mcp_ui_test(&ui);
    game_ui_test(&ui);
    rock_ui_destroy(&ui);
    if (last_request) json_object_put(last_request);
    puts("PASS native UI actions, request identities, errors, input limits, rendering, framebuffer conversion, evdev coordinates");
    return 0;
}
