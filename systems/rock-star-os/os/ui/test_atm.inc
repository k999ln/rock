/* All responses below are unit fixtures, never real account/ATM evidence. */
static int queue_submit_failure(void *context, json_object *request)
{
    (void)context; (void)request;
    return -1;
}

static void read_queue_test(struct rock_ui *ui)
{
    ui->busy = ui->busy_read = 0;
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    snapshot(ui, 1, 1);
    ui->page = PAGE_EDITOR;
    snprintf(ui->selected_id, sizeof(ui->selected_id), "test.native");
    snprintf(ui->text, sizeof(ui->text), "queued exact input");
    rock_ui_refresh(ui);
    require(ui->busy && ui->busy_read, "read refresh is independently marked");
    json_object *read = json_object_get(last_request);
    int before = request_count;
    click(ui, ACTION_RUN); /* Fast down/up, while the refresh is in flight. */
    require(ui->queued_request && request_count == before && !strcmp(value(last_request, "op"), "snapshot"),
            "one actual click during snapshot captures one unsent mutation");
    json_object *queued = json_object_get(ui->queued_request);
    require(!action_enabled(ui, ACTION_RUN), "second mutation is disabled while one is queued");
    snprintf(ui->text, sizeof(ui->text), "later edit");
    json_object *response = fixture(1, 1);
    rock_ui_response(ui, read, response, "");
    rock_ui_flush_queued(ui);
    require(!ui->queued_request && ui->busy && !ui->busy_read && request_count == before + 1 &&
            json_object_equal(last_request, queued) && !strcmp(value(last_request, "text"), "queued exact input"),
            "read completion sends original payload and identity exactly once before next refresh");
    rock_ui_flush_queued(ui);
    require(request_count == before + 1 && !action_enabled(ui, ACTION_RUN), "mutation in flight cannot be duplicated");
    accepted(ui);
    json_object_put(queued); json_object_put(read); json_object_put(response);
    snapshot(ui, 1, 1);
    ui->page = PAGE_EDITOR;
    rock_ui_refresh(ui); read = json_object_get(last_request);
    click(ui, ACTION_RUN); queued = json_object_get(ui->queued_request); before = request_count;
    rock_ui_response(ui, read, NULL, "unit read failure");
    rock_ui_flush_queued(ui);
    require(!ui->queued_request && !ui->busy && request_count == before && ui->retry_request &&
            json_object_equal(ui->retry_request, queued), "failed read retains unsent key without executing mutation");
    snapshot(ui, 1, 1);
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, queued), "explicit retry sends the original unsent request");
    accepted(ui);
    json_object_put(queued); json_object_put(read);
    snapshot(ui, 1, 1); ui->page = PAGE_EDITOR;
    rock_ui_refresh(ui); read = json_object_get(last_request);
    click(ui, ACTION_RUN); queued = json_object_get(ui->queued_request);
    response = fixture(1, 1); rock_ui_response(ui, read, response, "");
    ui->submit = queue_submit_failure; rock_ui_flush_queued(ui); ui->submit = capture;
    require(!ui->busy && !ui->queued_request && ui->retry_request && json_object_equal(ui->retry_request, queued),
            "local worker refusal retains queued payload as explicitly unsent retry");
    click(ui, ACTION_RETRY); accepted(ui);
    json_object_put(queued); json_object_put(read); json_object_put(response);
}

static json_object *atm_fixture_result(const char *state, int released)
{
    json_object *response = json_tokener_parse("{\"ok\":true,\"result\":{\"simulation_only\":true,"
        "\"real_atm_connection\":\"NOT_CONNECTED\",\"currency\":\"USD\","
        "\"withdrawal_id\":\"11111111-1111-4111-8111-111111111111\",\"atm_id\":\"SIM-ATM-001\","
        "\"code_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
        "\"issued_at\":1788873000,\"expires_at\":2000000000,\"code_usable\":true,\"consumed\":false,\"cleanup_needed\":false,"
        "\"withdrawal\":{\"id\":\"11111111-1111-4111-8111-111111111111\",\"amount_minor\":1000,\"dispensed_minor\":0}}}");
    json_object *result = test_field(response, "result");
    json_object_object_add(result, "state", json_object_new_string(state));
    json_object_object_add(result, "code_usable", json_object_new_boolean(!strcmp(state, "ISSUED")));
    json_object_object_add(test_field(result, "withdrawal"), "released_minor", json_object_new_int(released));
    return response;
}

