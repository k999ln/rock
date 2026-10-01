/* Native remote pages share ui.c's bounded Cairo primitives and local IPC.
 * No network transport, fixture values, or execution implementation lives here. */
static int strict_string(json_object *object, const char *name, const char *expected)
{
    json_object *item = field(object, name);
    return item && json_object_is_type(item, json_type_string) &&
           (size_t)json_object_get_string_len(item) == strlen(expected) && !strcmp(json_object_get_string(item), expected);
}

static int strict_bool(json_object *object, const char *name, int expected)
{
    json_object *item = field(object, name);
    return item && json_object_is_type(item, json_type_boolean) && json_object_get_boolean(item) == expected;
}

static int sha256_text(const char *value)
{
    if (strlen(value) != 64) return 0;
    for (size_t i = 0; i < 64; i++)
        if (!((value[i] >= '0' && value[i] <= '9') || (value[i] >= 'a' && value[i] <= 'f'))) return 0;
    return 1;
}

static json_object *remote_destination(struct rock_ui *ui, const char *target)
{
    json_object *items = field(field(ui->snapshot, "remote"), "destinations");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        if (strict_string(item, "target", target)) return item;
    }
    return NULL;
}

static int remote_allowed(struct rock_ui *ui, const char *target)
{
    json_object *item = installed(ui, ui->selected_id), *manifest = field(item, "manifest");
    json_object *schema = field(manifest, "schema_version"), *destination = remote_destination(ui, target);
    return (!strcmp(target, "cloud") || !strcmp(target, "pc_usb")) && boolean(item, "enabled") &&
           schema && json_object_is_type(schema, json_type_int) &&
           (json_object_get_int(schema) == 3 || json_object_get_int(schema) == 4) && tool_compatible(item) &&
           manifest_target(manifest, target) && strict_bool(destination, "available", 1) &&
           *string(destination, "endpoint_id") && strict_string(destination, "transport_evidence", "pinned_tls_loopback_fixture") &&
           strict_string(destination, "physical_usb", "NOT_RUN");
}

static int remote_preview_current(struct rock_ui *ui)
{
    json_object *preview = ui->remote_prepared, *item = installed(ui, ui->selected_id);
    return preview && strict_string(preview, "id", ui->selected_id) &&
           strict_string(preview, "version", string(item, "version")) &&
           strict_string(preview, "package_hash", string(item, "hash")) && !strcmp(ui->remote_text, ui->text) &&
           remote_allowed(ui, string(preview, "target")) &&
           strict_string(preview, "endpoint_id", string(remote_destination(ui, string(preview, "target")), "endpoint_id"));
}

static void remote_clear_prepared(struct rock_ui *ui)
{
    if (ui->remote_prepared) json_object_put(ui->remote_prepared);
    ui->remote_prepared = NULL;
    ui->remote_text[0] = '\0';
}

static void remote_read_status(struct rock_ui *ui)
{
    if (!*ui->remote_key) return;
    json_object *request = request_new("remote.status");
    put_string(request, "key", ui->remote_key);
    send_request(ui, request);
    json_object_put(request);
}

static const char *remote_state_label(const char *state)
{
    static const struct { const char *state, *label; } names[] = {
        {"prepared", "未送信の準備"}, {"queued", "端末で送信待ち"}, {"sending", "送信を開始"},
        {"unknown", "遠隔の状態を照合中"}, {"accepted", "遠隔で受付済み"}, {"running", "遠隔で実行中"},
        {"succeeded", "遠隔で完了"}, {"failed", "実行失敗"}, {"cancelled", "中止"},
        {"indeterminate", "結果を確定できません"}, {"rejected", "受付拒否"}
    };
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if (!strcmp(state, names[i].state)) return names[i].label;
    return "状態未取得";
}

static int remote_terminal(const char *state)
{
    return !strcmp(state, "succeeded") || !strcmp(state, "failed") || !strcmp(state, "cancelled") ||
           !strcmp(state, "indeterminate") || !strcmp(state, "rejected");
}

