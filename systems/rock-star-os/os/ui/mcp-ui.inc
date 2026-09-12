/* Native Sky controls. Only the dedicated Platform socket knows device tokens. */
static void mcp_replace(json_object **slot, json_object *value)
{
    if (*slot) json_object_put(*slot);
    *slot = value ? json_object_get(value) : NULL;
}

static json_object *mcp_connection(struct rock_ui *ui, const char *alias)
{
    json_object *items = field(ui->mcp_view, "connections");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        if (!strcmp(string(item, "alias"), alias)) return item;
    }
    return NULL;
}

static void mcp_refresh(struct rock_ui *ui)
{
    json_object *request = request_new(ui->page == PAGE_MCP_RESULT && *ui->mcp_key ? "mcp.status" : "mcp.snapshot");
    if (!strcmp(string(request, "op"), "mcp.status")) put_string(request, "key", ui->mcp_key);
    send_request(ui, request);
    json_object_put(request);
}

static int mcp_current(struct rock_ui *ui)
{
    json_object *plan = field(ui->mcp_prepared, "plan"), *item = mcp_connection(ui, ui->mcp_alias);
    return plan && !boolean(ui->mcp_prepared, "submitted") && strict_string(ui->mcp_prepared, "state", "prepared") &&
        strict_string(plan, "alias", ui->mcp_alias) && strict_string(plan, "key", ui->mcp_key) &&
        strict_string(plan, "input_transfer", "explicit_submit_only") &&
        !strcmp(ui->mcp_text, ui->text) && strict_string(item, "state", "connected") &&
        json_object_get_int64(field(plan, "epoch")) == json_object_get_int64(field(item, "epoch")) &&
        json_object_equal(field(plan, "route"), field(item, "route")) &&
        json_object_equal(field(plan, "contract"), field(item, "contract")) &&
        json_object_get_int64(field(plan, "expires_at")) > (int64_t)time(NULL) &&
        json_object_get_int64(field(plan, "input_bytes")) == (int64_t)strlen(ui->mcp_text) &&
        sha256_text(string(field(ui->mcp_prepared, "consent"), "digest"));
}

static void draw_mcp(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    button(ui, 32, y, 170, 42, "‹ Sky", ACTION_NAV, PAGE_HUB, NULL, NULL, 1, 0); y += 63;
    y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
        "使う接続先を選び、送る内容を毎回確認します。\nこの版は無料ツールの開発試験です。", 3) + 22;
    if (!ui->mcp_view) {
        empty_state(ui, y, "接続先を確認中", "通信できない間も端末内の道具は使えます。");
        ui->content_height = y + 250 + ui->scroll - ui->content_top;
        return;
    }
    if (!boolean(ui->mcp_view, "can_submit"))
        y += wrapped(ui, 35, y, 648, 17, 28, COLOR_ERROR,
            "新しい実行には利用資格の確認が必要です。接続解除と過去の結果確認は引き続き行えます。", 3) + 20;
    json_object *items = field(ui->mcp_view, "connections");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        int connected = strict_string(item, "state", "connected");
        const char *alias = string(item, "alias");
        panel(ui, 32, y, 656, 170, COLOR_WHITE);
        text(ui, 52, y + 36, 23, 1, COLOR_INK, string(item, "label"), 430);
        pill(ui, 549, y + 17, connected ? "接続済み" : "未接続", 0xeaf1e7, COLOR_ACCENT);
        text(ui, 52, y + 73, 16, 0, COLOR_MUTED, "追加料金 $0.00 · 選んだテキストだけを送信", 600);
        button(ui, 50, y + 105, 398, 48, connected ? "内容を入力する" : "接続する",
            connected ? ACTION_MCP_TOOL : ACTION_MCP_CONNECT, 0, alias, NULL,
            can_mutate(ui) && boolean(ui->mcp_view, "can_submit"), 1);
        button(ui, 462, y + 105, 206, 48, "接続を解除", ACTION_MCP_DISCONNECT, 0, alias, NULL,
            can_mutate(ui) && connected, 0);
        y += 190;
    }
    y += wrapped(ui, 35, y, 648, 16, 26, COLOR_MUTED,
        "解除すると新しい送信と未送信の準備を止めます。送信開始済みの処理は結果を照合します。接続先の認証情報を無効化する機能は未接続です。", 4) + 24;
    text(ui, 35, y + 22, 21, 1, COLOR_INK, "この接続での履歴", 648); y += 42;
    items = field(ui->mcp_view, "history");
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        panel(ui, 32, y, 656, 86, COLOR_WHITE);
        text(ui, 52, y + 32, 18, 1, COLOR_INK, remote_state_label(string(item, "state")), 585);
        text(ui, 52, y + 61, 14, 0, COLOR_MUTED, string(item, "key"), 585);
        hit(ui, 32, y, 656, 86, ACTION_MCP_RESULT, 0, string(item, "key"), NULL, 1);
        y += 100;
    }
    ui->content_height = y + 20 + ui->scroll - ui->content_top;
}

