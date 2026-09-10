/* Native interaction fixtures only; authentication/ledger tests use real TLS. */
static void game_test_reply(struct rock_ui *ui, json_object *result)
{
    json_object *reply = json_object_new_object();
    json_object_object_add(reply, "ok", json_object_new_boolean(1));
    json_object_object_add(reply, "result", json_object_get(result));
    rock_ui_response(ui, last_request, reply, "");
    json_object_put(reply);
}

static void game_ui_test(struct rock_ui *ui)
{
    snapshot(ui, 1, 1);
    require(!ui->retry_request && !ui->queued_request, "previous UI protocols have no unresolved test request");
    require(rock_auth_operation("auth.game.connect") && rock_auth_operation("auth.game.exchange") &&
            !rock_auth_operation("game.connection.approve") && !rock_auth_operation("game.exchange.approve"),
            "only local Game ceremonies use the authenticator socket");
    click(ui, ACTION_GAME_OPEN);
    require(ui->page == PAGE_GAME, "Game is reachable independently of the four core tabs");
    rock_ui_refresh(ui);
    require(!strcmp(value(last_request, "op"), "game.sandbox.catalog") && rock_ui_request_is_read(last_request),
            "Game discovery is a read and cannot authorize a purchase");
    json_object *catalog = json_tokener_parse("{\"schema\":\"rock-game-sandbox-catalog/1\",\"simulation_only\":true,\"games\":["
        "{\"game_id\":\"public.game.a\",\"game_name\":\"Public Game A\",\"player_id\":\"public-player-a\",\"connection_id\":null,"
        "\"current_state\":\"NOT_CONNECTED\",\"simulation_only\":true}]}");
    game_test_reply(ui, catalog);
    test_image(ui, "game-discovery");
    int before = request_count;
    click(ui, ACTION_GAME_CONNECT);
    require(request_count == before + 1 && !strcmp(value(last_request, "op"), "game.sandbox.connection.begin") &&
            !strcmp(value(last_request, "game_id"), "public.game.a") && !*value(last_request, "pin"),
            "connection begins only on an explicit click without PIN or exchange authority");
    json_object *begin = json_object_get(last_request);
    json_object *intent = json_tokener_parse("{\"schema\":\"rock-game-connection-intent/1\",\"environment\":\"synthetic\",\"simulation_only\":true,"
        "\"binding\":{\"game_id\":\"public.game.a\",\"player_id\":\"public-player-a\","
        "\"connection_id\":\"11111111-1111-4111-8111-111111111111\",\"intent_id\":\"22222222-2222-4222-8222-222222222222\","
        "\"scopes\":[\"exchange:purchase\"]},\"binding_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
        "\"challenge_id\":\"33333333-3333-4333-8333-333333333333\",\"options\":{\"purpose\":\"wallet.game.connect\"}}");
    json_object_object_add(test_field(intent, "binding"), "intent_expires_at", json_object_new_int64(time(NULL) + 90));
    game_test_reply(ui, intent);
    require(ui->page == PAGE_GAME_PIN && !*ui->auth_pin && request_count == before + 1,
            "connection intent does not auto-fill PIN or sign");
    require(!rock_ui_poll(ui, INT64_MAX), "poll never replaces the connection being reviewed");
    require(rock_ui_text(ui, "0000") == 0, "explicit fixture PIN entry");
    test_image(ui, "game-connection-consent");
    click(ui, ACTION_GAME_SIGN);
    require(!strcmp(value(last_request, "op"), "auth.game.connect") && !strcmp(value(last_request, "pin"), "0000") && !*ui->auth_pin,
            "PIN is copied only into the direct authenticator request and cleared from input");
    rock_ui_response(ui, last_request, NULL, "test authenticator unavailable");
    require(!ui->game_pending && !ui->retry_request && !ui->queued_request && !*value(last_request, "pin") && ui->connected,
            "failed signing retains neither PIN nor a Wallet submission and does not disconnect Hub");
    rock_ui_key(ui, KEY_ESC, 1);
    require(ui->page == PAGE_GAME && !*ui->auth_pin, "canceling confirmation returns without authorizing");

    /* An unknown mutation must preserve exact bytes while core navigation works. */
    rock_ui_response(ui, begin, NULL, "test lost begin reply");
    require(ui->game_pending && json_object_equal(ui->game_pending, begin) && !ui->retry_request && ui->connected,
            "Game uncertainty has its own exact pending request");
    require(!action_enabled(ui, ACTION_GAME_CONNECT), "a second Game mutation is disabled while outcome is unknown");
    ui->page = PAGE_HUB;
    require(action_enabled(ui, ACTION_DETAIL), "Game uncertainty does not disable installed Hub inspection");
    click(ui, ACTION_GAME_OPEN);
    click(ui, ACTION_GAME_RETRY);
    require(json_object_equal(last_request, begin), "retry retains original Game request key and content");
    game_test_reply(ui, intent);
    require(!ui->game_pending && ui->page == PAGE_GAME_PIN, "exact resolved response opens original consent");
    rock_ui_key(ui, KEY_ESC, 1);

    /* Current fixture connection and quote: every displayed amount is explicit. */
    json_object *entry = json_object_array_get_idx(test_field(catalog, "games"), 0);
    const char *closed_states[] = {"EXPIRED", "REVOKED"};
    for (size_t i = 0; i < 2; i++) {
        json_object_object_add(entry, "current_state", json_object_new_string(closed_states[i]));
        ui->game_poll = 0; rock_ui_refresh(ui); game_test_reply(ui, catalog);
        int count = request_count;
        require(!action_enabled(ui, ACTION_GAME_CONNECT) && !action_enabled(ui, ACTION_GAME_QUOTE),
                "closed permanent owner binding permits neither reconnect nor new purchase");
        test_image(ui, i ? "game-revoked-contract" : "game-expired-contract");
        require(request_count == count, "viewing a closed connection never submits another intent or purchase");
    }
    json_object_object_add(entry, "current_state", json_object_new_string("ACTIVE"));
    json_object_object_add(entry, "connection_id", json_object_new_string("11111111-1111-4111-8111-111111111111"));
    ui->game_poll = 0; rock_ui_refresh(ui); game_test_reply(ui, catalog);
    click(ui, ACTION_GAME_QUOTE);
    json_object *quote_request = json_object_get(last_request);
    require(!strcmp(value(quote_request, "op"), "game.exchange.quote") && !strcmp(value(quote_request, "principal_minor"), "100"),
            "new purchase requests conditions before any authorization");
    json_object *quote = json_tokener_parse("{\"schema\":\"rock-game-exchange-quote/1\",\"simulation_only\":true,"
        "\"binding_sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"binding\":{"
        "\"game_id\":\"public.game.a\",\"player_id\":\"public-player-a\",\"connection_id\":\"11111111-1111-4111-8111-111111111111\","
        "\"quote_id\":\"44444444-4444-4444-8444-444444444444\",\"source_asset\":\"synthetic:usd\",\"destination_asset\":\"COIN_A\","
        "\"principal_minor\":100,\"game_fee_minor\":3,\"external_cost_minor\":0,\"total_minor\":103,\"units\":10,\"source_scale\":2,\"destination_scale\":0}}");
    json_object *binding = test_field(quote, "binding");
    json_object_object_add(binding, "exchange_id", json_object_new_string(value(quote_request, "exchange_id")));
    json_object_object_add(binding, "issued_at", json_object_new_int64(time(NULL)));
    json_object_object_add(binding, "expires_at", json_object_new_int64(time(NULL) + 90));
    game_test_reply(ui, quote);
    require(ui->page == PAGE_GAME_QUOTE && !ui->game_pending && !ui->game_status, "quote is not a completed exchange");
    test_image(ui, "game-quote-review");
    json_object_object_add(binding, "total_minor", json_object_new_int(104));
    require(!action_enabled(ui, ACTION_GAME_APPROVAL), "inconsistent displayed fee sum cannot proceed");
    json_object_object_add(binding, "total_minor", json_object_new_int(103));
    json_object_object_add(binding, "expires_at", json_object_new_int64(time(NULL) - 1));
    require(!action_enabled(ui, ACTION_GAME_APPROVAL), "expired quote cannot start an approval");
    json_object_object_add(binding, "expires_at", json_object_new_int64(time(NULL) + 90));
    click(ui, ACTION_GAME_APPROVAL);
    json_object *approval = json_tokener_parse("{\"schema\":\"rock-game-exchange-approval-intent/1\",\"simulation_only\":true,"
        "\"attempt_id\":\"55555555-5555-4555-8555-555555555555\",\"quote_sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\","
        "\"options\":{\"purpose\":\"wallet.game.exchange\"}}");
    json_object_object_add(approval, "quote", json_object_get(quote));
    json_object_object_add(approval, "expires_at", json_object_new_int64(time(NULL) + 60));
    game_test_reply(ui, approval);
    require(ui->page == PAGE_GAME_PIN && ui->game_mode == 2 && !*ui->auth_pin, "purchase requires a separate PIN ceremony");
    require(rock_ui_text(ui, "0000") == 0, "purchase PIN is entered independently");
    test_image(ui, "game-purchase-consent");
    click(ui, ACTION_GAME_SIGN);
    require(!strcmp(value(last_request, "op"), "auth.game.exchange"), "purchase never uses ATM or connection signing operation");
    json_object *signed_reply = json_tokener_parse("{\"ok\":true,\"credential\":{\"id\":\"public-test-credential\"},\"metadata\":{}}");
    rock_ui_response(ui, last_request, signed_reply, "");
    require(ui->queued_request && !strcmp(value(ui->queued_request, "op"), "game.exchange.approve") &&
            !*value(ui->queued_request, "pin") && !*value(last_request, "pin"),
            "only credential and fixed attempt binding are queued for Wallet, never PIN");
    rock_ui_flush_queued(ui);
    json_object *submission = json_object_get(last_request);
    require(!ui->queued_request && !strcmp(value(submission, "op"), "game.exchange.approve"),
            "queued approval is submitted through the same main-worker path");
    rock_ui_response(ui, submission, NULL, "test approval reply lost");
    require(ui->page == PAGE_GAME_PIN && ui->game_pending && action_enabled(ui, ACTION_GAME_BACK),
            "unknown approval never traps a touch user inside the PIN overlay");
    click(ui, ACTION_GAME_BACK);
    require(ui->page == PAGE_GAME && json_object_equal(ui->game_pending, submission),
            "leaving uncertain approval keeps the exact request and releases navigation");
    click(ui, ACTION_GAME_RETRY);
    require(json_object_equal(last_request, submission), "lost approval retries original signed bytes only");
    json_object *denial = json_tokener_parse("{\"ok\":true,\"result\":{\"schema\":\"rock-game-exchange-approval-receipt/1\","
        "\"simulation_only\":true,\"attempt_id\":\"55555555-5555-4555-8555-555555555555\","
        "\"quote_sha256\":\"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",\"decision\":\"DENIED\",\"reason\":\"INSUFFICIENT_FUNDS\"}}");
    rock_ui_response(ui, submission, denial, "");
    require(ui->page == PAGE_GAME && !ui->game_status && !ui->game_pending && strstr(ui->game_error, "INSUFFICIENT_FUNDS"),
            "durable insufficient-funds denial is never displayed as queued or completed");
    test_image(ui, "game-insufficient-funds");
    json_object *saved_auth = ui->wallet_auth;
    ui->wallet_auth = NULL;
    json_object *wallet = test_field(ui->snapshot, "wallet");
    json_object_object_add(wallet, "auth", json_tokener_parse("{\"active\":false,\"activation_state\":\"TERMS_REQUIRED\"}"));
    json_object_object_add(catalog, "fixture_credit_applied", json_object_new_boolean(0));
    require(!action_enabled(ui, ACTION_GAME_CREDIT), "test credit requires completed owner setup");
    json_object_object_add(wallet, "auth", json_tokener_parse("{\"active\":true,\"activation_state\":\"ACTIVE\"}"));
    click(ui, ACTION_GAME_CREDIT);
    require(!strcmp(value(last_request, "op"), "game.sandbox.credit") && !strcmp(value(last_request, "amount_minor"), "10000"),
            "explicit public fixture credit has a fixed amount and distinct operation");
    json_object *credit = json_tokener_parse("{\"schema\":\"rock-game-sandbox-credit/1\",\"simulation_only\":true,"
        "\"amount_minor\":10000,\"settled\":true,\"sale_id\":\"public-fixture-sale\"}");
    game_test_reply(ui, credit);
    require(ui->page == PAGE_WALLET && !strcmp(value(catalog, "fixture_credit_applied"), "true"),
            "credit confirmation returns to authoritative Wallet display without calculating a balance in UI");
    click(ui, ACTION_GAME_OPEN);
    require(!action_enabled(ui, ACTION_GAME_CREDIT), "applied one-time credit is not offered again");
    ui->wallet_auth = saved_auth;
    json_object_put(credit);
    json_object_put(denial); json_object_put(submission); json_object_put(signed_reply);
    json_object_put(approval); json_object_put(quote); json_object_put(quote_request);
    json_object_put(intent); json_object_put(begin); json_object_put(catalog);
    ui->page = PAGE_HUB;
    puts("PASS native Game consent separation, fee/expiry guards, masked PIN, exact retry, denial and Hub availability");
}
