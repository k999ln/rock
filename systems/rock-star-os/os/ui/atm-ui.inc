/* Owner-only simulator controls. Raw issuance codes stay in UI memory and are
 * painted only after an explicit reveal against a current usable status. */
static int atm_registered(struct rock_ui *ui)
{
    json_object *wallet = field(ui->snapshot, "wallet");
    return strict_bool(wallet, "simulation_only", 1) &&
           strict_bool(field(wallet, "membership"), "registered", 1);
}

static int atm_eligible(struct rock_ui *ui)
{
    if (auth_required(ui) && !auth_active(ui)) return 0;
    json_object *backend = field(field(ui->snapshot, "wallet"), "backend");
    if (backend && (!boolean(backend, "connected") || boolean(backend, "stale") || boolean(backend, "pending_reconciliation"))) return 0;
    return atm_registered(ui) && strict_bool(field(field(field(ui->snapshot, "wallet"),
           "membership"), "entitlement"), "device_eligible", 1);
}

static const char *atm_state_label(const char *state)
{
    static const struct { const char *state, *label; } names[] = {
        {"ISSUED", "予約済み"}, {"CANCELED", "取消済み"}, {"EXPIRED", "期限切れ・返却済み"},
        {"AUTHORIZED_NOT_DISPENSED", "消費済み・払出し未確認"}, {"UNKNOWN", "結果未確認・保留中"},
        {"PARTIAL_DISPENSED", "一部払出し・照合待ち"}, {"DISPENSED", "テスト払出し済み"},
        {"REVERSED", "返却済み"}, {"PARTIAL_REVERSED", "一部払出し・残額返却済み"}
    };
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if (!strcmp(state, names[i].state)) return names[i].label;
    return NULL;
}

static int atm_integer(json_object *object, const char *name, int64_t low, int64_t high)
{
    json_object *item = field(object, name);
    return item && json_object_is_type(item, json_type_int) &&
           json_object_get_int64(item) >= low && json_object_get_int64(item) <= high;
}

static int atm_identity(const char *id)
{
    if (strlen(id) != 36) return 0;
    for (size_t i = 0; i < 36; i++) {
        if (i == 8 || i == 13 || i == 18 || i == 23) { if (id[i] != '-') return 0; }
        else if (!((id[i] >= '0' && id[i] <= '9') || (id[i] >= 'a' && id[i] <= 'f'))) return 0;
    }
    return 1;
}

static int atm_times(json_object *object)
{
    json_object *issued = field(object, "issued_at"), *expires = field(object, "expires_at");
    if (!issued || !expires ||
        !(json_object_is_type(issued, json_type_int) || json_object_is_type(issued, json_type_double)) ||
        !(json_object_is_type(expires, json_type_int) || json_object_is_type(expires, json_type_double))) return 0;
    double a = json_object_get_double(issued), b = json_object_get_double(expires);
    return isfinite(a) && isfinite(b) && a > 0 && b > a && b < 253402300799.0;
}

static int atm_status_valid(json_object *status, const char *id)
{
    json_object *withdrawal = field(status, "withdrawal");
    if (!strict_bool(status, "simulation_only", 1) || !strict_string(status, "real_atm_connection", "NOT_CONNECTED") ||
        !strict_string(status, "currency", "USD") || !atm_identity(string(status, "withdrawal_id")) ||
        (id && !strict_string(status, "withdrawal_id", id)) || !atm_state_label(string(status, "state")) ||
        !strict_string(withdrawal, "id", string(status, "withdrawal_id")) || !atm_times(status) ||
        !sha256_text(string(status, "code_sha256")) ||
        (!strict_string(status, "atm_id", "SIM-ATM-001") && !strict_string(status, "atm_id", "SIM-ATM-002")) ||
        !atm_integer(withdrawal, "amount_minor", 1000, 50000) ||
        !atm_integer(withdrawal, "dispensed_minor", 0, 50000) || !atm_integer(withdrawal, "released_minor", 0, 50000)) return 0;
    const char *flags[] = {"code_usable", "consumed", "cleanup_needed"};
    for (size_t i = 0; i < 3; i++)
        if (!field(status, flags[i]) || !json_object_is_type(field(status, flags[i]), json_type_boolean)) return 0;
    return json_object_get_int64(field(withdrawal, "dispensed_minor")) +
           json_object_get_int64(field(withdrawal, "released_minor")) <= json_object_get_int64(field(withdrawal, "amount_minor"));
}