static void draw_mcp_tool(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    json_object *item = mcp_connection(ui, ui->mcp_alias), *plan = field(ui->mcp_prepared, "plan");
    button(ui, 32, y, 210, 42, "‹ 接続一覧", ACTION_MCP_OPEN, 0, NULL, NULL, 1, 0); y += 64;
    text(ui, 35, y + 26, 25, 1, COLOR_INK, string(item, "label"), 648); y += 48;
    if (!plan) {
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
            "送るテキストを入力してください。内容確認時は識別用のハッシュと長さをOSの管理サーバーへ送ります。本文は実行への同意後に送ります。", 5) + 22;
        double top = y;
        y = remote_text_panel(ui, y, ui->text, "ここをタップして入力");
        hit(ui, 32, top, 656, y - top - 20, ACTION_INPUT, 0, NULL, NULL, !ui->busy);
        button(ui, 32, y, 317, 46, "試験用テキスト", ACTION_SAMPLE, 0, NULL, NULL, !ui->busy, 0);
        button(ui, 366, y, 322, 46, "入力を消す", ACTION_CLEAR, 0, NULL, NULL, !ui->busy, 0); y += 66;
        button(ui, 32, y, 656, 58, "送信する内容と条件を確認", ACTION_MCP_PREPARE, 0, NULL, NULL,
            can_mutate(ui) && strict_string(item, "state", "connected") && boolean(ui->mcp_view, "can_submit"), 1);
        y += 78;
    } else {
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_INK,
            "本文はまだ送信していません。次の本文をOSの管理サーバー経由で、表示された接続先へ渡します。", 4) + 19;
        y += wrapped(ui, 35, y, 648, 16, 27, COLOR_MUTED, string(field(plan, "route"), "origin"), 3) + 14;
        text(ui, 35, y + 23, 18, 1, COLOR_INK, "追加料金 $0.00 · 選択したテキストのみ", 648); y += 43;
        y = remote_text_panel(ui, y, ui->mcp_text, "空のテキスト（0 bytes）");
        int valid = mcp_current(ui) && boolean(ui->mcp_view, "can_submit");
        if (!valid)
            y += wrapped(ui, 35, y, 648, 17, 28, COLOR_ERROR,
                "入力・接続・確認期限の状態が変わりました。内容を確認し直してください。", 3) + 18;
        button(ui, 32, y, 656, 60, "この本文の送信に同意して実行", ACTION_MCP_SUBMIT, 0, NULL, NULL,
            can_mutate(ui) && valid && y >= ui->content_top && y + 60 <= 856, 1); y += 80;
        button(ui, 32, y, 656, 48, "送信せず入力へ戻る", ACTION_MCP_EDIT, 0, NULL, NULL, !ui->busy, 0); y += 68;
        y += wrapped(ui, 35, y, 648, 15, 25, COLOR_MUTED,
            "戻るだけでは確認記録は削除されません。本文を送信せず接続全体を止める場合は、一覧から接続を解除してください。", 4) + 18;
    }
    ui->content_height = y + 20 + ui->scroll - ui->content_top;
}

