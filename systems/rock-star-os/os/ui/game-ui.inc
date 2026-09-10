/* Public synthetic Game connection and per-purchase consent. No author keys,
 * Wallet mint operations, automatic re-purchase, or PIN forwarding. */
static void game_replace(json_object **slot, json_object *value)
{
    if (*slot) json_object_put(*slot);
    *slot = value ? json_object_get(value) : NULL;
}

static int game_page(struct rock_ui *ui) { return ui->page >= PAGE_GAME && ui->page <= PAGE_GAME_PIN; }
static int game_read(const char *op)
{
    return !strcmp(op, "game.sandbox.catalog") || !strcmp(op, "game.connection.status") ||
           !strcmp(op, "game.exchange.status") || !strcmp(op, "game.exchange.list");
}

static int game_ready(struct rock_ui *ui)
{
    return can_mutate(ui) && !ui->game_pending && !ui->queued_request;
}

static int game_owner_ready(struct rock_ui *ui)
{
    json_object *backend = field(field(ui->snapshot, "wallet"), "backend");
    return atm_registered(ui) && auth_active(ui) && (!backend ||
           (strict_bool(backend, "connected", 1) && strict_bool(backend, "stale", 0) &&
            strict_bool(backend, "pending_reconciliation", 0)));
}

static const char *game_state_label(const char *state)
{
    if (!strcmp(state, "COMPLETED")) return "交換完了";
    if (!strcmp(state, "REVERSED")) return "付与拒否・保留を解放";
    if (!strcmp(state, "CANCELLED")) return "送信前に取消済み";
    if (!strcmp(state, "QUEUED")) return "予約済み・送信待ち";
    if (!strcmp(state, "CONFIRMING")) return "照合中・残高は保留";
    if (!strcmp(state, "REVIEW_REQUIRED")) return "確認が必要・保留を維持";
    return "状態未取得";
}

static int game_terminal(json_object *state)
{
    const char *value = string(state, "state");
    return !strcmp(value, "COMPLETED") || !strcmp(value, "REVERSED") || !strcmp(value, "CANCELLED");
}

static void game_send(struct rock_ui *ui, json_object *request)
{
    if (request) { send_request(ui, request); json_object_put(request); }
}

static json_object *game_request(const char *operation, int keyed)
{
    json_object *request = request_new(operation);
    if (keyed && !auth_key(request, "key")) { json_object_put(request); return NULL; }
    return request;
}

static void game_refresh(struct rock_ui *ui)
{
    if (ui->page == PAGE_GAME_PIN || ui->page == PAGE_GAME_QUOTE) return;
    json_object *request;
    if (ui->page == PAGE_GAME_STATUS && *ui->game_connection && *ui->game_exchange) {
        request = game_request("game.exchange.status", 0);
        put_string(request, "connection_id", ui->game_connection);
        put_string(request, "exchange_id", ui->game_exchange);
    } else if (ui->game_poll++ % 2) {
        request = game_request("game.exchange.list", 0);
        json_object_object_add(request, "limit", json_object_new_int(10));
        json_object_object_add(request, "after", NULL);
    } else request = game_request("game.sandbox.catalog", 0);
    game_send(ui, request);
}

static json_object *game_selected(struct rock_ui *ui, const char *id)
{
    json_object *games = field(ui->game_catalog, "games");
    for (size_t i = 0; i < array_size(games); i++) {
        json_object *entry = array_item(games, i);
        if (!strcmp(string(entry, "game_id"), id)) return entry;
    }
    return NULL;
}

static int game_quote_valid(struct rock_ui *ui, json_object *quote)
{
    json_object *b = field(quote, "binding");
    return strict_string(quote, "schema", "rock-game-exchange-quote/1") && strict_bool(quote, "simulation_only", 1) &&
           strict_string(b, "game_id", ui->game_id) && strict_string(b, "connection_id", ui->game_connection) &&
           strict_string(b, "exchange_id", ui->game_exchange) && strlen(string(b, "quote_id")) == 36 &&
           strlen(string(quote, "binding_sha256")) == 64 && strict_string(b, "source_asset", "synthetic:usd") &&
           atm_integer(b, "principal_minor", 100, 100) && atm_integer(b, "game_fee_minor", 3, 3) &&
           atm_integer(b, "external_cost_minor", 0, 0) && atm_integer(b, "total_minor", 103, 103) &&
           atm_integer(b, "units", 10, 10) && atm_integer(b, "source_scale", 2, 2) && atm_integer(b, "destination_scale", 0, 0) &&
           (*string(b, "destination_asset") && strlen(string(b, "destination_asset")) < 65) &&
           json_object_get_int64(field(b, "expires_at")) > json_object_get_int64(field(b, "issued_at")) &&
           json_object_get_int64(field(b, "expires_at")) - json_object_get_int64(field(b, "issued_at")) <= 120;
}

