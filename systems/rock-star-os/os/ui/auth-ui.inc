/* Native software-test authentication. PIN exists only during explicit entry
 * and the isolated UID1004 request; Wallet receives the credential JSON only. */
static void auth_clear_pin(struct rock_ui *ui)
{
    volatile char *pin = ui->auth_pin;
    for (size_t i = 0; i < sizeof(ui->auth_pin); i++) pin[i] = 0;
}

static json_object *auth_state(struct rock_ui *ui)
{
    json_object *current = field(field(ui->snapshot, "wallet"), "auth");
    return ui->wallet_auth ? ui->wallet_auth : current;
}

static int auth_required(struct rock_ui *ui)
{
    return auth_state(ui) != NULL;
}

static int auth_active(struct rock_ui *ui)
{
    return strict_bool(auth_state(ui), "active", 1) && strict_string(auth_state(ui), "activation_state", "ACTIVE");
}

static int auth_status_valid(json_object *state)
{
    const char *stage = string(state, "activation_state");
    return strict_bool(state, "simulation_only", 1) && strict_bool(state, "hardware_backed", 0) &&
           strict_string(state, "authenticator_kind", "PUBLIC_SOFTWARE_TEST_AUTHENTICATOR") &&
           field(state, "active") && json_object_is_type(field(state, "active"), json_type_boolean) &&
           (!strcmp(stage, "CREDENTIAL_REQUIRED") || !strcmp(stage, "TERMS_REQUIRED") || !strcmp(stage, "ACTIVE"));
}

static int auth_key(json_object *request, const char *field_name)
{
    char key[40];
    if (rock_request_key(key, sizeof(key)) < 0) return 0;
    put_string(request, field_name, key);
    return 1;
}

static void auth_queue(struct rock_ui *ui, json_object *request)
{
    /* collect() still owns the worker until response handling returns. */
    if (ui->queued_request) {
        json_object_put(request);
        snprintf(ui->message, sizeof(ui->message), "前の要求が残っています。状態を確認してください。");
        ui->message_error = 1;
        return;
    }
    ui->queued_request = request;
}

static int auth_options_valid(json_object *options, int create)
{
    json_object *public_key = field(options, "publicKey");
    const char *device = string(options, "device_ref"), *challenge = string(public_key, "challenge");
    if (!strict_string(options, "purpose", create ? "wallet.enroll" : "wallet.atm.issue") ||
        strncmp(device, "fixture-", 8) || strlen(device) > 160 || strlen(challenge) != 43 ||
        !field(options, "schema_version") || !json_object_is_type(field(options, "schema_version"), json_type_int) ||
        json_object_get_int(field(options, "schema_version")) != 1 ||
        strlen(json_object_to_json_string_ext(options, JSON_C_TO_STRING_PLAIN)) > 12000) return 0;
    for (const char *p = challenge; *p; p++)
        if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9') || *p == '-' || *p == '_')) return 0;
    return create ? strict_string(field(public_key, "rp"), "id", "wallet.rock-star-os.test") :
                    strict_string(public_key, "rpId", "wallet.rock-star-os.test");
}

static int auth_quote_valid(struct rock_ui *ui, json_object *request, json_object *result)
{
    (void)ui;
    json_object *quote = field(result, "quote");
    const char *id = string(result, "quote_id");
    if (!*id || strlen(id) > 160 || !strict_bool(result, "simulation_only", 1) ||
        !auth_options_valid(field(result, "options"), 0) ||
        !strict_string(quote, "quote_id", id) || !strict_string(quote, "policy", "simulator-zero-fee-v1") ||
        !*string(quote, "authority_id") || !*string(quote, "account_id") || !*string(quote, "credential_id") ||
        !strict_string(quote, "issue_key", string(request, "issue_key")) ||
        !strict_string(quote, "currency", "USD") || !strict_string(quote, "atm_id", string(request, "atm_id")) ||
        !strict_string(quote, "device_ref", string(field(result, "options"), "device_ref")) ||
        !atm_integer(quote, "amount_minor", 1000, 50000) || !atm_integer(quote, "fee_minor", 0, 0) ||
        !atm_integer(quote, "total_debit_minor", 1000, 50000) || !atm_integer(quote, "cash_received_minor", 1000, 50000) ||
        json_object_get_int64(field(quote, "amount_minor")) != json_object_get_int64(field(request, "amount_minor")) ||
        json_object_get_int64(field(quote, "total_debit_minor")) != json_object_get_int64(field(quote, "amount_minor")) ||
        json_object_get_int64(field(quote, "cash_received_minor")) != json_object_get_int64(field(quote, "amount_minor"))) return 0;
    double expires = json_object_get_double(field(result, "expires_at"));
    return isfinite(expires) && expires > 0 && expires < 253402300799.0 &&
           expires == json_object_get_double(field(quote, "expires_at"));
}

