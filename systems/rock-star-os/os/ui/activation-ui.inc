/* A tap records activation of an already verified OS. It never flashes an
 * image, accepts Wallet terms or changes the service authority's permissions. */
static int activation_view_valid(json_object *view)
{
    const char *state = string(view, "state");
    return view && (!strcmp(state, "NOT_ACTIVATED") || !strcmp(state, "ACTIVE") || !strcmp(state, "UNAVAILABLE")) &&
        json_object_is_type(field(view, "can_activate"), json_type_boolean) &&
        json_object_is_type(field(view, "recovery_required"), json_type_boolean) &&
        strict_bool(view, "wallet_registration_requested", 0) &&
        strict_bool(view, "wallet_terms_accepted", 0) &&
        strict_bool(view, "monthly_consent_accepted", 0) &&
        strict_bool(view, "os_write_performed", 0) &&
        strict_string(view, "identity_reference_kind", "authenticated_service_scope_digest");
}

static int activation_ready(struct rock_ui *ui)
{
    json_object *view = field(ui->snapshot, "device_activation");
    return activation_view_valid(view) && strict_string(view, "state", "NOT_ACTIVATED") &&
        strict_bool(view, "can_activate", 1) && strict_bool(view, "recovery_required", 0);
}

static const char *activation_reason(json_object *view)
{
    const char *reason = string(view, "reason");
    if (strstr(reason, "BOOT") || strstr(reason, "IMAGE") || strstr(reason, "HEALTH"))
        return "起動したOSの確認が必要です。対応する起動手順と回復状態を確認してください。";
    if (strstr(reason, "HARDWARE") || strstr(reason, "TARGET"))
        return "この機種でのOS動作をまだ確認できていません。対応機種の確認後に進めます。";
    if (strstr(reason, "IDENTITY") || strstr(reason, "PURCHASE") || strstr(reason, "OWNER") || strstr(reason, "BINDING"))
        return "端末と購入情報の確認が必要です。引き渡し時の情報と接続状態を確認してください。";
    return "端末の確認情報を取得しています。接続状態を確認して、もう一度更新してください。";
}

static void draw_activation(struct rock_ui *ui)
{
    json_object *view = field(ui->snapshot, "device_activation");
    int valid = activation_view_valid(view);
    int active = valid && strict_string(view, "state", "ACTIVE") && strict_bool(view, "recovery_required", 0);
    int ready = activation_ready(ui);
    double y = ui->content_top - ui->scroll;
    panel(ui, 32, y, 656, 231, COLOR_INK);
    star(ui, 615, y + 49, 20, COLOR_GOLD);
    text(ui, 57, y + 44, 14, 1, 0xbacfc6, "WELCOME TO ROCKSTAROS", 515);
    text(ui, 57, y + 98, 32, 1, COLOR_WHITE, active ? "準備ができました。" : "この端末を、", 598);
    text(ui, 57, y + 144, 32, 1, COLOR_WHITE, active ? "さあ、使い始めよう。" : "あなたのRockstarOSに。", 598);
    text(ui, 57, y + 193, 18, 0, 0xd6e7df, "道具を追加して、端末だけで使う。", 598);
    y += 250;
    panel(ui, 32, y, 656, 113, COLOR_WHITE);
    text(ui, 56, y + 37, 19, 1, COLOR_INK, ready || active ? "OSと端末の確認が完了" : "端末の準備を確認", 590);
    wrapped(ui, 56, y + 52, 601, 16, 25, COLOR_MUTED,
            ready || active ? "この起動と端末の情報を確認しました。\n確認済みの情報を使い、追加の個人情報入力を減らします。" : activation_reason(view), 2);
    y += 133;
    y += wrapped(ui, 37, y, 646, 16, 25, COLOR_MUTED,
            "この操作は端末の利用開始です。Wallet登録と月額$8.88への同意は、Walletで別に確認します。", 3) + 22;
    button(ui, 32, y, 656, 61, active ? "Hubを開く" : ui->busy && !ui->busy_read ? "確認しています…" : "使い始める",
           active ? ACTION_NAV : ACTION_DEVICE_ACTIVATE, PAGE_HUB, NULL, NULL,
           active || (ready && can_mutate(ui)), 1);
    y += 80;
    button(ui, 32, y, 656, 48, "保存済みのツールを見る", ACTION_NAV, PAGE_INSTALLED, NULL, NULL, 1, 0);
    y += 66;
    text(ui, 37, y + 17, 13, 0, COLOR_MUTED, "開発用の仮想端末で検証中 · BlackBerry実機は機種未確定", 644);
    y += 42;
    ui->content_height = y + ui->scroll - ui->content_top;
}

static int activation_response(struct rock_ui *ui, json_object *request, json_object *response)
{
    if (strcmp(string(request, "op"), "device.activation.activate")) return 0;
    json_object *view = field(response, "result");
    if (!activation_view_valid(view) || !strict_string(view, "state", "ACTIVE") ||
        !strict_bool(view, "can_activate", 0) || !strict_bool(view, "recovery_required", 0) ||
        !*string(request, "key") || !strict_string(view, "request_key", string(request, "key"))) {
        rock_ui_response(ui, request, NULL, "利用開始の結果を確認できません。同じ要求で再確認してください。");
        return 1;
    }
    if (is_retry(ui, request)) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    if (ui->snapshot) json_object_object_add(ui->snapshot, "device_activation", json_object_get(view));
    ui->message_error = 0;
    navigate(ui, PAGE_HUB);
    snprintf(ui->message, sizeof(ui->message), "利用開始を記録しました。Hubからツールを追加できます。");
    return 1;
}