static int remote_completion_proven(json_object *status, const char *key)
{
    json_object *remote = field(status, "remote"), *output = field(remote, "output"), *execution = field(remote, "execution");
    json_object *receipt = field(remote, "receipt");
    return strict_string(status, "state", "succeeded") && strict_bool(status, "send_claimed", 1) && strict_bool(remote, "found", 1) &&
           strict_string(remote, "state", "succeeded") && strict_string(receipt, "key", key) &&
           strict_bool(receipt, "accepted", 1) && sha256_text(string(receipt, "request_sha256")) &&
           *string(status, "endpoint_id") && strict_string(receipt, "endpoint_id", string(status, "endpoint_id")) &&
           strict_string(receipt, "actual_target", string(status, "target")) &&
           strict_string(receipt, "transport_evidence", "pinned_tls_loopback_fixture") && strict_string(receipt, "physical_usb", "NOT_RUN") &&
           output && json_object_is_type(output, json_type_string) && json_object_get_string_len(output) <= 131072 &&
           strict_string(execution, "kind", "actual_linux_isolated_process") &&
           strict_bool(execution, "socket_syscall_denied", 1) && strict_bool(execution, "wallet_path_visible", 0);
}

static double remote_text_panel(struct rock_ui *ui, double y, const char *value, const char *empty)
{
    char shown[16385];
    size_t length = strlen(value), count = length < sizeof(shown) - 1 ? length : sizeof(shown) - 1;
    while (count > 0 && ((unsigned char)value[count] & 0xc0) == 0x80) count--;
    memcpy(shown, value, count);
    shown[count] = '\0';
    cairo_save(ui->cr);
    cairo_push_group(ui->cr);
    double height = wrapped(ui, 54, y + 19, 612, 19, 30, COLOR_INK, *shown ? shown : empty, 240);
    cairo_pattern_t *content = cairo_pop_group(ui->cr);
    panel(ui, 32, y, 656, fmax(94, height + 44), COLOR_WHITE);
    cairo_set_source(ui->cr, content);
    cairo_paint(ui->cr);
    cairo_pattern_destroy(content);
    cairo_restore(ui->cr);
    y += fmax(94, height + 44) + 20;
    if (length > count || height >= 240 * 30) {
        y += wrapped(ui, 36, y, 647, 16, 26, COLOR_MUTED,
                     "表示は先頭16 KiB・240行までです。送信する場合は選んだ入力全体が対象です。", 3) + 20;
    }
    return y;
}