static int atm_can_reveal(struct rock_ui *ui)
{
    json_object *status = ui->atm_status, *issue = ui->atm_issue;
    return ui->connected && !ui->retry_request && !ui->queued_request && (!ui->busy || ui->busy_read) &&
           issue && status && strict_bool(status, "code_usable", 1) &&
           strict_bool(status, "consumed", 0) && strict_string(status, "state", "ISSUED") &&
           strict_string(issue, "withdrawal_id", ui->atm_selected) &&
           strict_string(issue, "code_sha256", string(status, "code_sha256")) &&
           json_object_get_double(field(status, "expires_at")) > (double)time(NULL);
}

static void atm_read(struct rock_ui *ui, int selected)
{
    if (!atm_registered(ui) || (selected && !*ui->atm_selected)) return;
    json_object *request = request_new(selected ? "wallet.atm.status" : "wallet.atm.history");
    if (selected) put_string(request, "withdrawal_id", ui->atm_selected);
    else json_object_object_add(request, "limit", json_object_new_int(50));
    send_request(ui, request);
    json_object_put(request);
}

static void draw_atm(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    char balance[80];
    button(ui, 32, y, 180, 42, "‹ Walletへ戻る", ACTION_NAV, PAGE_WALLET, NULL, NULL, 1, 0); y += 65;
    text(ui, 34, y + 26, 25, 1, COLOR_INK, "現金を動かさないATMテスト", 647); y += 48;
    wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
            "実ATM・銀行には接続しません。予約すると\nシミュレーターの残高を一時的に保留します。", 2); y += 78;
    panel(ui, 32, y, 656, 84, COLOR_WHITE);
    money(balance, sizeof(balance), field(ui->snapshot, "wallet"), "available_minor");
    text(ui, 54, y + 29, 16, 0, COLOR_MUTED, "使用可能なテスト残高", 600);
    text(ui, 54, y + 65, 26, 1, COLOR_INK, balance, 600); y += 106;
    text(ui, 35, y + 23, 18, 1, COLOR_INK, "予約額（USD 10〜500・10刻み）", 645); y += 37;
    text_entry(ui, y, ui->amount, 1); y += 82;
    text(ui, 35, y + 20, 17, 0, COLOR_MUTED, "テスト先: SIM-ATM-001 · 有効期限5分", 648); y += 38;
    button(ui, 32, y, 656, 56, "予約内容を確認…", ACTION_ATM_ISSUE, 0, NULL, NULL,
           can_mutate(ui) && atm_eligible(ui), 1); y += 78;
    if (!atm_eligible(ui))
        y += wrapped(ui, 35, y, 648, 17, 28, COLOR_ERROR, "新しい予約にはWalletのテスト登録と端末の利用資格が必要です。", 3) + 20;
    text(ui, 35, y + 24, 21, 1, COLOR_INK, "予約履歴", 648); y += 42;
    json_object *items = field(ui->atm_history, "items");
    if (!ui->atm_history) { text(ui, 35, y + 23, 17, 0, COLOR_MUTED, "履歴はサービスから取得します。", 648); y += 48; }
    else if (!array_size(items)) { text(ui, 35, y + 23, 17, 0, COLOR_MUTED, "予約の記録はありません。", 648); y += 48; }
    for (size_t i = 0; i < array_size(items) && i < 50; i++) {
        json_object *item = array_item(items, i);
        panel(ui, 32, y, 656, 100, COLOR_WHITE);
        money(balance, sizeof(balance), field(item, "withdrawal"), "amount_minor");
        text(ui, 54, y + 32, 22, 1, COLOR_INK, balance, 580);
        text(ui, 54, y + 72, 18, 0, COLOR_MUTED, atm_state_label(string(item, "state")), 580);
        hit(ui, 32, y, 656, 100, ACTION_ATM_RESULT, 0, string(item, "withdrawal_id"), NULL, 1); y += 118;
    }
    if (boolean(ui->atm_history, "truncated"))
        y += wrapped(ui, 35, y, 648, 16, 27, COLOR_MUTED, "最新50件を表示しています。省略した履歴は削除されていません。", 3) + 18;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_atm_status(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    json_object *status = ui->atm_status, *withdrawal = field(status, "withdrawal");
    button(ui, 32, y, 180, 42, "‹ ATMテストへ", ACTION_NAV, PAGE_ATM, NULL, NULL, 1, 0); y += 65;
    if (!atm_can_reveal(ui)) ui->atm_code_visible = 0;
    if (!status) {
        wrapped(ui, 35, y, 648, 20, 32, COLOR_MUTED,
                "発行時の応答は、現在の状態を示しません。\nサービスに予約の状態を確認しています。", 3);
        button(ui, 32, y + 135, 656, 52, "現在の状態を取得", ACTION_ATM_STATUS, 0, NULL, NULL, !ui->busy, 0);
        ui->content_height = 290; return;
    }
    text(ui, 34, y + 26, 26, 1, COLOR_INK, atm_state_label(string(status, "state")), 647); y += 48;
    wrapped(ui, 35, y, 648, 17, 28, COLOR_MUTED,
            boolean(status, "consumed") ? "コードは消費済みです。未確認分は保留を維持し、\nATM側の照合結果が出るまで返却しません。" :
            boolean(status, "code_usable") && json_object_get_double(field(status, "expires_at")) > (double)time(NULL) ?
            "シミュレーターの予約です。コードは隠しています。\n実ATMには接続していません。" :
            "現在このコードは使えません。期限切れの未処理分は\n取消で照合できます。実ATMは未接続です。", 2); y += 78;
    panel(ui, 32, y, 656, 132, COLOR_WHITE);
    const char *labels[] = {"予約", "テスト払出し", "返却"};
    const char *fields[] = {"amount_minor", "dispensed_minor", "released_minor"};
    char value[80];
    for (int i = 0; i < 3; i++) {
        money(value, sizeof(value), withdrawal, fields[i]);
        text(ui, 52, y + 29 + i * 37, 17, 0, COLOR_MUTED, labels[i], 250);
        text(ui, 359, y + 29 + i * 37, 19, 1, COLOR_INK, value, 300);
    }
    y += 154;
    int64_t held = json_object_get_int64(field(withdrawal, "amount_minor")) -
        json_object_get_int64(field(withdrawal, "dispensed_minor")) - json_object_get_int64(field(withdrawal, "released_minor"));
    snprintf(value, sizeof(value), "保留中: USD %" PRId64 ".%02" PRId64, held / 100, held % 100);
    text(ui, 35, y + 22, 18, 1, COLOR_INK, value, 648); y += 48;
    button(ui, 32, y, 656, 52, ui->atm_code_visible ? "コードを隠す" : "コードを表示（画面の共有に注意）",
           ACTION_ATM_CODE, 0, NULL, NULL, atm_can_reveal(ui), 0); y += 74;
    button(ui, 32, y, 656, 52, "予約を取消・保留を照合", ACTION_ATM_CANCEL, 0, NULL, NULL,
           held > 0 && atm_registered(ui) && can_mutate(ui), 1); y += 74;
    button(ui, 32, y, 656, 52, "現在の状態を取得", ACTION_ATM_STATUS, 0, NULL, NULL, !ui->busy, 0); y += 74;
    if (ui->atm_code_visible) {
        y += wrapped(ui, 35, y, 648, 16, 27, COLOR_ERROR, "表示専用です。コードを撮影・共有しないでください。", 2) + 15;
        y += wrapped(ui, 35, y, 648, 22, 35, COLOR_INK, string(ui->atm_issue, "code"), 2) + 25;
    }
    text(ui, 35, y + 20, 14, 0, COLOR_MUTED, ui->atm_selected, 648); y += 42;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int atm_activate(struct rock_ui *ui, const struct rock_hit *target)
{
    switch (target->action) {
    case ACTION_ATM_OPEN:
        snprintf(ui->amount, sizeof(ui->amount), "10.00");
        navigate(ui, PAGE_ATM); ui->atm_poll = 0; return 1;
    case ACTION_ATM_RESULT:
        if (!atm_identity(target->id)) return 1;
        memcpy(ui->atm_selected, target->id, 37);
        if (ui->atm_status) json_object_put(ui->atm_status);
        ui->atm_status = NULL;
        navigate(ui, PAGE_ATM_STATUS); ui->atm_poll = 0; return 1;
    case ACTION_ATM_STATUS: atm_read(ui, 1); return 1;
    case ACTION_ATM_CODE:
        ui->atm_code_visible = atm_can_reveal(ui) && !ui->atm_code_visible; return 1;
    case ACTION_ATM_ISSUE: case ACTION_ATM_CANCEL: break;
    default: return 0;
    }
    if (!can_mutate(ui) || !atm_registered(ui)) return 1;
    json_object *request;
    if (target->action == ACTION_ATM_ISSUE) {
        int64_t amount;
        if (!atm_eligible(ui)) return 1;
        if (amount_minor(ui->amount, &amount) < 0 || amount < 1000 || amount > 50000 || amount % 1000) {
            snprintf(ui->message, sizeof(ui->message), "予約額はUSD 10〜500の範囲で、10刻みにしてください。");
            ui->message_error = 1; return 1;
        }
        request = request_new(auth_required(ui) ? "wallet.atm.quote" : "wallet.atm.issue");
        json_object_object_add(request, "amount_minor", json_object_new_int64(amount));
        put_string(request, "atm_id", "SIM-ATM-001");
    } else {
        if (!ui->atm_status || !atm_identity(ui->atm_selected)) return 1;
        request = request_new("wallet.atm.cancel");
        put_string(request, "withdrawal_id", ui->atm_selected);
        ui->atm_code_visible = 0;
        json_object_put(ui->atm_status);
        ui->atm_status = NULL;
    }
    char key[40];
    if (rock_request_key(key, sizeof(key)) < 0) { json_object_put(request); return 1; }
    put_string(request, "key", key);
    if (target->action == ACTION_ATM_ISSUE && auth_required(ui)) {
        if (rock_request_key(key, sizeof(key)) < 0) { json_object_put(request); return 1; }
        put_string(request, "issue_key", key);
        send_request(ui, request);
        json_object_put(request);
        return 1;
    }
    if (target->action == ACTION_ATM_ISSUE) {
        if (ui->confirm_request) json_object_put(ui->confirm_request);
        ui->confirm_request = request;
        snprintf(ui->confirm_title, sizeof(ui->confirm_title), "テスト残高を予約しますか？");
        ui->focus = -1; ui->editing = 0;
    } else { send_request(ui, request); json_object_put(request); }
    return 1;
}

static int atm_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    const char *operation = string(request, "op");
    if (strncmp(operation, "wallet.atm.", 11)) return 0;
    json_object *result = field(response, "result");
    int issue = !strcmp(operation, "wallet.atm.issue"), history = !strcmp(operation, "wallet.atm.history");
    int read = rock_ui_request_is_read(request), valid;
    if (issue) {
        const char *code = string(result, "code");
        int authenticated = field(request, "quote_id") != NULL;
        json_object *expected = authenticated ? field(ui->atm_quote, "quote") : request;
        valid = strict_bool(result, "simulation_only", 1) && strict_string(result, "real_atm_connection", "NOT_CONNECTED") &&
            strict_string(result, "receipt_kind", "immutable_issuance") && strict_string(result, "state_at_issue", "ISSUED") &&
            strict_string(result, "currency", "USD") && strict_string(result, "atm_id", string(expected, "atm_id")) &&
            atm_identity(string(result, "withdrawal_id")) && atm_times(result) && sha256_text(string(result, "code_sha256")) &&
            atm_integer(result, "amount_minor", 1000, 50000) &&
            json_object_get_int64(field(result, "amount_minor")) == json_object_get_int64(field(expected, "amount_minor")) && strlen(code) == 32;
        if (authenticated) valid = valid && expected &&
            strict_string(ui->atm_quote, "quote_id", string(request, "quote_id")) &&
            strict_string(result, "quote_id", string(request, "quote_id")) &&
            strict_string(result, "authentication", "verified_software_test_assertion") && *string(result, "approval_id") &&
            atm_integer(result, "fee_minor", 0, 0) &&
            atm_integer(result, "total_debit_minor", 1000, 50000) && atm_integer(result, "cash_received_minor", 1000, 50000) &&
            json_object_get_int64(field(result, "total_debit_minor")) == json_object_get_int64(field(expected, "total_debit_minor")) &&
            json_object_get_int64(field(result, "cash_received_minor")) == json_object_get_int64(field(expected, "cash_received_minor"));
        for (size_t i = 0; valid && i < 32; i++)
            if (!((code[i] >= 'A' && code[i] <= 'Z') || (code[i] >= 'a' && code[i] <= 'z') ||
                  (code[i] >= '0' && code[i] <= '9') || code[i] == '_' || code[i] == '-')) valid = 0;
    } else if (history) {
        json_object *items = field(result, "items");
        valid = strict_bool(result, "simulation_only", 1) && items && json_object_is_type(items, json_type_array) &&
            json_object_array_length(items) <= 50 && atm_integer(result, "total", (int64_t)json_object_array_length(items), INT64_MAX) &&
            field(result, "truncated") && json_object_is_type(field(result, "truncated"), json_type_boolean);
        for (size_t i = 0; valid && i < array_size(items); i++) valid = atm_status_valid(array_item(items, i), NULL);
    } else valid = (!strcmp(operation, "wallet.atm.status") || !strcmp(operation, "wallet.atm.cancel")) &&
                  atm_status_valid(result, string(request, "withdrawal_id"));
    if (!valid) {
        rock_ui_response(ui, request, NULL, "ATMテストの応答が不完全です。同じ要求で状態を確認してください。");
        return 1;
    }
    if (!read && ui->retry_request && !is_retry(ui, request)) return 1;
    if (!read && is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    if (history) {
        if (ui->atm_history) json_object_put(ui->atm_history);
        ui->atm_history = json_object_get(result);
    } else if (issue) {
        if (ui->atm_issue) json_object_put(ui->atm_issue);
        ui->atm_issue = json_object_get(result);
        snprintf(ui->atm_selected, sizeof(ui->atm_selected), "%s", string(result, "withdrawal_id"));
        if (ui->atm_status) json_object_put(ui->atm_status);
        ui->atm_status = NULL;
        auth_reset(ui);
        navigate(ui, PAGE_ATM_STATUS); ui->atm_poll = 0;
    } else if (strict_string(result, "withdrawal_id", ui->atm_selected)) {
        if (ui->atm_status) json_object_put(ui->atm_status);
        ui->atm_status = json_object_get(result);
        if (!atm_can_reveal(ui)) ui->atm_code_visible = 0;
    }
    if (!ui->retry_request) { ui->message[0] = '\0'; ui->message_error = 0; }
    return 1;
}