static void atm_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->busy_read = ui->editing = 0;
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    snapshot(ui, 0, 0); ui->page = PAGE_WALLET; ui->scroll = 0; ui->message[0] = '\0';
    coordinate_click(ui, 531, 27, ACTION_ATM_OPEN);
    require(ui->page == PAGE_ATM && !strcmp(ui->amount, "10.00"), "Wallet opens finite ATM owner page");
    test_image(ui, "atm-unit-owner");
    snprintf(ui->amount, sizeof(ui->amount), "10.01");
    int before = request_count;
    click(ui, ACTION_ATM_ISSUE);
    require(!ui->confirm_request && request_count == before && ui->message_error, "ATM rejects non-step amount before request");
    snprintf(ui->amount, sizeof(ui->amount), "510.00"); click(ui, ACTION_ATM_ISSUE);
    require(!ui->confirm_request && request_count == before, "ATM caps issue amount");
    snprintf(ui->amount, sizeof(ui->amount), "10.00"); ui->message[0] = '\0'; ui->scroll = 0;
    coordinate_click(ui, 360, 640, ACTION_ATM_ISSUE);
    require(ui->confirm_request && request_count == before, "issue requires separate confirmation");
    test_image(ui, "atm-unit-confirm");
    coordinate_click(ui, 220, 577, ACTION_DISMISS);
    require(!ui->confirm_request && request_count == before, "dismissing issue sends nothing");
    coordinate_click(ui, 360, 640, ACTION_ATM_ISSUE);
    coordinate_click(ui, 497, 577, ACTION_CONFIRM);
    require(!strcmp(value(last_request, "op"), "wallet.atm.issue") && json_object_object_length(last_request) == 5 &&
            !strcmp(value(last_request, "amount_minor"), "1000") && !strcmp(value(last_request, "atm_id"), "SIM-ATM-001"),
            "issue request has only version op key amount and fixed simulator identity");
    json_object *original = json_object_get(last_request);
    json_object *unavailable = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"unit lost receipt\"}");
    rock_ui_response(ui, original, unavailable, "");
    require(ui->retry_request && json_object_equal(ui->retry_request, original), "structured unknown ATM issue retains full same-key request");
    snapshot(ui, 0, 0); click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, original), "ATM retry does not generate a second key");
    json_object *issue = json_tokener_parse("{\"ok\":true,\"result\":{\"simulation_only\":true,"
        "\"real_atm_connection\":\"NOT_CONNECTED\",\"currency\":\"USD\",\"receipt_kind\":\"immutable_issuance\","
        "\"state_at_issue\":\"ISSUED\",\"withdrawal_id\":\"11111111-1111-4111-8111-111111111111\","
        "\"atm_id\":\"SIM-ATM-001\",\"amount_minor\":1000,\"issued_at\":1788873000,\"expires_at\":2000000000,"
        "\"code\":\"UNIT_TEST_ONLY_NOT_REAL_CODE_000\",\"code_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}");
    rock_ui_response(ui, original, issue, "");
    require(ui->page == PAGE_ATM_STATUS && ui->atm_issue && !ui->atm_status && !ui->atm_code_visible && !ui->retry_request,
            "immutable issuance never becomes current usable state");
    rock_ui_refresh(ui);
    require(!strcmp(value(last_request, "op"), "wallet.atm.status") && json_object_object_length(last_request) == 3,
            "status request is owner read only without code actor or token");
    json_object *status = atm_fixture_result("ISSUED", 0);
    rock_ui_response(ui, last_request, status, "");
    require(ui->atm_status && !ui->atm_code_visible && action_enabled(ui, ACTION_ATM_CODE), "usable code remains hidden until explicit click");
    test_image(ui, "atm-unit-status-hidden");
    coordinate_click(ui, 360, 577, ACTION_ATM_CODE);
    require(ui->atm_code_visible, "explicit reveal requires current matching usable status");
    json_object *status_request = json_object_get(last_request);
    rock_ui_response(ui, status_request, NULL, "unit disconnect");
    require(!ui->atm_status && !ui->atm_code_visible, "disconnect invalidates saved usable status");
    snapshot(ui, 0, 0);
    require(!action_enabled(ui, ACTION_ATM_CODE), "snapshot reconnect alone cannot re-enable old code");
    rock_ui_response(ui, status_request, status, "");
    require(action_enabled(ui, ACTION_ATM_CODE) && !ui->atm_code_visible, "fresh selected status restores eligibility but does not reveal");
    json_object_put(status_request);
    ui->page = PAGE_ATM_STATUS;
    json_object_object_add(test_field(status, "result"), "expires_at", json_object_new_int(1788873001));
    rock_ui_response(ui, last_request, status, ""); rock_ui_draw(ui);
    require(!ui->atm_code_visible && !action_enabled(ui, ACTION_ATM_CODE), "deadline hides code even when historical code_usable was true");
    json_object *member = test_field(test_field(ui->snapshot, "wallet"), "membership");
    json_object_object_add(test_field(member, "entitlement"), "device_eligible", json_object_new_boolean(0));
    coordinate_click(ui, 360, 651, ACTION_ATM_CANCEL);
    require(!ui->atm_status && !ui->atm_code_visible && !action_enabled(ui, ACTION_ATM_CODE),
            "cancel submission immediately invalidates old usable status");
    require(!strcmp(value(last_request, "op"), "wallet.atm.cancel") && json_object_object_length(last_request) == 4,
            "expiry of eligibility preserves owner cancellation with no actor credentials");
    json_object *cancel_request = json_object_get(last_request);
    rock_ui_response(ui, cancel_request, unavailable, "");
    snapshot(ui, 0, 0);
    require(ui->retry_request && !ui->atm_status && !action_enabled(ui, ACTION_ATM_CODE),
            "uncertain cancellation remains hidden after snapshot reconnect");
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, cancel_request), "unknown cancellation repeats exactly one identity");
    json_object *cancel = atm_fixture_result("CANCELED", 1000);
    rock_ui_response(ui, last_request, cancel, "");
    require(!ui->atm_code_visible && !action_enabled(ui, ACTION_ATM_CANCEL) && !action_enabled(ui, ACTION_ATM_CODE),
            "canceled and released reservation cannot be presented as reusable code");
    test_image(ui, "atm-unit-canceled");
    member = test_field(test_field(ui->snapshot, "wallet"), "membership");
    json_object_object_add(test_field(member, "entitlement"), "device_eligible", json_object_new_boolean(0));
    rock_ui_key(ui, KEY_ESC, 1);
    require(ui->page == PAGE_ATM && !action_enabled(ui, ACTION_ATM_ISSUE), "ineligible member cannot issue new reservation");
    json_object_object_add(member, "registered", json_object_new_boolean(0));
    require(!action_enabled(ui, ACTION_ATM_ISSUE), "unregistered account cannot issue");
    json_object_put(original); json_object_put(unavailable); json_object_put(issue); json_object_put(status); json_object_put(cancel);
    json_object_put(cancel_request);
}
