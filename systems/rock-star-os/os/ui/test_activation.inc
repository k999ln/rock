static json_object *activation_fixture(int active, int ready)
{
    json_object *response = fixture(0, 0), *state = test_field(response, "snapshot");
    json_object *view = json_tokener_parse("{\"state\":\"NOT_ACTIVATED\",\"can_activate\":true,\"recovery_required\":false,"
        "\"reason\":null,\"identity_reference_kind\":\"authenticated_service_scope_digest\","
        "\"wallet_registration_requested\":false,\"wallet_terms_accepted\":false,"
        "\"monthly_consent_accepted\":false,\"os_write_performed\":false}");
    json_object_object_add(view, "state", json_object_new_string(active ? "ACTIVE" : ready ? "NOT_ACTIVATED" : "UNAVAILABLE"));
    json_object_object_add(view, "can_activate", json_object_new_boolean(!active && ready));
    json_object_object_add(view, "recovery_required", json_object_new_boolean(!ready));
    if (!ready) json_object_object_add(view, "reason", json_object_new_string("VERIFIED_BOOT_REQUIRED"));
    json_object_object_add(state, "device_activation", view);
    json_object_object_add(state, "service_access", json_tokener_parse("{\"mode\":\"purchaser-fixture\"}"));
    return response;
}

static void activation_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->busy_read = ui->editing = ui->activation_seen = 0;
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    if (ui->queued_request) { json_object_put(ui->queued_request); ui->queued_request = NULL; }
    ui->page = PAGE_HUB;
    json_object *read = json_tokener_parse("{\"v\":1,\"op\":\"snapshot\"}");
    json_object *response = activation_fixture(0, 1);
    rock_ui_response(ui, read, response, "");
    require(ui->page == PAGE_ACTIVATION && action_enabled(ui, ACTION_DEVICE_ACTIVATE), "verified preinstalled device offers welcome tap");
    test_image(ui, "activation-ready");
    int before = request_count;
    click(ui, ACTION_DEVICE_ACTIVATE);
    require(request_count == before + 1 && !strcmp(value(last_request, "op"), "device.activation.activate") &&
        json_object_object_length(last_request) == 3 && strlen(value(last_request, "key")) == 35,
        "activation tap only sends bounded protocol op and request key");
    json_object *original = json_object_get(last_request);
    rock_ui_response(ui, original, NULL, "fixture lost activation response");
    require(ui->retry_request && !action_enabled(ui, ACTION_DEVICE_ACTIVATE), "uncertain activation never creates a second intent");
    rock_ui_response(ui, read, response, "");
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, original), "activation retry preserves exact key and request");
    json_object *bad = json_tokener_parse("{\"ok\":true,\"result\":{\"state\":\"ACTIVE\"}}");
    rock_ui_response(ui, original, bad, "");
    require(ui->retry_request && ui->page == PAGE_ACTIVATION && !ui->connected, "incomplete activation reply cannot claim success");
    json_object *complete_snapshot = activation_fixture(1, 1);
    json_object *view = test_field(test_field(complete_snapshot, "snapshot"), "device_activation");
    json_object_object_add(view, "request_key", json_object_new_string("wrong-key"));
    json_object *complete = json_object_new_object();
    json_object_object_add(complete, "ok", json_object_new_boolean(1));
    json_object_object_add(complete, "result", json_object_get(view));
    rock_ui_response(ui, original, complete, "");
    require(ui->retry_request != NULL, "activation receipt must match original request");
    json_object_object_add(view, "request_key", json_object_new_string(value(original, "key")));
    json_object_object_add(view, "monthly_consent_accepted", json_object_new_boolean(1));
    rock_ui_response(ui, original, complete, "");
    require(ui->retry_request != NULL, "activation cannot silently accept monthly consent");
    json_object_object_add(view, "monthly_consent_accepted", json_object_new_boolean(0));
    rock_ui_response(ui, read, response, "");
    rock_ui_response(ui, original, complete, "");
    require(!ui->retry_request && ui->page == PAGE_HUB, "bound activation acknowledgement opens actual Hub");
    json_object *blocked = activation_fixture(0, 0);
    rock_ui_response(ui, read, blocked, ""); ui->page = PAGE_ACTIVATION;
    require(!action_enabled(ui, ACTION_DEVICE_ACTIVATE), "unknown or unverified hardware cannot activate");
    test_image(ui, "activation-unavailable");
    require(rock_ui_refresh_interval(ui) == 1000, "welcome checks readiness while pending");
    ui->page = PAGE_HUB;
    require(rock_ui_refresh_interval(ui) == 10000, "idle Hub does not repeat financial reads every two seconds");
    json_object_array_add(test_field(test_field(ui->snapshot, "hub"), "jobs"), json_tokener_parse("{\"status\":\"running\"}"));
    require(rock_ui_refresh_interval(ui) == 1000, "running work retains prompt status updates");
    json_object_put(blocked); json_object_put(complete); json_object_put(complete_snapshot);
    json_object_put(bad); json_object_put(original); json_object_put(response); json_object_put(read);
}