static void draw_remote(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    json_object *remote = field(ui->snapshot, "remote"), *preview = ui->remote_prepared;
    button(ui, 32, y, 176, 42, "‹ 入力へ戻る", ACTION_NAV, PAGE_EDITOR, NULL, NULL, 1, 0);
    y += 65;
    if (!preview) {
        text(ui, 34, y + 26, 25, 1, COLOR_INK, "入力の送信先を選ぶ", 647);
        y += 49;
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
                     "次の画面で入力と送信先を確認します。\nここで選ぶだけでは、外部へ入力を送りません。", 3) + 27;
        y = draw_purchaser_service(ui, y, "cloud");
        if (!remote || !boolean(remote, "configured")) {
            y += wrapped(ui, 35, y, 648, 19, 31, COLOR_ERROR,
                         "遠隔実行の接続設定がありません。接続先を自動で切り替えることはありません。", 3) + 24;
        }
        const char *targets[] = {"cloud", "pc_usb"};
        for (int i = 0; i < 2; i++) {
            json_object *destination = remote_destination(ui, targets[i]);
            int available = remote_allowed(ui, targets[i]);
            panel(ui, 32, y, 656, 175, COLOR_WHITE);
            text(ui, 54, y + 35, 23, 1, COLOR_INK, i ? "PC / USB" : "所有VM · TLS開発接続", 600);
            text(ui, 54, y + 70, 16, 0, COLOR_MUTED,
                 i ? "物理USB接続は未検証です" : "本番のクラウドサービスは未接続です", 600);
            text(ui, 54, y + 100, 15, 0, COLOR_MUTED, *string(destination, "endpoint_id") ?
                 string(destination, "endpoint_id") : "利用できる接続先がありません", 590);
            button(ui, 50, y + 118, 620, 43, available ? "この送信先で内容を確認" : "利用できません",
                   ACTION_REMOTE_PREPARE, i, NULL, NULL, available && can_mutate(ui), 0);
            y += 194;
        }
    } else {
        int current = remote_preview_current(ui);
        char detail[300];
        text(ui, 34, y + 27, 26, 1, COLOR_INK, "まだ送信していません", 650);
        y += 48;
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
                     "以下の入力全体と署名済みツールを、表示された接続先へ送ります。送信には別の同意操作が必要です。", 4) + 25;
        snprintf(detail, sizeof(detail), "%s · v%s", string(preview, "id"), string(preview, "version"));
        text(ui, 35, y + 21, 17, 1, COLOR_INK, detail, 650); y += 36;
        snprintf(detail, sizeof(detail), "送信先: %s / %s", string(preview, "target"), string(preview, "endpoint_id"));
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_INK, detail, 3) + 12;
        text(ui, 35, y + 20, 15, 0, COLOR_MUTED, "TLSで保護された開発試験の接続", 648); y += 34;
        y += wrapped(ui, 35, y, 648, 16, 27, COLOR_MUTED,
                     "今回の実行追加料金は0 USDです。ツール本体と月額の利用条件は別に確認してください。実資金は動きません。", 3) + 19;
        y = draw_purchaser_service(ui, y, string(preview, "target"));
        text(ui, 35, y + 18, 15, 1, COLOR_MUTED, "署名済みパッケージ SHA-256", 647); y += 30;
        y += wrapped(ui, 35, y, 648, 14, 24, COLOR_MUTED, string(preview, "package_hash"), 3) + 18;
        snprintf(detail, sizeof(detail), "送信する入力全体: %zu bytes", strlen(ui->remote_text));
        text(ui, 35, y + 21, 18, 1, COLOR_INK, detail, 647); y += 40;
        y = remote_text_panel(ui, y, ui->remote_text, "入力は空です（0 bytes）。");
        if (!current)
            y += wrapped(ui, 35, y, 648, 18, 29, COLOR_ERROR,
                         "入力・ツール・接続先の状態が変わりました。新しい内容で確認し直してください。", 3) + 22;
        button(ui, 32, y, 656, 60, "この内容の送信に同意して実行", ACTION_REMOTE_SUBMIT, 0, NULL, NULL,
               current && purchaser_submit_allowed(ui, string(preview, "target")) &&
               can_mutate(ui) && y >= ui->content_top && y + 60 <= 856, 1);
        y += 80;
        button(ui, 32, y, 656, 52, "送信せず、この準備を破棄", ACTION_REMOTE_CANCEL, 0, NULL, NULL,
               can_mutate(ui) && y >= ui->content_top && y + 52 <= 856, 0);
        y += 72;
        if (!current) {
            button(ui, 32, y, 656, 52, "入力へ戻って確認し直す", ACTION_REMOTE_NEW, 0, NULL, NULL, !ui->busy, 0);
            y += 72;
        }
    }
    if (*string(remote, "worker_error"))
        y += wrapped(ui, 35, y, 648, 17, 28, COLOR_ERROR, string(remote, "worker_error"), 5) + 20;
    button(ui, 32, y + 7, 656, 52, "別の場所での実行履歴", ACTION_REMOTE_HISTORY, 0, NULL, NULL, 1, 0);
    ui->content_height = y + 82 + ui->scroll - ui->content_top;
}

