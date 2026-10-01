/* Public fixture snapshots test display/actions only, never a real bill. */
static json_object *purchaser_fixture(struct rock_ui *ui)
{
    remote_fixture_snapshot(ui, 1);
    json_object *view = json_tokener_parse(
        "{\"mode\":\"purchaser-fixture\",\"state\":\"configured\",\"fresh\":true,"
        "\"authority_id\":\"00000000-0000-4000-8000-000000000001\",\"consumer_id\":\"alice-a\","
        "\"device_ref\":\"fixture-native-test\",\"current\":{"
        "\"schema\":\"rock-purchaser-service-status/1\",\"authority_id\":\"00000000-0000-4000-8000-000000000001\","
        "\"consumer_id\":\"alice-a\",\"device_ref\":\"fixture-native-test\",\"simulation_only\":true,"
        "\"monthly_fee_minor\":888,\"currency\":\"USD\",\"terms_version\":\"simulator-monthly-usd-8.88-v1\","
        "\"paid_services\":[\"runner.cloud\"],\"paid_state\":\"PAID\",\"auto_renew\":true,"
        "\"device_eligible\":true,\"clock_rollback\":false,\"reconciliation_pending\":false,"
        "\"allowed_actions\":[\"runner.cloud.submit\",\"runner.cloud.recover\"]}}"
    );
    json_object_object_add(ui->snapshot, "service_access", view);
    return test_field(view, "current");
}

static void open_service_wallet(struct rock_ui *ui)
{
    ui->scroll = 0;
    for (int attempt = 0; attempt < 35; attempt++) {
        rock_ui_draw(ui);
        for (int i = 0; i < ui->hit_count; i++) {
            struct rock_hit *h = &ui->hits[i];
            if (h->action == ACTION_NAV && h->number == PAGE_WALLET && h->enabled && h->y < 856) {
                int x = (int)(ui->offset_x + (h->x + h->w/2)*ui->scale);
                int y = (int)(ui->offset_y + (h->y + h->h/2)*ui->scale);
                rock_ui_pointer(ui, x, y, 1); rock_ui_pointer(ui, x, y, 0);
                return;
            }
        }
        rock_ui_scroll(ui, 100);
    }
    require(0, "purchaser Wallet navigation is visible");
}

static void purchaser_ui_test(struct rock_ui *ui)
{
    json_object *current = purchaser_fixture(ui);
    ui->page = PAGE_REMOTE;
    snprintf(ui->text, sizeof(ui->text), "explicit native purchaser input");
    int before = request_count;
    open_service_wallet(ui);
    require(ui->page == PAGE_WALLET && request_count == before,
            "service notice opens Wallet without registering, consenting, or billing");
    ui->page = PAGE_REMOTE;
    click(ui, ACTION_REMOTE_PREPARE);
    json_object *prepared = remote_prepared_fixture(last_request);
    rock_ui_response(ui, last_request, prepared, "");
    json_object_put(prepared);
    require(ui->remote_prepared && action_enabled(ui, ACTION_REMOTE_SUBMIT),
            "current paid purchaser may explicitly submit the prepared input");
    char original[129];
    snprintf(original, sizeof(original), "%s", value(ui->remote_prepared, "key"));
    json_object *view = test_field(ui->snapshot, "service_access");
    json_object_object_add(view, "fresh", json_object_new_boolean(0));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT) &&
            !strcmp(original, value(ui->remote_prepared, "key")),
            "stale payment cannot permit new submission or discard prepared input");
    require(action_enabled(ui, ACTION_REMOTE_CANCEL), "stale payment keeps unsent cancellation available");
    json_object_object_add(view, "fresh", json_object_new_boolean(1));
    json_object_object_add(current, "allowed_actions", json_tokener_parse("[\"runner.cloud.recover\"]"));
    json_object_object_add(current, "paid_state", json_object_new_string("PAUSED"));
    json_object_object_add(current, "paid_state_reason", json_object_new_string("WALLET_UNREGISTERED"));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "unregistered purchaser is not told paid cloud is free");
    ui->scroll = 0; rock_ui_draw(ui); test_image(ui, "purchaser-unpaid-preview");
    json_object_object_add(current, "allowed_actions", json_tokener_parse("[\"runner.cloud.submit\",\"runner.cloud.recover\"]"));
    json_object_object_add(current, "paid_state", json_object_new_string("PAID"));
    json_object_object_add(current, "auto_renew", json_object_new_boolean(0));
    require(action_enabled(ui, ACTION_REMOTE_SUBMIT), "canceled renewal retains confirmed paid remainder");
    ui->scroll = 0; rock_ui_draw(ui); test_image(ui, "purchaser-paid-canceled-preview");
    json_object_object_add(current, "paid_state", json_object_new_string("GRACE"));
    json_object_object_add(current, "auto_renew", json_object_new_boolean(1));
    require(action_enabled(ui, ACTION_REMOTE_SUBMIT), "live renewal grace permits explicit new submission");
    json_object_object_add(current, "reconciliation_pending", json_object_new_boolean(1));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "unresolved reconciliation does not become new send approval");
    json_object_object_add(current, "reconciliation_pending", json_object_new_boolean(0));
    json_object_object_add(current, "device_ref", json_object_new_string("fixture-other-device"));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "different device status cannot authorize the displayed endpoint");
    json_object_object_add(current, "device_ref", json_object_new_string("fixture-native-test"));
    json_object_object_add(current, "monthly_fee_minor", json_object_new_boolean(1));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "malformed fee is not a valid paid plan");
    json_object_object_add(current, "monthly_fee_minor", json_object_new_int(888));
    current = NULL;
    before = request_count;
    open_service_wallet(ui);
    require(request_count == before && ui->remote_prepared &&
            !strcmp(original, value(ui->remote_prepared, "key")),
            "Wallet navigation retains the same unsent input and sends no financial mutation");
    ui->page = PAGE_REMOTE;
    click(ui, ACTION_REMOTE_CANCEL);
    json_object *reply = json_tokener_parse("{\"ok\":true,\"result\":{\"accepted\":true,\"before_send_claim\":true}}");
    json_object *result = test_field(reply, "result");
    json_object_object_add(result, "key", json_object_new_string(value(last_request, "key")));
    json_object_object_add(result, "operation", json_object_new_string(value(last_request, "cancel_key")));
    rock_ui_response(ui, last_request, reply, "");
    json_object_put(reply);
    remote_fixture_snapshot(ui, 1);
    ui->page = PAGE_REMOTE;
    json_object *item = json_object_array_get_idx(test_field(test_field(ui->snapshot, "hub"), "installed"), 0);
    json_object_object_add(test_field(item, "manifest"), "schema_version", json_object_new_int(4));
    require(!action_enabled(ui, ACTION_REMOTE_PREPARE), "schema4 needs the OS compatibility result");
    json_object_object_add(item, "compatibility", json_tokener_parse("{\"compatible\":true}"));
    require(action_enabled(ui, ACTION_REMOTE_PREPARE), "compatible schema4 remote Tool is reachable from native Hub");
    json_object_object_add(item, "compatibility", json_tokener_parse("{\"compatible\":false}"));
    require(!action_enabled(ui, ACTION_REMOTE_PREPARE), "incompatible schema4 cannot use remote UI");
    puts("PASS purchaser service fee disclosure, stale/context rejection, Wallet navigation, paid recovery, schema4 remote UI");
}