static void draw_mcp_result(struct rock_ui *ui)
{
    double y = ui->content_top - ui->scroll;
    json_object *status = ui->mcp_status, *result = field(status, "result");
    button(ui, 32, y, 210, 42, "‹ 接続と履歴", ACTION_MCP_OPEN, 0, NULL, NULL, 1, 0); y += 64;
    text(ui, 35, y + 28, 26, 1, COLOR_INK, remote_state_label(string(status, "state")), 648); y += 49;
    y += wrapped(ui, 35, y, 648, 15, 25, COLOR_MUTED, ui->mcp_key, 3) + 18;
    if (strict_string(status, "state", "succeeded") && boolean(status, "send_claimed") &&
            strict_string(result, "state", "succeeded"))
        y = remote_text_panel(ui, y, string(field(result, "output"), "text"), "結果は空です。");
    else
        y += wrapped(ui, 35, y, 648, 18, 29, COLOR_MUTED,
            "送信開始済みの処理を、新しい要求として再送しません。結果が不明な間は同じ記録を照合します。", 4) + 22;
    button(ui, 32, y, 656, 54, "結果を照合する", ACTION_MCP_RECONCILE, 0, NULL, NULL,
        *ui->mcp_key && can_mutate(ui), 0); y += 76;
    text(ui, 35, y + 19, 16, 0, COLOR_MUTED, "この実行結果は売上や送金の証明ではありません。", 648); y += 43;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int mcp_activate(struct rock_ui *ui, const struct rock_hit *target)
{
    json_object *request = NULL;
    char key[40];
    switch (target->action) {
    case ACTION_MCP_OPEN:
        navigate(ui, PAGE_MCP); mcp_refresh(ui); return 1;
    case ACTION_MCP_TOOL:
        if (strlen(target->id) >= sizeof(ui->mcp_alias)) return 1;
        snprintf(ui->mcp_alias, sizeof(ui->mcp_alias), "%s", target->id);
        mcp_replace(&ui->mcp_prepared, NULL);
        navigate(ui, PAGE_MCP_TOOL); return 1;
    case ACTION_MCP_EDIT:
        mcp_replace(&ui->mcp_prepared, NULL); ui->scroll = 0; return 1;
    case ACTION_MCP_RESULT:
        if (!*target->id || strlen(target->id) >= sizeof(ui->mcp_key)) return 1;
        snprintf(ui->mcp_key, sizeof(ui->mcp_key), "%s", target->id);
        mcp_replace(&ui->mcp_status, NULL);
        navigate(ui, PAGE_MCP_RESULT); mcp_refresh(ui); return 1;
    case ACTION_MCP_CONNECT: case ACTION_MCP_DISCONNECT: case ACTION_MCP_PREPARE:
    case ACTION_MCP_SUBMIT: case ACTION_MCP_RECONCILE:
        if (!can_mutate(ui)) return 1;
        break;
    default: return 0;
    }
    if (target->action == ACTION_MCP_SUBMIT) {
        if (!mcp_current(ui) || !boolean(ui->mcp_view, "can_submit")) return 1;
        request = request_new("mcp.submit");
        put_string(request, "key", ui->mcp_key);
        put_string(request, "text", ui->mcp_text);
        json_object_object_add(request, "consent", json_object_get(field(ui->mcp_prepared, "consent")));
    } else if (target->action == ACTION_MCP_RECONCILE) {
        request = request_new("mcp.reconcile"); put_string(request, "key", ui->mcp_key);
    } else {
        if (rock_request_key(key, sizeof(key)) < 0) return 1;
        request = request_new(target->action == ACTION_MCP_PREPARE ? "mcp.prepare" :
                             target->action == ACTION_MCP_CONNECT ? "mcp.connect" : "mcp.disconnect");
        put_string(request, "key", key);
        put_string(request, "alias", target->action == ACTION_MCP_PREPARE ? ui->mcp_alias : target->id);
        if (target->action == ACTION_MCP_PREPARE) {
            put_string(request, "text", ui->text);
            snprintf(ui->mcp_text, sizeof(ui->mcp_text), "%s", ui->text);
        }
    }
    send_request(ui, request); json_object_put(request);
    return 1;
}

static int mcp_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    const char *op = string(request, "op");
    if (strncmp(op, "mcp.", 4)) return 0;
    json_object *result = field(response, "result");
    if (!result || !json_object_is_type(result, json_type_object)) {
        rock_ui_response(ui, request, NULL, "接続先の応答を確認できません。同じ記録で確認します。");
        return 1;
    }
    if (!strcmp(op, "mcp.snapshot")) {
        if (!json_object_is_type(field(result, "connections"), json_type_array) ||
                !json_object_is_type(field(result, "history"), json_type_array)) {
            mcp_replace(&ui->mcp_view, NULL); return 1;
        }
        mcp_replace(&ui->mcp_view, result);
    } else if (!strcmp(op, "mcp.prepare")) {
        json_object *plan = field(result, "plan");
        if (!strict_string(plan, "key", string(request, "key")) ||
                !strict_string(plan, "alias", string(request, "alias")) ||
                !strict_string(plan, "input_transfer", "explicit_submit_only") ||
                !sha256_text(string(field(result, "consent"), "digest"))) {
            rock_ui_response(ui, request, NULL, "確認内容の一致を検証できません。"); return 1;
        }
        mcp_replace(&ui->mcp_prepared, result);
        snprintf(ui->mcp_key, sizeof(ui->mcp_key), "%s", string(request, "key"));
        snprintf(ui->mcp_text, sizeof(ui->mcp_text), "%s", string(request, "text"));
        ui->scroll = 0;
    } else if (!strcmp(op, "mcp.submit")) {
        if (!strict_string(result, "key", string(request, "key")) || !boolean(result, "accepted_locally")) {
            rock_ui_response(ui, request, NULL, "受付記録の一致を確認できません。"); return 1;
        }
        if (!strict_string(result, "consent_digest", string(field(request, "consent"), "digest"))) {
            rock_ui_response(ui, request, NULL, "同意した内容と受付記録が一致しません。"); return 1;
        }
        snprintf(ui->mcp_key, sizeof(ui->mcp_key), "%s", string(request, "key"));
        mcp_replace(&ui->mcp_prepared, NULL); mcp_replace(&ui->mcp_status, NULL);
        navigate(ui, PAGE_MCP_RESULT);
    } else if (!strcmp(op, "mcp.status") || !strcmp(op, "mcp.reconcile")) {
        if (strict_string(result, "key", ui->mcp_key)) mcp_replace(&ui->mcp_status, result);
    } else {
        mcp_replace(&ui->mcp_view, NULL);
        navigate(ui, PAGE_MCP);
    }
    if (is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    ui->connected = 1; ui->connection_error[0] = '\0';
    ui->message[0] = '\0'; ui->message_error = 0;
    return 1;
}