static void draw_remote_history(struct rock_ui *ui)
{
    json_object *remote = field(ui->snapshot, "remote"), *items = field(remote, "history");
    double y = ui->content_top - ui->scroll;
    button(ui, 32, y, 190, 42, "‹ 端末の実行履歴", ACTION_NAV, PAGE_HISTORY, NULL, NULL, 1, 0); y += 66;
    y += wrapped(ui, 35, y, 648, 17, 28, COLOR_MUTED,
                 "遠隔実行だけの記録です。端末での実行やWalletの売上にはなりません。", 3) + 21;
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        panel(ui, 32, y, 656, 137, COLOR_WHITE);
        text(ui, 53, y + 32, 19, 1, COLOR_INK, tool_name(ui, string(item, "id")), 600);
        text(ui, 53, y + 66, 18, 1, COLOR_ACCENT, remote_state_label(string(item, "state")), 600);
        text(ui, 53, y + 99, 16, 0, COLOR_MUTED, string(item, "endpoint_id"), 575);
        text(ui, 645, y + 107, 26, 0, COLOR_MUTED, "›", 21);
        hit(ui, 32, y, 656, 137, ACTION_REMOTE_RESULT, 0, string(item, "key"), NULL, 1);
        y += 156;
    }
    if (!array_size(items)) {
        empty_state(ui, y, "遠隔実行の記録はありません", "送信前の準備も、実行結果も、サービスから取得します。");
        y += 251;
    }
    if (boolean(remote, "history_truncated"))
        y += wrapped(ui, 35, y, 648, 16, 27, COLOR_MUTED,
                     "この画面では履歴の一部を表示しています。表示の省略は削除を意味しません。", 3) + 20;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static void draw_remote_result(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    json_object *status = ui->remote_status, *remote = field(status, "remote");
    const char *state = string(status, "state");
    button(ui, 32, y, 210, 42, "‹ 遠隔の実行履歴", ACTION_REMOTE_HISTORY, 0, NULL, NULL, 1, 0); y += 68;
    if (!status || !strict_string(status, "key", ui->remote_key)) {
        empty_state(ui, y, "遠隔の状態を取得しています", "端末での受付だけでは、遠隔での実行完了にはなりません。");
        ui->content_height = y + 266 + ui->scroll - ui->content_top;
        return;
    }
    text(ui, 34, y + 25, 24, 1, COLOR_INK, tool_name(ui, string(status, "id")), 648); y += 49;
    text(ui, 35, y + 25, 24, 1, COLOR_ACCENT,
         !strcmp(state, "succeeded") && !remote_completion_proven(status, ui->remote_key) ? "完了結果の再確認が必要" : remote_state_label(state), 646); y += 46;
    y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED, string(status, "endpoint_id"), 3) + 18;
    y += wrapped(ui, 35, y, 648, 16, 27, COLOR_MUTED,
                 "所有VMのTLS開発試験です。本番クラウド・物理USBは未検証。Walletの売上は発生しません。", 3) + 24;
    if (!strcmp(state, "prepared"))
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_INK,
                     "まだ送信されていません。ここでは送信を承認できません。入力画面から内容を確認してください。", 3) + 23;
    else if (!boolean(status, "send_claimed"))
        y += wrapped(ui, 35, y, 648, 17, 28, COLOR_MUTED,
                     "送信開始の記録はありません。受付は実行完了を意味しません。", 3) + 20;
    if (boolean(status, "cancel_requested"))
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
                     "中止の希望を記録しています。すでに送信した情報や完了した結果は取り消せません。", 3) + 23;
    if (*string(status, "error")) y += wrapped(ui, 35, y, 648, 18, 29, COLOR_ERROR, string(status, "error"), 8) + 23;
    if (*string(remote, "error")) y += wrapped(ui, 35, y, 648, 18, 29, COLOR_ERROR, string(remote, "error"), 8) + 23;
    if (!strcmp(state, "succeeded")) {
        json_object *output = field(remote, "output"), *execution = field(remote, "execution");
        int proven = remote_completion_proven(status, ui->remote_key);
        if (proven) {
            text(ui, 35, y + 22, 20, 1, COLOR_INK, "遠隔から取得した実行結果", 646); y += 43;
            y = remote_text_panel(ui, y, json_object_get_string(output), "遠隔の出力は空です。");
            text(ui, 35, y + 19, 15, 0, COLOR_MUTED, string(execution, "kind"), 647); y += 38;
        } else y += wrapped(ui, 35, y, 648, 19, 31, COLOR_ERROR, "遠隔での完了を裏付ける結果が不完全です。", 3) + 23;
    }
    button(ui, 32, y, 656, 52, "遠隔の状態を再取得", ACTION_REMOTE_STATUS, 0, NULL, NULL, !ui->busy, 0); y += 73;
    if (!remote_terminal(state)) {
        button(ui, 32, y, 656, 53, !strcmp(state, "prepared") ? "送信せず、この準備を破棄" : "中止を依頼",
               ACTION_REMOTE_CANCEL, 0, NULL, NULL, can_mutate(ui), 0); y += 73;
    }
    button(ui, 32, y, 656, 52, "このツールの入力画面を開く", ACTION_EDITOR, 0, string(status, "id"), NULL,
           installed(ui, string(status, "id")) != NULL, 0); y += 73;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int remote_activate(struct rock_ui *ui, const struct rock_hit *target)
{
    json_object *request = NULL;
    char key[40];
    switch (target->action) {
    case ACTION_REMOTE_OPEN:
        if (ui->remote_prepared && !remote_preview_current(ui)) remote_clear_prepared(ui);
        navigate(ui, PAGE_REMOTE);
        return 1;
    case ACTION_REMOTE_NEW:
        remote_clear_prepared(ui);
        navigate(ui, PAGE_EDITOR);
        return 1;
    case ACTION_REMOTE_HISTORY:
        navigate(ui, PAGE_REMOTE_HISTORY);
        return 1;
    case ACTION_REMOTE_RESULT:
        if (!*target->id || strlen(target->id) >= sizeof(ui->remote_key)) return 1;
        snprintf(ui->remote_key, sizeof(ui->remote_key), "%s", target->id);
        if (ui->remote_status) json_object_put(ui->remote_status);
        ui->remote_status = NULL;
        navigate(ui, PAGE_REMOTE_RESULT);
        ui->remote_poll = 1;
        remote_read_status(ui);
        return 1;
    case ACTION_REMOTE_STATUS:
        remote_read_status(ui);
        return 1;
    case ACTION_REMOTE_PREPARE:
    case ACTION_REMOTE_SUBMIT:
    case ACTION_REMOTE_CANCEL:
        if (!can_mutate(ui)) return 1;
        break;
    default:
        return 0;
    }
    if (target->action == ACTION_REMOTE_SUBMIT) {
        if (!remote_preview_current(ui) || !purchaser_submit_allowed(ui, string(ui->remote_prepared, "target"))) return 1;
        request = request_new("remote.submit");
        put_string(request, "key", string(ui->remote_prepared, "key"));
        json_object_object_add(request, "consent", json_object_get(field(ui->remote_prepared, "consent")));
        snprintf(ui->remote_key, sizeof(ui->remote_key), "%s", string(request, "key"));
        remote_clear_prepared(ui);
        if (ui->remote_status) json_object_put(ui->remote_status);
        ui->remote_status = NULL;
        navigate(ui, PAGE_REMOTE_RESULT);
        ui->remote_poll = 0;
    } else {
        if (rock_request_key(key, sizeof(key)) < 0) {
            snprintf(ui->message, sizeof(ui->message), "要求キーを生成できません。");
            ui->message_error = 1;
            return 1;
        }
        if (target->action == ACTION_REMOTE_PREPARE) {
            const char *destination = target->number == 0 ? "cloud" : "pc_usb";
            if (!remote_allowed(ui, destination)) return 1;
            request = request_new("remote.prepare");
            put_string(request, "id", ui->selected_id);
            put_string(request, "target", destination);
            put_string(request, "text", ui->text);
            put_string(request, "key", key);
        } else {
            const char *job_key = ui->page == PAGE_REMOTE ? string(ui->remote_prepared, "key") : ui->remote_key;
            if (!*job_key) return 1;
            request = request_new("remote.cancel");
            put_string(request, "key", job_key);
            put_string(request, "cancel_key", key);
        }
    }
    send_request(ui, request);
    json_object_put(request);
    return 1;
}