static double auth_expires(struct rock_ui *ui)
{
    return json_object_get_double(field(ui->auth_mode == 1 ? ui->auth_challenge : ui->atm_quote, "expires_at"));
}

static void auth_reset(struct rock_ui *ui)
{
    auth_clear_pin(ui);
    if (ui->auth_challenge) json_object_put(ui->auth_challenge);
    ui->auth_challenge = NULL;
    if (ui->atm_quote) json_object_put(ui->atm_quote);
    ui->atm_quote = NULL;
    ui->auth_mode = 0;
    ui->auth_local_key[0] = ui->auth_wallet_key[0] = '\0';
}

static double draw_auth_card(struct rock_ui *ui, double y)
{
    json_object *state = auth_state(ui);
    if (!state) return y;
    panel(ui, 32, y, 656, 225, COLOR_WHITE);
    text(ui, 56, y + 35, 22, 1, COLOR_INK, "Walletの利用準備", 602);
    wrapped(ui, 56, y + 56, 603, 16, 27, COLOR_MUTED,
            "ソフトウェア試験認証器を使用します。\n実機のパスキー・生体認証ではありません。", 2);
    int enrolled = *string(state, "credential_id") && !boolean(state, "credential_revoked");
    const char *label = !enrolled ? "試験認証器を登録する…" : !auth_active(ui) ?
                        "Wallet利用条件を確認する…" : "試験認証器とWallet利用条件を確認済み";
    button(ui, 56, y + 139, 608, 54, label, enrolled ? ACTION_WALLET_TERMS : ACTION_AUTH_BEGIN,
           0, NULL, NULL, can_mutate(ui) && !auth_active(ui) && atm_registered(ui), 1);
    return y + 245;
}

static void draw_auth_pin(struct rock_ui *ui)
{
    ui->hit_count = 0;
    panel(ui, 0, 0, 720, 960, COLOR_BG);
    text(ui, 34, 52, 24, 1, COLOR_INK, ui->auth_mode == 1 ? "試験認証器の登録" : "ATMの予約内容を確認", 650);
    wrapped(ui, 35, 76, 648, 17, 29, COLOR_ERROR,
            "ソフトウェア認証の開発試験です。\n実機のパスキー・生体認証ではありません。", 2);
    double y = 154;
    if (ui->auth_mode == 2 && ui->atm_quote) {
        json_object *quote = field(ui->atm_quote, "quote");
        const char *labels[] = {"予約額", "手数料", "残高から保留する合計", "受取り予定のテスト現金"};
        const char *names[] = {"amount_minor", "fee_minor", "total_debit_minor", "cash_received_minor"};
        for (int i = 0; i < 4; i++) {
            char value[80]; money(value, sizeof(value), quote, names[i]);
            text(ui, 40, y + 24, 17, 0, COLOR_MUTED, labels[i], 360);
            text(ui, 408, y + 24, 19, 1, COLOR_INK, value, 275); y += 45;
        }
        text(ui, 40, y + 24, 18, 1, COLOR_INK, string(quote, "atm_id"), 640); y += 45;
        text(ui, 40, y + 23, 16, 0, COLOR_MUTED, "署名送信後の保留状態は、応答を照合して確認します。", 642); y += 42;
    } else {
        wrapped(ui, 38, y, 642, 19, 31, COLOR_INK,
                "この端末の試験認証器をWalletへ登録します。\n登録だけではWallet利用条件や月額料金に同意しません。", 3);
        y += 150;
    }
    double remaining = auth_expires(ui) - (double)time(NULL);
    char time_left[120];
    snprintf(time_left, sizeof(time_left), remaining > 0 ? "確認の残り時間: %.0f秒" : "確認の期限が切れました。戻って内容を取得し直してください。", fmax(0, remaining));
    text(ui, 40, y + 23, 17, 0, remaining > 0 ? COLOR_MUTED : COLOR_ERROR, time_left, 640); y += 47;
    text(ui, 40, y + 24, 18, 1, COLOR_INK, "試験PINを入力（公開テスト値: 0000）", 640); y += 38;
    panel(ui, 38, y, 644, 60, COLOR_WHITE);
    char masked[5] = "";
    for (size_t i = 0; i < strlen(ui->auth_pin); i++) masked[i] = '*';
    text(ui, 57, y + 40, 28, 1, COLOR_INK, *masked ? masked : "PIN", 600);
    hit(ui, 38, y, 644, 60, ACTION_AUTH_PIN, 0, NULL, NULL, !ui->busy && !ui->retry_request);
    y += 83;
    if (*ui->message) y += wrapped(ui, 40, y, 640, 16, 26, ui->message_error ? COLOR_ERROR : COLOR_MUTED, ui->message, 2) + 15;
    if (ui->retry_request) {
        button(ui, 38, 811, 644, 54, "送信済みの同じ要求を照合する", ACTION_RETRY, 0, NULL, NULL, !ui->busy, 1);
        text(ui, 40, 900, 16, 0, COLOR_MUTED, "結果が不明なため、新しい予約や取消へ進みません。", 640);
    } else {
        button(ui, 38, 811, 304, 54, "戻る・予約しない", ACTION_AUTH_BACK, 0, NULL, NULL, !ui->busy && !ui->queued_request, 0);
        button(ui, 358, 811, 324, 54, ui->busy ? "処理中…" : ui->auth_mode == 1 ? "PINを確認して登録" : "認証して予約する",
               ACTION_AUTH_SIGN, 0, NULL, NULL, can_mutate(ui) && !ui->busy && remaining > 0 && strlen(ui->auth_pin) == 4, 1);
    }
    ui->content_height = 0;
}

