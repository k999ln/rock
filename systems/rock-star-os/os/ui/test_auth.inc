/* Renderer/state-machine fixtures only. Actual cryptography is tested by the daemon tests. */
static json_object *auth_test_state(int active, int enrolled)
{
    json_object *state = json_tokener_parse("{\"simulation_only\":true,\"hardware_backed\":false,"
        "\"authenticator_kind\":\"PUBLIC_SOFTWARE_TEST_AUTHENTICATOR\",\"credential_revoked\":false}");
    json_object_object_add(state, "active", json_object_new_boolean(active));
    json_object_object_add(state, "activation_state", json_object_new_string(active ? "ACTIVE" : enrolled ? "TERMS_REQUIRED" : "CREDENTIAL_REQUIRED"));
    json_object_object_add(state, "credential_id", enrolled ? json_object_new_string("fixture-credential") : NULL);
    return state;
}

static json_object *auth_test_options(int create)
{
    json_object *options = json_tokener_parse("{\"schema_version\":1,\"device_ref\":\"fixture-rock-arm64-001\","
        "\"publicKey\":{\"challenge\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\","
        "\"rp\":{\"id\":\"wallet.rock-star-os.test\"},\"rpId\":\"wallet.rock-star-os.test\"}}");
    json_object_object_add(options, "purpose", json_object_new_string(create ? "wallet.enroll" : "wallet.atm.issue"));
    return options;
}

static json_object *auth_test_envelope(json_object *result)
{
    json_object *response = json_object_new_object();
    json_object_object_add(response, "ok", json_object_new_boolean(1));
    json_object_object_add(response, "result", result);
    return response;
}

static json_object *auth_test_quote(json_object *request, int amount)
{
    json_object *result = json_tokener_parse("{\"simulation_only\":true,\"quote_id\":\"fixture-quote\","
        "\"expires_at\":2000000000,\"quote\":{\"quote_id\":\"fixture-quote\",\"authority_id\":\"fixture-authority\","
        "\"account_id\":\"fixture-account\",\"device_ref\":\"fixture-rock-arm64-001\",\"credential_id\":\"fixture-credential\","
        "\"currency\":\"USD\",\"fee_minor\":0,\"atm_id\":\"SIM-ATM-001\",\"expires_at\":2000000000,\"policy\":\"simulator-zero-fee-v1\"}}");
    json_object *quote = NULL;
    json_object_object_get_ex(result, "quote", &quote);
    json_object_object_add(quote, "issue_key", json_object_new_string(value(request, "issue_key")));
    const char *names[] = {"amount_minor", "total_debit_minor", "cash_received_minor"};
    for (size_t i = 0; i < 3; i++) json_object_object_add(quote, names[i], json_object_new_int(amount));
    json_object_object_add(result, "options", auth_test_options(0));
    return auth_test_envelope(result);
}

