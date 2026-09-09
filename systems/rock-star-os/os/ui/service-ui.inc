/* Display a live, locally cross-checked service projection. The authority still
 * authorizes every new job and execution; these controls cannot grant access. */
static int strict_string(json_object *object, const char *name, const char *expected);
static int strict_bool(json_object *object, const char *name, int expected);

static int purchaser_profile(struct rock_ui *ui)
{
    json_object *view = field(ui->snapshot, "service_access");
    return view && !strict_string(view, "mode", "development-fixture");
}

static json_object *purchaser_current(struct rock_ui *ui)
{
    json_object *view = field(ui->snapshot, "service_access"), *current = field(view, "current");
    json_object *fee = field(current, "monthly_fee_minor");
    if (!strict_string(view, "mode", "purchaser-fixture") || !strict_string(view, "state", "configured") ||
        !strict_bool(view, "fresh", 1) || !strict_string(current, "schema", "rock-purchaser-service-status/1") ||
        !strict_bool(current, "simulation_only", 1) || !*string(view, "authority_id") ||
        !strict_string(current, "authority_id", string(view, "authority_id")) ||
        !*string(view, "consumer_id") || !strict_string(current, "consumer_id", string(view, "consumer_id")) ||
        !*string(view, "device_ref") || !strict_string(current, "device_ref", string(view, "device_ref")) ||
        !fee || !json_object_is_type(fee, json_type_int) || json_object_get_int64(fee) != 888 ||
        !strict_string(current, "currency", "USD") ||
        !strict_string(current, "terms_version", "simulator-monthly-usd-8.88-v1")) return NULL;
    return current;
}

static int service_array_contains(json_object *items, const char *expected)
{
    if (!items || !json_object_is_type(items, json_type_array) || array_size(items) > 8) return 0;
    for (size_t i = 0; i < array_size(items); i++) {
        json_object *item = array_item(items, i);
        if (item && json_object_is_type(item, json_type_string) &&
            (size_t)json_object_get_string_len(item) == strlen(expected) &&
            !strcmp(json_object_get_string(item), expected)) return 1;
    }
    return 0;
}

static int purchaser_submit_allowed(struct rock_ui *ui, const char *target)
{
    if (!purchaser_profile(ui)) return 1;
    json_object *current = purchaser_current(ui);
    char action[64];
    if (!current || !strict_bool(current, "device_eligible", 1) ||
        !strict_bool(current, "clock_rollback", 0) ||
        !strict_bool(current, "reconciliation_pending", 0)) return 0;
    snprintf(action, sizeof(action), "runner.%s.submit", target);
    return service_array_contains(field(current, "allowed_actions"), action);
}

static double draw_purchaser_service(struct rock_ui *ui, double y, const char *target)
{
    if (!purchaser_profile(ui)) return y;
    json_object *current = purchaser_current(ui);
    char service[64];
    snprintf(service, sizeof(service), "runner.%s", target);
    int monthly = current && service_array_contains(field(current, "paid_services"), service);
    const char *caption = "最新の利用条件を確認できません。接続して状態を更新してください。";
    if (current) {
        if (!strict_bool(current, "device_eligible", 1))
            caption = "この端末の利用資格を確認してください。保存済みの道具と履歴は残っています。";
        else if (!strict_bool(current, "clock_rollback", 0))
            caption = "サービスの時刻を確認できません。新しい実行を停止しています。";
        else if (strict_bool(current, "reconciliation_pending", 1))
            caption = "支払い結果を照合しています。新しい実行は照合後に確認できます。";
        else if (!monthly)
            caption = "この接続先の利用資格を確認済みです。送信時にも確認します。";
        else if (strict_string(current, "paid_state", "PAID"))
            caption = strict_bool(current, "auto_renew", 1) ?
                "支払い済みの利用期間中です。送信時にも利用資格を確認します。" :
                "自動更新は停止済みです。支払い済みの期間は引き続き利用できます。";
        else if (strict_string(current, "paid_state", "GRACE"))
            caption = "更新の猶予期間です。Walletでお支払いを確認してください。";
        else if (strict_string(current, "paid_state_reason", "WALLET_UNREGISTERED"))
            caption = "Walletの登録、月額利用への同意、初回支払いが必要です。";
        else if (strict_string(current, "paid_state_reason", "CONSENT_REQUIRED"))
            caption = "月額利用への同意と初回支払いをWalletで確認してください。";
        else
            caption = "月額の支払いを確認できないため、新しい実行を停止しています。";
    }
    panel(ui, 32, y, 656, 252, COLOR_WHITE);
    text(ui, 55, y + 35, 21, 1, COLOR_INK,
         !strcmp(target, "cloud") ? "クラウドの利用条件" : "PC接続の利用条件", 608);
    text(ui, 55, y + 68, 18, 1, COLOR_ACCENT,
         !current ? "月額条件は未確認" : monthly ? "$8.88 USD / 月（開発テスト）" :
         "この実行先の月額条件なし", 608);
    wrapped(ui, 55, y + 82, 608, 17, 26, COLOR_INK, caption, 2);
    wrapped(ui, 55, y + 143, 608, 14, 21, COLOR_MUTED,
            "ツール本体・今回の実行追加料金とは別の条件です。\nここからWalletを開くだけでは同意・請求は行いません。", 2);
    button(ui, 55, y + 197, 608, 40, "Walletで条件・支払いを確認", ACTION_NAV, PAGE_WALLET,
           NULL, NULL, y + 197 >= ui->content_top && y + 237 <= 856, 0);
    return y + 272;
}