static int auth_activate(struct rock_ui *ui, const struct rock_hit *target)
{
    if (target->action == ACTION_AUTH_PIN) { ui->editing = 4; return 1; }
    if (target->action == ACTION_AUTH_BACK) {
        if (ui->busy || ui->queued_request || ui->retry_request) return 1;
        int mode = ui->auth_mode;
        json_object *cancel = NULL;
        if (ui->atm_quote) {
            cancel = request_new("wallet.atm.quote.cancel");
            put_string(cancel, "quote_id", string(ui->atm_quote, "quote_id"));
            if (!auth_key(cancel, "key")) { json_object_put(cancel); return 1; }
        }
        auth_reset(ui);
        navigate(ui, mode == 2 ? PAGE_ATM : PAGE_WALLET);
        if (cancel) { send_request(ui, cancel); json_object_put(cancel); }
        return 1;
    }
    if (target->action == ACTION_WALLET_TERMS) {
        if (!can_mutate(ui)) return 1;
        json_object *request = request_new("wallet.terms");
        put_string(request, "terms_version", "rock-wallet-development/1");
        json_object_object_add(request, "accepted", json_object_new_boolean(1));
        if (!auth_key(request, "key")) { json_object_put(request); return 1; }
        if (ui->confirm_request) json_object_put(ui->confirm_request);
        ui->confirm_request = request;
        snprintf(ui->confirm_title, sizeof(ui->confirm_title), "Wallet試験の利用条件");
        ui->focus = -1; ui->editing = 0;
        return 1;
    }
    if (target->action == ACTION_AUTH_BEGIN) {
        if (!can_mutate(ui) || !atm_registered(ui)) return 1;
        json_object *request = request_new("wallet.auth.begin");
        if (auth_key(request, "key")) send_request(ui, request);
        json_object_put(request);
        return 1;
    }
    if (target->action != ACTION_AUTH_SIGN) return 0;
    if (!can_mutate(ui) || ui->busy || strlen(ui->auth_pin) != 4 || auth_expires(ui) <= (double)time(NULL)) return 1;
    json_object *source = ui->auth_mode == 1 ? ui->auth_challenge : ui->atm_quote;
    if (!source) return 1;
    json_object *request = request_new(ui->auth_mode == 1 ? "auth.create" : "auth.get");
    if (!*ui->auth_local_key && rock_request_key(ui->auth_local_key, sizeof(ui->auth_local_key)) < 0) { json_object_put(request); return 1; }
    put_string(request, "key", ui->auth_local_key);
    json_object_object_add(request, "options", json_object_get(field(source, "options")));
    put_string(request, "pin", ui->auth_pin);
    auth_clear_pin(ui); ui->editing = 0;
    send_request(ui, request);
    json_object_put(request);
    return 1;
}