static void auth_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->busy_read = 0;
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    snapshot(ui, 0, 0);
    json_object *wallet = NULL;
    json_object_object_get_ex(ui->snapshot, "wallet", &wallet);
    json_object_object_add(wallet, "auth", auth_test_state(0, 0));
    ui->page = PAGE_WALLET; ui->scroll = 0;
    require(!action_enabled(ui, ACTION_CONSENT) && !action_enabled(ui, ACTION_SALE), "credential-required Wallet cannot bill or fund");
    click(ui, ACTION_AUTH_BEGIN);
    require(!strcmp(value(last_request, "op"), "wallet.auth.begin"), "registration preparation explicitly begins enrollment");
    json_object *begin = json_tokener_parse("{\"simulation_only\":true,\"challenge_id\":\"fixture-challenge\",\"expires_at\":2000000000}");
    json_object_object_add(begin, "options", auth_test_options(1));
    json_object *response = auth_test_envelope(begin);
    rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(ui->page == PAGE_AUTH_PIN && !*ui->auth_pin, "begin does not sign or auto-fill public PIN");
    int before = request_count;
    rock_ui_key(ui, KEY_ENTER, 1);
    require(request_count == before, "Enter with empty PIN cannot sign");
    click(ui, ACTION_AUTH_PIN);
    require(rock_ui_text(ui, "12345") < 0 && !*ui->auth_pin && rock_ui_text(ui, "abcd") < 0, "PIN is exactly four ASCII digits");
    require(rock_ui_text(ui, "1234") == 0, "explicit wrong PIN entry");
    click(ui, ACTION_AUTH_SIGN);
    require(!strcmp(value(last_request, "op"), "auth.create") && !strcmp(value(last_request, "pin"), "1234") && !*ui->auth_pin,
            "PIN only enters local authenticator request and entry buffer is cleared");
    char local_key[40]; snprintf(local_key, sizeof(local_key), "%s", value(last_request, "key"));
    response = json_tokener_parse("{\"ok\":false,\"code\":\"rejected\",\"error\":\"test PIN rejected\"}");
    rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(!ui->retry_request && !*value(last_request, "pin") && !ui->queued_request, "wrong PIN leaves no Wallet submission or retained PIN");
    click(ui, ACTION_AUTH_PIN); require(rock_ui_text(ui, "0000") == 0, "explicit correct public test PIN entry");
    test_image(ui, "auth-unit-enroll-masked");
    click(ui, ACTION_AUTH_SIGN);
    require(!strcmp(value(last_request, "key"), local_key), "PIN reentry retains the same authenticator operation identity");
    json_object *credential_reply = json_tokener_parse("{\"ok\":true,\"credential\":{\"type\":\"public-key\",\"id\":\"fixture-credential\",\"response\":{}},"
        "\"metadata\":{\"simulation_only\":true,\"hardware_backed\":false,\"authenticator\":\"public-software-test\"}}");
    rock_ui_response(ui, last_request, credential_reply, "");
    require(ui->queued_request && !strcmp(value(ui->queued_request, "op"), "wallet.auth.enroll") && !*value(ui->queued_request, "pin"),
            "actual credential response queues enrollment without PIN");
    rock_ui_flush_queued(ui);
    json_object *state = auth_test_state(0, 1);
    json_object_object_add(state, "receipt_kind", json_object_new_string("immutable_enrollment"));
    json_object_object_add(state, "challenge_id", json_object_new_string("fixture-challenge"));
    response = auth_test_envelope(state); rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(ui->page == PAGE_WALLET && !action_enabled(ui, ACTION_CONSENT), "enrollment does not imply Wallet or monthly terms");
    before = request_count; click(ui, ACTION_WALLET_TERMS);
    require(ui->confirm_request && request_count == before, "Wallet terms need separate explicit confirmation");
    test_image(ui, "auth-unit-wallet-terms"); click(ui, ACTION_CONFIRM);
    require(!strcmp(value(last_request, "op"), "wallet.terms"), "Wallet terms are distinct from monthly consent");
    state = auth_test_state(1, 1);
    json_object_object_add(state, "receipt_kind", json_object_new_string("immutable_wallet_terms"));
    json_object_object_add(state, "terms_receipt_id", json_object_new_string("fixture-terms"));
    json_object_object_add(state, "wallet_terms_version", json_object_new_string("rock-wallet-development/1"));
    json_object_object_add(state, "wallet_terms_accepted", json_object_new_boolean(1));
    response = auth_test_envelope(state); rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(action_enabled(ui, ACTION_CONSENT), "monthly consent is separately available only after activation");
    click(ui, ACTION_ATM_OPEN); click(ui, ACTION_ATM_ISSUE);
    require(!strcmp(value(last_request, "op"), "wallet.atm.quote") && *value(last_request, "issue_key"), "ATM first requests amount-bound quote without reserving");
    json_object *quote_request = json_object_get(last_request);
    response = auth_test_quote(quote_request, 2000); rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(ui->retry_request && ui->page != PAGE_AUTH_PIN && !ui->atm_quote, "mismatched amount response cannot enter signing screen");
    response = auth_test_quote(quote_request, 1000); rock_ui_response(ui, quote_request, response, ""); json_object_put(response);
    ui->connected = 1;
    require(!ui->retry_request && ui->page == PAGE_AUTH_PIN, "same original quote response recovers without new issue identity");
    test_image(ui, "auth-unit-quote-confirmation");
    click(ui, ACTION_AUTH_BACK);
    require(ui->page == PAGE_ATM && !ui->atm_quote && !strcmp(value(last_request, "op"), "wallet.atm.quote.cancel"), "Back cancels quote without ever issuing a hold");
    response = auth_test_envelope(json_tokener_parse("{\"quote_id\":\"fixture-quote\",\"state\":\"CANCELED\",\"funds_reserved\":false,\"simulation_only\":true}"));
    rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    click(ui, ACTION_ATM_ISSUE); json_object_put(quote_request); quote_request = json_object_get(last_request);
    response = auth_test_quote(quote_request, 1000); rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    click(ui, ACTION_AUTH_PIN); require(rock_ui_text(ui, "0000") == 0, "explicit quote PIN entry"); click(ui, ACTION_AUTH_SIGN);
    rock_ui_response(ui, last_request, credential_reply, ""); rock_ui_flush_queued(ui);
    require(!strcmp(value(last_request, "op"), "wallet.atm.issue") && json_object_object_length(last_request) == 5 &&
            !strcmp(value(last_request, "key"), value(quote_request, "issue_key")) && !*value(last_request, "pin"),
            "issue submits exact precommitted key quote and credential only");
    json_object *original = json_object_get(last_request);
    response = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"unit unknown outcome\"}");
    rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    require(ui->retry_request && json_object_equal(ui->retry_request, original) && !*ui->auth_pin &&
            !action_enabled(ui, ACTION_AUTH_BACK), "unknown issue retains exact assertion and blocks new quote/cancellation");
    test_image(ui, "auth-unit-uncertain-issue");
    click(ui, ACTION_RETRY); require(json_object_equal(last_request, original), "explicit uncertain retry preserves every credential byte");
    response = json_tokener_parse("{\"ok\":false,\"code\":\"rejected\",\"error\":\"unit terminal rejection\"}");
    rock_ui_response(ui, last_request, response, ""); json_object_put(response);
    json_object_put(original); json_object_put(quote_request); json_object_put(credential_reply);
}