static double game_expires(struct rock_ui *ui)
{
    return ui->game_mode == 1 ? json_object_get_double(field(field(ui->game_intent, "binding"), "intent_expires_at")) :
           json_object_get_double(field(ui->game_intent, "expires_at"));
}

static double game_amounts(struct rock_ui *ui, double y, json_object *binding)
{
    char label[200], amount[80];
    const char *labels[] = {"合成Walletからの購入額", "ゲーム手数料（試験値）", "外部実費（試験値）", "保留する合計"};
    const char *fields[] = {"principal_minor", "game_fee_minor", "external_cost_minor", "total_minor"};
    for (int i = 0; i < 4; i++) {
        money(amount, sizeof(amount), binding, fields[i]);
        text(ui, 40, y + 25, 17, 0, COLOR_MUTED, labels[i], 420);
        text(ui, 487, y + 25, 20, 1, COLOR_INK, amount, 193); y += 39;
    }
    snprintf(label, sizeof(label), "受取り: %" PRId64 " %s", json_object_get_int64(field(binding, "units")), string(binding, "destination_asset"));
    text(ui, 40, y + 25, 21, 1, COLOR_ACCENT, label, 640);
    return y + 51;
}

static double game_notice(struct rock_ui *ui, double y)
{
    if (*ui->game_error) y += wrapped(ui, 35, y, 650, 17, 28, COLOR_ERROR, ui->game_error, 4) + 18;
    if (ui->game_pending) {
        y += wrapped(ui, 35, y, 650, 17, 28, COLOR_MUTED,
                     "送信した要求の応答が未確認です。新しい交換は開始せず、同じ要求を確認します。", 3) + 14;
        button(ui, 32, y, 656, 54, "同じ要求の結果を確認", ACTION_GAME_RETRY, 0, NULL, NULL, !ui->busy, 1);
        y += 76;
    }
    return y;
}