static int remote_prepare_valid(struct rock_ui *ui, json_object *request, json_object *result)
{
    json_object *consent = field(result, "consent"), *bytes = field(result, "input_bytes"), *fee = field(result, "amount_minor");
    (void)ui;
    return strict_bool(result, "prepared", 1) && strict_bool(result, "approved", 0) &&
           strict_string(result, "key", string(request, "key")) && strict_string(result, "id", string(request, "id")) &&
           strict_string(result, "target", string(request, "target")) && *string(result, "version") && strlen(string(result, "version")) < 80 &&
           sha256_text(string(result, "package_hash")) && sha256_text(string(result, "input_sha256")) &&
           *string(result, "endpoint_id") && strlen(string(result, "endpoint_id")) <= 128 &&
           strict_string(result, "transport_evidence", "pinned_tls_loopback_fixture") &&
           strict_string(result, "physical_usb", "NOT_RUN") &&
           bytes && json_object_is_type(bytes, json_type_int) && json_object_get_int64(bytes) == (int64_t)strlen(string(request, "text")) &&
           fee && json_object_is_type(fee, json_type_int) && json_object_get_int64(fee) == 0 &&
           consent && json_object_is_type(consent, json_type_object) && json_object_object_length(consent) == 6 &&
           strict_bool(consent, "approved", 1) && strict_string(consent, "key", string(result, "key")) &&
           strict_string(consent, "package_sha256", string(result, "package_hash")) &&
           strict_string(consent, "input_sha256", string(result, "input_sha256")) &&
           strict_string(consent, "target", string(result, "target")) && strict_string(consent, "endpoint_id", string(result, "endpoint_id"));
}