static int auth_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    const char *op = string(request, "op");
    int local = rock_auth_operation(op);
    if (local) {
        json_object_object_del(request, "pin");
        auth_clear_pin(ui);
        if (!response || !strict_bool(response, "ok", 1)) {
            snprintf(ui->message, sizeof(ui->message), "試験認証器が応答しないか、PINを拒否しました。同じ確認内容でPINを入力し直してください。");
            ui->message_error = 1;
            return 1;
        }
        json_object *credential = field(response, "credential"), *metadata = field(response, "metadata");
        if (!strict_bool(metadata, "simulation_only", 1) || !strict_bool(metadata, "hardware_backed", 0) ||
            !strict_string(metadata, "authenticator", "public-software-test") ||
            !strict_string(credential, "type", "public-key") || !*string(credential, "id") ||
            !field(credential, "response") || strlen(json_object_to_json_string_ext(credential, JSON_C_TO_STRING_PLAIN)) > 16000) {
            snprintf(ui->message, sizeof(ui->message), "試験認証器の応答を確認できません。Walletへは送信していません。");
            ui->message_error = 1;
            return 1;
        }
        int create = !strcmp(op, "auth.create");
        json_object *source = create ? ui->auth_challenge : ui->atm_quote;
        if (!source || ui->auth_mode != (create ? 1 : 2) ||
            strcmp(string(request, "key"), ui->auth_local_key) ||
            !json_object_equal(field(request, "options"), field(source, "options"))) return 1;
        json_object *next = request_new(create ? "wallet.auth.enroll" : "wallet.atm.issue");
        put_string(next, "key", create ? ui->auth_wallet_key : string(field(source, "quote"), "issue_key"));
        put_string(next, create ? "challenge_id" : "quote_id", string(source, create ? "challenge_id" : "quote_id"));
        json_object_object_add(next, "credential", json_object_get(credential));
        auth_queue(ui, next);
        return 1;
    }
    if (strcmp(op, "wallet.auth.begin") && strcmp(op, "wallet.auth.enroll") && strcmp(op, "wallet.auth.status") &&
        strcmp(op, "wallet.terms") && strcmp(op, "wallet.atm.quote") && strcmp(op, "wallet.atm.quote.cancel")) return 0;
    if (!response || !boolean(response, "ok")) return 0;
    json_object *result = field(response, "result");
    int valid = strict_bool(result, "simulation_only", 1);
    if (!strcmp(op, "wallet.auth.status")) valid = auth_status_valid(result);
    else if (!strcmp(op, "wallet.auth.begin")) {
        double expires = json_object_get_double(field(result, "expires_at"));
        valid = valid && *string(result, "challenge_id") && strlen(string(result, "challenge_id")) <= 160 &&
                isfinite(expires) && expires > 0 && expires < 253402300799.0 && auth_options_valid(field(result, "options"), 1);
    } else if (!strcmp(op, "wallet.auth.enroll"))
        valid = auth_status_valid(result) && strict_string(result, "receipt_kind", "immutable_enrollment") &&
                strict_string(result, "challenge_id", string(request, "challenge_id")) &&
                strict_string(result, "credential_id", string(field(request, "credential"), "id"));
    else if (!strcmp(op, "wallet.terms"))
        valid = auth_status_valid(result) && strict_string(result, "receipt_kind", "immutable_wallet_terms") &&
                *string(result, "terms_receipt_id") && strict_string(result, "wallet_terms_version", string(request, "terms_version")) &&
                strict_bool(result, "wallet_terms_accepted", boolean(request, "accepted"));
    else if (!strcmp(op, "wallet.atm.quote")) valid = auth_quote_valid(ui, request, result);
    else if (!strcmp(op, "wallet.atm.quote.cancel"))
        valid = valid && strict_string(result, "quote_id", string(request, "quote_id")) &&
                strict_string(result, "state", "CANCELED") && strict_bool(result, "funds_reserved", 0);
    if (!valid) {
        rock_ui_response(ui, request, NULL, "認証・予約の応答が不完全です。同じ要求で照合してください。");
        return 1;
    }
    if (!rock_ui_request_is_read(request) && ui->retry_request && !is_retry(ui, request)) return 1;
    if (is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    ui->message_error = 0;
    if (!strcmp(op, "wallet.auth.status")) {
        if (ui->wallet_auth) json_object_put(ui->wallet_auth);
        ui->wallet_auth = json_object_get(result);
    } else if (!strcmp(op, "wallet.auth.begin") || !strcmp(op, "wallet.atm.quote")) {
        auth_reset(ui);
        ui->auth_mode = !strcmp(op, "wallet.auth.begin") ? 1 : 2;
        if (ui->auth_mode == 1) ui->auth_challenge = json_object_get(result);
        else ui->atm_quote = json_object_get(result);
        if (rock_request_key(ui->auth_wallet_key, sizeof(ui->auth_wallet_key)) < 0) {
            auth_reset(ui); return 1;
        }
        navigate(ui, PAGE_AUTH_PIN); ui->editing = 4;
    } else if (!strcmp(op, "wallet.auth.enroll")) {
        auth_reset(ui);
        if (ui->wallet_auth) json_object_put(ui->wallet_auth);
        ui->wallet_auth = json_object_get(result);
        navigate(ui, PAGE_WALLET);
        snprintf(ui->message, sizeof(ui->message), "試験認証器を登録しました。Wallet利用条件と月額同意は別の操作です。");
    } else if (!strcmp(op, "wallet.terms")) {
        if (ui->wallet_auth) json_object_put(ui->wallet_auth);
        ui->wallet_auth = json_object_get(result);
        snprintf(ui->message, sizeof(ui->message), "Wallet利用条件への同意を記録しました。月額料金にはまだ同意していません。");
    }
    return 1;
}