static void draw_game(struct rock_ui *ui)
{
    double y = game_notice(ui, ui->content_top - ui->scroll);
    y += wrapped(ui, 35, y, 650, 18, 29, COLOR_MUTED,
                 "合成WalletからGameへ。接続の同意と、一回ごとの購入承認を分けて確認します。実際のお金ではありません。", 3) + 20;
    if (!game_owner_ready(ui)) {
        y += wrapped(ui, 35, y, 650, 17, 28, COLOR_MUTED,
                     "最初にWalletで登録、試験認証、利用条件を確認してください。月額契約への同意は別の操作です。", 3) + 16;
        button(ui, 32, y, 656, 49, "Walletで準備する", ACTION_NAV, PAGE_WALLET, NULL, NULL, 1, 0); y += 71;
    } else if (strict_bool(ui->game_catalog, "fixture_credit_applied", 0)) {
        y += wrapped(ui, 35, y, 650, 16, 26, COLOR_MUTED,
                     "このsandboxでは、本人の操作で公開テスト残高を一度だけ追加できます。収入や実際の資金ではありません。", 3) + 16;
        button(ui, 32, y, 656, 49, "公開テスト残高 $100 を追加", ACTION_GAME_CREDIT, 0, NULL, NULL, game_ready(ui), 0); y += 71;
    }
    json_object *games = field(ui->game_catalog, "games");
    if (!array_size(games)) {
        empty_state(ui, y, "ゲーム接続を確認しています", "接続できない間も、Hubの結果や端末の終了操作を利用できます。");
        y += 252;
    }
    for (size_t i = 0; i < array_size(games); i++) {
        json_object *entry = array_item(games, i);
        int active = strict_string(entry, "current_state", "ACTIVE");
        panel(ui, 32, y, 656, 190, COLOR_WHITE);
        text(ui, 55, y + 35, 24, 1, COLOR_INK, string(entry, "game_name"), 600);
        text(ui, 55, y + 69, 16, 0, COLOR_MUTED, string(entry, "player_id"), 600);
        const char *connection_label = active ? "接続済み · 購入は毎回承認" :
            strict_string(entry, "current_state", "REVOKED") ? "接続は解除済みです" :
            strict_string(entry, "current_state", "EXPIRED") ? "接続の期限が切れています" :
            strict_string(entry, "current_state", "AWAITING_OWNER_CONSENT") ? "接続の同意が未完了です" : "未接続 · 本人の同意が必要";
        text(ui, 55, y + 99, 16, 0, COLOR_MUTED, connection_label, 600);
        button(ui, 52, y + 117, 616, 53, active ? "10単位の交換条件を確認" : "ゲームとWalletを接続",
               active ? ACTION_GAME_QUOTE : ACTION_GAME_CONNECT, 0, string(entry, "game_id"), NULL,
               game_ready(ui) && (active || strict_string(entry, "current_state", "NOT_CONNECTED") ||
                                  strict_string(entry, "current_state", "AWAITING_OWNER_CONSENT")), 1);
        y += 210;
    }
    text(ui, 35, y + 26, 23, 1, COLOR_INK, "交換の履歴", 640); y += 48;
    json_object *rows = field(ui->game_history, "items");
    if (!ui->game_history) { text(ui, 35, y + 23, 17, 0, COLOR_MUTED, "履歴を取得しています。", 640); y += 47; }
    else if (!array_size(rows)) { text(ui, 35, y + 23, 17, 0, COLOR_MUTED, "まだ交換の履歴はありません。", 640); y += 47; }
    for (size_t i = 0; i < array_size(rows); i++) {
        json_object *row = array_item(rows, i), *binding = field(field(row, "quote"), "binding");
        char value[220];
        snprintf(value, sizeof(value), "%s · %s", string(binding, "game_id"), game_state_label(string(row, "state")));
        button(ui, 32, y, 656, 64, value, ACTION_GAME_STATUS, 0, string(row, "exchange_id"), string(row, "connection_id"), 1, 0);
        y += 80;
    }
    if (field(ui->game_history, "next_after") && !json_object_is_type(field(ui->game_history, "next_after"), json_type_null)) {
        y += wrapped(ui, 35, y, 650, 16, 26, COLOR_MUTED, "直近10件を表示しています。全履歴は作者SDKの照会APIから取得できます。", 2) + 20;
    }
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_game_quote(struct rock_ui *ui)
{
    double y = game_notice(ui, ui->content_top - ui->scroll);
    json_object *binding = field(ui->game_quote, "binding");
    button(ui, 32, y, 150, 42, "‹ Gameへ", ACTION_GAME_BACK, 0, NULL, NULL, !ui->busy, 0); y += 65;
    text(ui, 35, y + 26, 23, 1, COLOR_INK, string(binding, "game_id"), 640); y += 43;
    text(ui, 35, y + 23, 16, 0, COLOR_MUTED, string(binding, "player_id"), 640); y += 43;
    y = game_amounts(ui, y, binding);
    y += wrapped(ui, 35, y, 650, 17, 28, COLOR_MUTED,
                 "購入方向だけの合成交換です。これはゲームの本番料金ではありません。承認だけでは付与完了にならず、両方の台帳の確定を待ちます。", 4) + 24;
    double expires = json_object_get_double(field(binding, "expires_at"));
    int valid = game_quote_valid(ui, ui->game_quote) && expires > (double)time(NULL);
    button(ui, 32, y, 656, 58, valid ? "内容を確認して購入の承認へ" : "条件の期限が切れました。Gameへ戻って確認", ACTION_GAME_APPROVAL,
           0, NULL, NULL, game_ready(ui) && valid, 1); y += 80;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_game_status(struct rock_ui *ui)
{
    double y = game_notice(ui, ui->content_top - ui->scroll);
    button(ui, 32, y, 160, 42, "‹ Gameの履歴", ACTION_GAME_BACK, 0, NULL, NULL, !ui->busy, 0); y += 66;
    if (!ui->game_status) { empty_state(ui, y, "交換の状態を取得しています", "不明な結果を、新しい交換としてやり直しません。"); y += 252; }
    else {
        text(ui, 35, y + 27, 25, 1, COLOR_INK, game_state_label(string(ui->game_status, "state")), 640); y += 50;
        json_object *binding = field(field(ui->game_status, "quote"), "binding");
        text(ui, 35, y + 23, 18, 0, COLOR_MUTED, string(binding, "game_id"), 640); y += 43;
        y = game_amounts(ui, y, binding);
        char value[110]; money(value, sizeof(value), ui->game_status, "held_minor");
        text(ui, 40, y + 25, 17, 0, COLOR_MUTED, "現在保留している合成残高", 420);
        text(ui, 487, y + 25, 20, 1, COLOR_INK, value, 193); y += 51;
        if (!game_terminal(ui->game_status)) {
            y += wrapped(ui, 35, y, 650, 17, 28, COLOR_MUTED, "応答不明や通信切断では保留を維持します。取消の要求は、取消や返金の確定ではありません。", 3) + 20;
            button(ui, 32, y, 656, 54, "同じ交換を照合", ACTION_GAME_RECONCILE, 0, NULL, NULL, game_ready(ui), 1); y += 72;
            button(ui, 32, y, 656, 54, "取消を要求", ACTION_GAME_CANCEL, 0, NULL, NULL, game_ready(ui), 0); y += 72;
        }
    }
    button(ui, 32, y, 656, 54, "Walletの状態を確認", ACTION_NAV, PAGE_WALLET, NULL, NULL, 1, 0); y += 76;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_game_pin(struct rock_ui *ui)
{
    ui->hit_count = 0;
    panel(ui, 0, 0, 720, 960, COLOR_BG);
    text(ui, 35, 52, 26, 1, COLOR_INK, ui->game_mode == 1 ? "ゲームへの接続を確認" : "今回の合成交換を確認", 650);
    wrapped(ui, 35, 78, 650, 17, 27, COLOR_ERROR, "公開テスト用のソフトウェア認証です。実資金・実機のパスキーは使いません。", 2);
    double y = 147;
    json_object *binding = field(ui->game_mode == 1 ? ui->game_intent : field(ui->game_intent, "quote"), "binding");
    text(ui, 40, y + 25, 23, 1, COLOR_INK, string(binding, "game_id"), 640); y += 43;
    text(ui, 40, y + 23, 17, 0, COLOR_MUTED, string(binding, "player_id"), 640); y += 40;
    if (ui->game_mode == 2) y = game_amounts(ui, y, binding);
    else {
        y += wrapped(ui, 40, y, 640, 19, 30, COLOR_INK, "このゲームのプレイヤーとWalletを接続します。接続だけでは合成残高を使わず、購入は別の承認が必要です。", 4) + 20;
        char scopes[400]; joined_array(scopes, sizeof(scopes), field(binding, "scopes"), 0);
        y += wrapped(ui, 40, y, 640, 16, 26, COLOR_MUTED, scopes, 3) + 20;
    }
    char remaining[120]; double seconds = game_expires(ui) - (double)time(NULL);
    snprintf(remaining, sizeof(remaining), seconds > 0 ? "確認の残り時間: %.0f秒" : "期限切れです。戻って条件を取得し直してください。", fmax(0, seconds));
    text(ui, 40, y + 24, 17, 0, seconds > 0 ? COLOR_MUTED : COLOR_ERROR, remaining, 640); y += 45;
    text(ui, 40, y + 24, 18, 1, COLOR_INK, "試験PINを入力（公開テスト値: 0000）", 640); y += 38;
    panel(ui, 38, y, 644, 60, COLOR_WHITE);
    char masked[5] = "";
    for (size_t i = 0; i < strlen(ui->auth_pin); i++) masked[i] = '*';
    text(ui, 57, y + 40, 28, 1, COLOR_INK, *masked ? masked : "PIN", 600);
    hit(ui, 38, y, 644, 60, ACTION_AUTH_PIN, 0, NULL, NULL, !ui->busy && !ui->game_pending);
    if (*ui->game_error) wrapped(ui, 40, y + 76, 640, 16, 26, COLOR_ERROR, ui->game_error, 2);
    if (ui->game_pending) button(ui, 38, 840, 644, 54, "送信済みの同じ要求を確認", ACTION_GAME_RETRY, 0, NULL, NULL, !ui->busy, 1);
    else {
        button(ui, 38, 840, 300, 54, "戻る・承認しない", ACTION_GAME_BACK, 0, NULL, NULL, !ui->busy && !ui->queued_request, 0);
        button(ui, 358, 840, 324, 54, ui->game_mode == 1 ? "認証して接続" : "認証して今回の交換を承認", ACTION_GAME_SIGN,
               0, NULL, NULL, game_ready(ui) && seconds > 0 && strlen(ui->auth_pin) == 4, 1);
    }
    ui->content_height = 0;
}

static int game_activate(struct rock_ui *ui, const struct rock_hit *target)
{
    if (target->action == ACTION_AUTH_PIN && ui->page == PAGE_GAME_PIN) { ui->editing = 4; return 1; }
    if (target->action < ACTION_GAME_OPEN || target->action > ACTION_GAME_CREDIT) return 0;
    if (target->action == ACTION_GAME_OPEN || target->action == ACTION_GAME_BACK) {
        if (ui->busy || ui->queued_request) return 1;
        auth_clear_pin(ui);
        navigate(ui, PAGE_GAME);
        ui->game_poll = 0;
        return 1;
    }
    if (target->action == ACTION_GAME_RETRY) {
        if (!ui->busy && ui->game_pending) send_request(ui, ui->game_pending);
        return 1;
    }
    if (target->action == ACTION_GAME_STATUS) {
        if (ui->busy || !*target->id || strlen(target->id) > 128 || strlen(target->version) != 36) return 1;
        snprintf(ui->game_exchange, sizeof(ui->game_exchange), "%s", target->id);
        snprintf(ui->game_connection, sizeof(ui->game_connection), "%s", target->version);
        game_replace(&ui->game_status, NULL);
        navigate(ui, PAGE_GAME_STATUS);
        return 1;
    }
    if (!game_ready(ui)) return 1;
    json_object *request = NULL;
    if (target->action == ACTION_GAME_CREDIT) {
        if (!game_owner_ready(ui) || !strict_bool(ui->game_catalog, "fixture_credit_applied", 0)) return 1;
        request = game_request("game.sandbox.credit", 1);
        if (request) json_object_object_add(request, "amount_minor", json_object_new_int(10000));
    } else if (target->action == ACTION_GAME_CONNECT || target->action == ACTION_GAME_QUOTE) {
        json_object *entry = game_selected(ui, target->id);
        if (!entry || !strict_bool(entry, "simulation_only", 1) || strlen(target->id) > 128) return 1;
        int connect = target->action == ACTION_GAME_CONNECT;
        if (connect && !strict_string(entry, "current_state", "NOT_CONNECTED") &&
            !strict_string(entry, "current_state", "AWAITING_OWNER_CONSENT")) return 1;
        if (!connect && (!strict_string(entry, "current_state", "ACTIVE") || strlen(string(entry, "connection_id")) != 36)) return 1;
        snprintf(ui->game_id, sizeof(ui->game_id), "%s", target->id);
        ui->game_error[0] = '\0';
        game_replace(&ui->game_quote, NULL); game_replace(&ui->game_intent, NULL);
        ui->game_ceremony_key[0] = ui->game_approval_key[0] = '\0';
        request = game_request(connect ? "game.sandbox.connection.begin" : "game.exchange.quote", 1);
        if (!request) return 1;
        if (connect) put_string(request, "game_id", ui->game_id);
        else {
            char key[40];
            if (rock_request_key(key, sizeof(key)) < 0) { json_object_put(request); return 1; }
            snprintf(ui->game_exchange, sizeof(ui->game_exchange), "%s", key);
            snprintf(ui->game_connection, sizeof(ui->game_connection), "%s", string(entry, "connection_id"));
            put_string(request, "connection_id", ui->game_connection);
            put_string(request, "exchange_id", ui->game_exchange);
            json_object_object_add(request, "principal_minor", json_object_new_int(100));
        }
    } else if (target->action == ACTION_GAME_APPROVAL) {
        if (!game_quote_valid(ui, ui->game_quote) ||
            json_object_get_double(field(field(ui->game_quote, "binding"), "expires_at")) <= (double)time(NULL)) return 1;
        request = game_request("game.exchange.approval.begin", 1);
        if (request) put_string(request, "quote_id", string(field(ui->game_quote, "binding"), "quote_id"));
    } else if (target->action == ACTION_GAME_SIGN) {
        if (ui->page != PAGE_GAME_PIN || !ui->game_intent || strlen(ui->auth_pin) != 4 || game_expires(ui) <= (double)time(NULL)) return 1;
        request = game_request(ui->game_mode == 1 ? "auth.game.connect" : "auth.game.exchange", 0);
        if (!*ui->game_ceremony_key && rock_request_key(ui->game_ceremony_key, sizeof(ui->game_ceremony_key)) < 0) { json_object_put(request); return 1; }
        if (!*ui->game_approval_key && rock_request_key(ui->game_approval_key, sizeof(ui->game_approval_key)) < 0) { json_object_put(request); return 1; }
        put_string(request, "key", ui->game_ceremony_key);
        put_string(request, "pin", ui->auth_pin);
        json_object_object_add(request, "intent", json_object_get(ui->game_intent));
        auth_clear_pin(ui); ui->editing = 0;
    } else if (target->action == ACTION_GAME_CANCEL || target->action == ACTION_GAME_RECONCILE) {
        if (ui->page != PAGE_GAME_STATUS || !ui->game_status || game_terminal(ui->game_status)) return 1;
        request = game_request(target->action == ACTION_GAME_CANCEL ? "game.exchange.cancel" : "game.exchange.reconcile", 1);
        if (request) {
            put_string(request, "connection_id", ui->game_connection);
            put_string(request, "exchange_id", ui->game_exchange);
        }
    }
    game_send(ui, request);
    return 1;
}

static int game_state_valid(json_object *state)
{
    json_object *binding = field(field(state, "quote"), "binding");
    const char *status = string(state, "state");
    int known = !strcmp(status, "QUEUED") || !strcmp(status, "CONFIRMING") || !strcmp(status, "REVIEW_REQUIRED") || game_terminal(state);
    return strict_string(state, "schema", "rock-game-exchange-state/1") && strict_bool(state, "simulation_only", 1) &&
           known && strlen(string(state, "connection_id")) == 36 && *string(state, "exchange_id") &&
           strlen(string(state, "exchange_id")) <= 128 &&
           strict_string(binding, "connection_id", string(state, "connection_id")) &&
           strict_string(binding, "exchange_id", string(state, "exchange_id")) &&
           strict_string(binding, "source_asset", "synthetic:usd") &&
           atm_integer(state, "held_minor", 0, 10000) && atm_integer(state, "committed_minor", 0, 10000) &&
           atm_integer(state, "released_minor", 0, 10000) &&
           (strcmp(status, "COMPLETED") || strict_string(field(state, "terminal_receipt"), "terminal_state", "APPLIED")) &&
           (strcmp(status, "REVERSED") || strict_string(field(state, "terminal_receipt"), "terminal_state", "REJECTED"));
}

static int game_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    const char *op = string(request, "op");
    int local_auth = !strcmp(op, "auth.game.connect") || !strcmp(op, "auth.game.exchange");
    if (strncmp(op, "game.", 5) && !local_auth) return 0;
    if (local_auth) {
        json_object_object_del(request, "pin");
        auth_clear_pin(ui);
        if (!response || !strict_bool(response, "ok", 1) || !ui->game_intent ||
            !json_object_equal(field(request, "intent"), ui->game_intent) || !field(response, "credential")) {
            snprintf(ui->game_error, sizeof(ui->game_error), "認証を確認できません。内容と期限を確かめ、PINを入力し直してください。");
            ui->editing = 4;
            return 1;
        }
        json_object *forward = game_request(ui->game_mode == 1 ? "game.connection.approve" : "game.exchange.approve", 0);
        put_string(forward, "key", ui->game_approval_key);
        if (ui->game_mode == 1) {
            json_object *binding = field(ui->game_intent, "binding");
            put_string(forward, "intent_id", string(binding, "intent_id"));
            put_string(forward, "challenge_id", string(ui->game_intent, "challenge_id"));
            put_string(forward, "binding_sha256", string(ui->game_intent, "binding_sha256"));
        } else {
            put_string(forward, "attempt_id", string(ui->game_intent, "attempt_id"));
            put_string(forward, "quote_sha256", string(ui->game_intent, "quote_sha256"));
        }
        json_object_object_add(forward, "credential", json_object_get(field(response, "credential")));
        auth_queue(ui, forward);
        return 1;
    }
    if (!response || !boolean(response, "ok")) {
        int uncertain = !response || strict_string(response, "code", "unavailable") || strict_string(response, "code", "response_limit");
        if (!game_read(op) && uncertain) game_replace(&ui->game_pending, request);
        else if (ui->game_pending && json_object_equal(ui->game_pending, request)) game_replace(&ui->game_pending, NULL);
        if (!strcmp(op, "game.sandbox.catalog")) game_replace(&ui->game_catalog, NULL);
        snprintf(ui->game_error, sizeof(ui->game_error), "%s", uncertain ?
                 "ゲーム接続の応答を確認できません。送信済みの交換は同じ要求で確認してください。" :
                 (*string(response, "error") ? string(response, "error") : "ゲーム操作は受け付けられませんでした。"));
        return 1;
    }
    json_object *result = field(response, "result");
    int valid = result && json_object_is_type(result, json_type_object);
    if (!strcmp(op, "game.sandbox.catalog")) {
        json_object *games = field(result, "games");
        valid = valid && strict_string(result, "schema", "rock-game-sandbox-catalog/1") && strict_bool(result, "simulation_only", 1) &&
                json_object_is_type(games, json_type_array) && array_size(games) <= 2;
        for (size_t i = 0; valid && i < array_size(games); i++) {
            json_object *entry = array_item(games, i);
            valid = strict_bool(entry, "simulation_only", 1) && *string(entry, "game_id") && strlen(string(entry, "game_id")) <= 128 &&
                    *string(entry, "game_name") && strlen(string(entry, "game_name")) <= 200 && strlen(string(entry, "player_id")) <= 128 &&
                    (strict_string(entry, "current_state", "ACTIVE") || strict_string(entry, "current_state", "NOT_CONNECTED") ||
                     strict_string(entry, "current_state", "AWAITING_OWNER_CONSENT") || strict_string(entry, "current_state", "REVOKED") ||
                     strict_string(entry, "current_state", "EXPIRED"));
            if (strict_string(entry, "current_state", "ACTIVE")) valid = valid && strlen(string(entry, "connection_id")) == 36;
            for (size_t j = 0; valid && j < i; j++)
                valid = strcmp(string(entry, "game_id"), string(array_item(games, j), "game_id")) != 0;
        }
        if (valid) game_replace(&ui->game_catalog, result);
    } else if (!strcmp(op, "game.sandbox.credit")) {
        valid = valid && strict_string(result, "schema", "rock-game-sandbox-credit/1") &&
                strict_bool(result, "simulation_only", 1) && strict_bool(result, "settled", 1) &&
                atm_integer(result, "amount_minor", 10000, 10000) && *string(result, "sale_id");
        if (valid) {
            if (ui->game_catalog) json_object_object_add(ui->game_catalog, "fixture_credit_applied", json_object_new_boolean(1));
            navigate(ui, PAGE_WALLET);
        }
    } else if (!strcmp(op, "game.exchange.list")) {
        json_object *rows = field(result, "items");
        valid = valid && strict_string(result, "schema", "rock-game-exchange-list/1") && strict_bool(result, "simulation_only", 1) &&
                json_object_is_type(rows, json_type_array) && array_size(rows) <= 10;
        for (size_t i = 0; valid && i < array_size(rows); i++) valid = game_state_valid(array_item(rows, i));
        if (valid) game_replace(&ui->game_history, result);
    } else if (!strcmp(op, "game.sandbox.connection.begin")) {
        json_object *binding = field(result, "binding");
        valid = valid && strict_string(result, "schema", "rock-game-connection-intent/1") &&
                strict_bool(result, "simulation_only", 1) && strict_string(result, "environment", "synthetic") &&
                strict_string(binding, "game_id", string(request, "game_id")) &&
                strlen(string(binding, "connection_id")) == 36 && strlen(string(binding, "intent_id")) == 36 &&
                strlen(string(result, "binding_sha256")) == 64 && *string(result, "challenge_id") &&
                strict_string(field(result, "options"), "purpose", "wallet.game.connect");
        if (valid) {
            snprintf(ui->game_id, sizeof(ui->game_id), "%s", string(binding, "game_id"));
            snprintf(ui->game_connection, sizeof(ui->game_connection), "%s", string(binding, "connection_id"));
            game_replace(&ui->game_intent, result); ui->game_mode = 1;
            auth_clear_pin(ui); navigate(ui, PAGE_GAME_PIN); ui->editing = 4;
        }
    } else if (!strcmp(op, "game.exchange.quote")) {
        valid = valid && game_quote_valid(ui, result);
        if (valid) { game_replace(&ui->game_quote, result); navigate(ui, PAGE_GAME_QUOTE); }
    } else if (!strcmp(op, "game.exchange.approval.begin")) {
        valid = valid && strict_string(result, "schema", "rock-game-exchange-approval-intent/1") &&
                strict_bool(result, "simulation_only", 1) &&
                strlen(string(result, "attempt_id")) == 36 && strlen(string(result, "quote_sha256")) == 64 &&
                json_object_equal(field(result, "quote"), ui->game_quote) &&
                strict_string(field(result, "options"), "purpose", "wallet.game.exchange") &&
                json_object_get_double(field(result, "expires_at")) <= json_object_get_double(field(field(ui->game_quote, "binding"), "expires_at"));
        if (valid) {
            game_replace(&ui->game_intent, result); ui->game_mode = 2;
            auth_clear_pin(ui); navigate(ui, PAGE_GAME_PIN); ui->editing = 4;
        }
    } else if (!strcmp(op, "game.connection.approve")) {
        valid = valid && strict_string(result, "schema", "rock-game-owner-consent/1") &&
                strict_bool(result, "simulation_only", 1) && strict_string(result, "decision", "APPROVED") &&
                strict_string(result, "binding_sha256", string(request, "binding_sha256")) &&
                strict_string(result, "challenge_id", string(request, "challenge_id")) &&
                json_object_equal(field(result, "binding"), field(ui->game_intent, "binding")) &&
                strict_string(field(result, "binding"), "intent_id", string(request, "intent_id"));
        if (valid) { auth_clear_pin(ui); navigate(ui, PAGE_GAME); ui->game_poll = 0; }
    } else if (!strcmp(op, "game.exchange.approve")) {
        valid = valid && strict_string(result, "schema", "rock-game-exchange-approval-receipt/1") &&
                strict_bool(result, "simulation_only", 1) && strict_string(result, "attempt_id", string(request, "attempt_id")) &&
                strict_string(result, "quote_sha256", string(request, "quote_sha256")) &&
                (!strcmp(string(result, "decision"), "APPROVED") || !strcmp(string(result, "decision"), "DENIED"));
        if (valid) {
            auth_clear_pin(ui); game_replace(&ui->game_status, NULL);
            if (strict_string(result, "decision", "DENIED")) {
                snprintf(ui->game_error, sizeof(ui->game_error), "今回の交換は承認されませんでした: %.140s", string(result, "reason"));
                navigate(ui, PAGE_GAME);
            } else navigate(ui, PAGE_GAME_STATUS);
        }
    } else if (!strcmp(op, "game.exchange.status") || !strcmp(op, "game.exchange.cancel") || !strcmp(op, "game.exchange.reconcile")) {
        valid = valid && game_state_valid(result) && strict_string(result, "connection_id", string(request, "connection_id")) &&
                strict_string(result, "exchange_id", string(request, "exchange_id"));
        if (valid) game_replace(&ui->game_status, result);
    } else valid = 0;
    if (!valid) {
        if (!strcmp(op, "game.sandbox.catalog")) game_replace(&ui->game_catalog, NULL);
        if (!strcmp(op, "game.exchange.list")) game_replace(&ui->game_history, NULL);
        snprintf(ui->game_error, sizeof(ui->game_error), "ゲームの応答が表示中の条件と一致しません。同じ要求を確認してください。");
        if (!game_read(op)) game_replace(&ui->game_pending, request);
        return 1;
    }
    if (ui->game_pending && json_object_equal(ui->game_pending, request)) game_replace(&ui->game_pending, NULL);
    if (strcmp(op, "game.exchange.approve") || !strict_string(result, "decision", "DENIED")) ui->game_error[0] = '\0';
    return 1;
}