static int remote_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    const char *operation = string(request, "op");
    json_object *result = field(response, "result");
    if (strncmp(operation, "remote.", 7)) return 0;
    int valid = result && json_object_is_type(result, json_type_object);
    if (!strcmp(operation, "remote.prepare")) valid = valid && remote_prepare_valid(ui, request, result);
    else if (!strcmp(operation, "remote.submit"))
        valid = valid && strict_bool(result, "accepted", 1) && strict_bool(result, "remote_accepted", 0) &&
                strict_string(result, "operation", string(request, "key")) && strict_string(result, "scope", "OS remote queue");
    else if (!strcmp(operation, "remote.cancel"))
        valid = valid && strict_bool(result, "accepted", 1) && strict_string(result, "key", string(request, "key")) &&
                strict_string(result, "operation", string(request, "cancel_key")) &&
                field(result, "before_send_claim") && json_object_is_type(field(result, "before_send_claim"), json_type_boolean);
    else if (!strcmp(operation, "remote.status"))
        valid = valid && strict_string(result, "key", string(request, "key")) && *string(result, "state");
    else valid = 0;
    if (!valid) {
        rock_ui_response(ui, request, NULL, "遠隔実行の応答が不完全です。同じ要求の状態を確認してください。");
        return 1;
    }
    if (!strcmp(operation, "remote.status")) {
        if (strict_string(result, "key", ui->remote_key)) {
            if (ui->remote_status) json_object_put(ui->remote_status);
            ui->remote_status = json_object_get(result);
            if (!ui->retry_request) {
                ui->message[0] = '\0';
                ui->message_error = 0;
                if (strict_string(result, "state", "succeeded") && !remote_completion_proven(result, ui->remote_key)) {
                    snprintf(ui->message, sizeof(ui->message), "遠隔の完了結果・接続先・隔離実行の記録が不完全です。状態を再確認してください。");
                    ui->message_error = 1;
                }
            }
        }
        return 1; /* Reads never resolve an uncertain mutation sharing this key. */
    }
    if (ui->retry_request && !is_retry(ui, request)) return 1;
    if (is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    ui->message_error = 0;
    if (!strcmp(operation, "remote.prepare")) {
        remote_clear_prepared(ui);
        ui->remote_prepared = json_object_get(result);
        snprintf(ui->remote_text, sizeof(ui->remote_text), "%s", string(request, "text"));
        navigate(ui, PAGE_REMOTE);
    } else {
        snprintf(ui->remote_key, sizeof(ui->remote_key), "%s", string(request, "key"));
        if (ui->remote_status) json_object_put(ui->remote_status);
        ui->remote_status = NULL;
        if (ui->remote_prepared && strict_string(ui->remote_prepared, "key", ui->remote_key)) remote_clear_prepared(ui);
        navigate(ui, PAGE_REMOTE_RESULT);
        ui->remote_poll = 0;
        snprintf(ui->message, sizeof(ui->message), !strcmp(operation, "remote.submit") ?
                 "端末で送信を受け付けました。遠隔での完了はまだ確認していません。" :
                 boolean(result, "before_send_claim") ? "送信開始前に準備を取り消しました。" :
                 "中止の希望を受け付けました。遠隔の状態を照合します。");
    }
    return 1;
}
