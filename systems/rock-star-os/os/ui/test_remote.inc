/* Explicit unit-only remote controller responses. No remote execution occurs. */
static void remote_hit_geometry(struct rock_ui *ui, const char *label, enum rock_action action, int at_end)
{
    if (!test_image_directory) return;
    ui->scroll = 0;
    rock_ui_draw(ui);
    if (at_end) rock_ui_scroll(ui, 10000);
    rock_ui_draw(ui);
    for (int i = 0; i < ui->hit_count; i++) {
        struct rock_hit *item = &ui->hits[i];
        if (item->action == action && item->enabled) {
            printf("REMOTE_HIT %s %.0f %.0f\n", label, item->x + item->w / 2, item->y + item->h / 2);
            return;
        }
    }
    require(0, "remote replay geometry must expose the expected complete action");
}

static json_object *test_field(json_object *object, const char *name)
{
    json_object *item = NULL;
    if (object) json_object_object_get_ex(object, name, &item);
    return item;
}

static void remote_fixture_snapshot(struct rock_ui *ui, int cloud_available)
{
    snapshot(ui, 1, 1);
    json_object *state = ui->snapshot, *item = json_object_array_get_idx(test_field(test_field(state, "hub"), "installed"), 0);
    json_object *manifest = test_field(item, "manifest");
    json_object_object_add(item, "hash", json_object_new_string("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    json_object_object_add(manifest, "schema_version", json_object_new_int(3));
    json_object_object_add(manifest, "name", json_object_new_string("遠隔UIの単体試験 · 実行はしません"));
    json_object_object_add(manifest, "execution_targets", json_tokener_parse("[\"cloud\",\"pc_usb\"]"));
    json_object_object_add(state, "remote", json_tokener_parse(
        "{\"configured\":true,\"worker_alive\":true,\"history\":[],\"destinations\":["
        "{\"target\":\"cloud\",\"available\":true,\"endpoint_id\":\"unit-fixture-only\",\"transport_evidence\":\"pinned_tls_loopback_fixture\",\"physical_usb\":\"NOT_RUN\"},"
        "{\"target\":\"pc_usb\",\"available\":false,\"endpoint_id\":null,\"transport_evidence\":null,\"physical_usb\":\"NOT_RUN\"}]}"));
    json_object *destination = json_object_array_get_idx(test_field(test_field(state, "remote"), "destinations"), 0);
    json_object_object_add(destination, "available", json_object_new_boolean(cloud_available));
    snprintf(ui->selected_id, sizeof(ui->selected_id), "test.native");
    ui->busy = 0;
}

static json_object *remote_prepared_fixture(json_object *request)
{
    json_object *response = json_tokener_parse(
        "{\"ok\":true,\"result\":{\"prepared\":true,\"approved\":false,\"id\":\"test.native\",\"version\":\"1.0.0\","
        "\"package_hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
        "\"input_sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\","
        "\"target\":\"cloud\",\"endpoint_id\":\"unit-fixture-only\",\"transport_evidence\":\"pinned_tls_loopback_fixture\","
        "\"physical_usb\":\"NOT_RUN\",\"amount_minor\":0,\"consent\":{\"approved\":true,"
        "\"package_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
        "\"input_sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\","
        "\"target\":\"cloud\",\"endpoint_id\":\"unit-fixture-only\"}}}");
    json_object *result = test_field(response, "result");
    json_object_object_add(result, "key", json_object_new_string(value(request, "key")));
    json_object_object_add(test_field(result, "consent"), "key", json_object_new_string(value(request, "key")));
    json_object_object_add(result, "input_bytes", json_object_new_int64((int64_t)strlen(value(request, "text"))));
    return response;
}

static json_object *remote_state_fixture(const char *key, const char *state)
{
    json_object *response = json_tokener_parse("{\"ok\":true,\"result\":{\"id\":\"test.native\",\"version\":\"1.0.0\","
        "\"package_hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
        "\"target\":\"cloud\",\"endpoint_id\":\"unit-fixture-only\",\"send_claimed\":false,\"cancel_requested\":false,\"remote\":null}}" );
    json_object *result = test_field(response, "result");
    json_object_object_add(result, "key", json_object_new_string(key));
    json_object_object_add(result, "state", json_object_new_string(state));
    return response;
}

static void remote_ui_test(struct rock_ui *ui)
{
    remote_fixture_snapshot(ui, 0);
    ui->page = PAGE_EDITOR;
    snprintf(ui->text, sizeof(ui->text), "Native input\nRemote result");
    require(!action_enabled(ui, ACTION_RUN), "remote-only manifest cannot run locally");
    remote_hit_geometry(ui, "editor-open-at-end", ACTION_REMOTE_OPEN, 1);
    int before = request_count;
    click(ui, ACTION_REMOTE_OPEN);
    require(ui->page == PAGE_REMOTE && request_count == before && !action_enabled(ui, ACTION_REMOTE_PREPARE),
            "unavailable destination and schema constraints prevent preparation");
    remote_fixture_snapshot(ui, 1);
    json_object *installed_item = json_object_array_get_idx(test_field(test_field(ui->snapshot, "hub"), "installed"), 0);
    json_object_object_add(test_field(installed_item, "manifest"), "schema_version", json_object_new_int(2));
    require(!action_enabled(ui, ACTION_REMOTE_PREPARE), "endpoint availability cannot bypass signed schema-3 requirement");
    json_object_object_add(test_field(installed_item, "manifest"), "schema_version", json_object_new_int(3));
    json_object *destination = json_object_array_get_idx(test_field(test_field(ui->snapshot, "remote"), "destinations"), 0);
    json_object_object_add(destination, "transport_evidence", json_object_new_string("unknown-transport"));
    require(!action_enabled(ui, ACTION_REMOTE_PREPARE), "an unknown transport cannot inherit the TLS fixture safety label");
    json_object_object_add(destination, "transport_evidence", json_object_new_string("pinned_tls_loopback_fixture"));
    ui->scroll = 0;
    rock_ui_draw(ui);
    test_image(ui, "unit-remote-destinations");
    remote_hit_geometry(ui, "cloud-prepare-at-top", ACTION_REMOTE_PREPARE, 0);
    int usb_enabled = 0;
    for (int i = 0; i < ui->hit_count; i++)
        if (ui->hits[i].action == ACTION_REMOTE_PREPARE && ui->hits[i].number == 1) usb_enabled |= ui->hits[i].enabled;
    require(!usb_enabled, "physical USB without endpoint stays disabled");
    click(ui, ACTION_REMOTE_PREPARE);
    require(!strcmp(value(last_request, "op"), "remote.prepare") && json_object_object_length(last_request) == 6 &&
            !strcmp(value(last_request, "target"), "cloud") && !strcmp(value(last_request, "text"), ui->text),
            "preparation sends only fixed tool target exact input and new job identity");
    json_object *prepare = json_object_get(last_request), *prepared = remote_prepared_fixture(prepare);
    char key[129];
    snprintf(key, sizeof(key), "%s", value(prepare, "key"));
    rock_ui_response(ui, prepare, NULL, "unit preparation reply missing");
    require(ui->retry_request && !ui->remote_prepared, "lost preview does not imply user approval");
    json_object *read = json_tokener_parse("{\"v\":1,\"op\":\"remote.status\"}");
    json_object_object_add(read, "key", json_object_new_string(key));
    rock_ui_response(ui, read, NULL, "unit status read missing");
    require(json_object_equal(ui->retry_request, prepare) && rock_ui_request_is_read(read),
            "failed read sharing the job key cannot replace the unresolved prepare");
    remote_fixture_snapshot(ui, 1);
    json_object_object_add(test_field(prepared, "result"), "id", json_object_new_string("different.tool"));
    rock_ui_response(ui, prepare, prepared, "");
    require(ui->retry_request && !ui->remote_prepared, "mismatched Tool preview cannot become sendable consent");
    json_object_object_add(test_field(prepared, "result"), "id", json_object_new_string("test.native"));
    rock_ui_response(ui, prepare, prepared, "");
    remote_fixture_snapshot(ui, 1);
    before = request_count;
    require(ui->remote_prepared && !ui->retry_request && !strcmp(value(ui->remote_prepared, "approved"), "false") &&
            !strcmp(ui->remote_text, ui->text), "returned consent proposal is kept as an unapproved exact-input preview");
    ui->scroll = 0; rock_ui_draw(ui); test_image(ui, "unit-remote-preview-top");
    snprintf(ui->text, sizeof(ui->text), "changed input");
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "changed input invalidates previous sending approval");
    snprintf(ui->text, sizeof(ui->text), "%s", ui->remote_text);
    installed_item = json_object_array_get_idx(test_field(test_field(ui->snapshot, "hub"), "installed"), 0);
    json_object_object_add(installed_item, "version", json_object_new_string("2.0.0"));
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT) && action_enabled(ui, ACTION_REMOTE_CANCEL),
            "changed installed version disables approval but allows discarding old unsent preparation");
    json_object_object_add(installed_item, "version", json_object_new_string("1.0.0"));
    require(action_enabled(ui, ACTION_REMOTE_SUBMIT) && request_count == before, "rendering or editing never automatically sends preview");
    rock_ui_key(ui, KEY_ESC, 1);
    require(ui->page == PAGE_EDITOR && request_count == before, "leaving preview with Escape sends nothing");
    click(ui, ACTION_REMOTE_OPEN);
    (void)action_enabled(ui, ACTION_REMOTE_SUBMIT); test_image(ui, "unit-remote-preview-consent");
    remote_hit_geometry(ui, "preview-submit-at-end", ACTION_REMOTE_SUBMIT, 1);
    remote_hit_geometry(ui, "preview-discard-at-end", ACTION_REMOTE_CANCEL, 1);
    json_object *approved_consent = json_object_get(test_field(ui->remote_prepared, "consent"));
    click(ui, ACTION_REMOTE_SUBMIT);
    require(!strcmp(value(last_request, "op"), "remote.submit") && json_object_object_length(last_request) == 4 &&
            !strcmp(value(last_request, "key"), key) &&
            json_object_equal(test_field(last_request, "consent"), approved_consent),
            "separate explicit action sends the complete unchanged consent and original job key");
    json_object_put(approved_consent);
    require(ui->page == PAGE_REMOTE_RESULT && !ui->remote_prepared && !strcmp(ui->remote_key, key),
            "after sending consent the UI immediately leaves the unsent preview even before the receipt arrives");
    json_object *submit = json_object_get(last_request);
    json_object *unavailable = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"unit uncertain local queue\"}");
    rock_ui_response(ui, submit, unavailable, "");
    require(json_object_equal(ui->retry_request, submit) && ui->page == PAGE_REMOTE_RESULT && !ui->remote_prepared,
            "structured unavailable preserves the exact remote mutation without claiming input remains unsent");
    remote_fixture_snapshot(ui, 1);
    json_object *state = remote_state_fixture(key, "queued");
    rock_ui_response(ui, read, state, "");
    require(json_object_equal(ui->retry_request, submit), "successful status read cannot erase an unresolved submit sharing its key");
    rock_ui_response(ui, prepare, prepared, "");
    require(json_object_equal(ui->retry_request, submit) && !ui->remote_prepared && ui->page == PAGE_REMOTE_RESULT,
            "stale prepare sharing the key cannot erase an unresolved submit or restore its obsolete unsent label");
    require(action_enabled(ui, ACTION_RETRY), "navigation cannot hide retry control for an unresolved request");
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, submit), "submit retry preserves the full approved payload");
    json_object *accepted_response = json_tokener_parse("{\"ok\":true,\"result\":{\"accepted\":true,\"remote_accepted\":false,\"scope\":\"OS remote queue\"}}" );
    json_object_object_add(test_field(accepted_response, "result"), "operation", json_object_new_string(key));
    rock_ui_response(ui, submit, accepted_response, "");
    require(ui->page == PAGE_REMOTE_RESULT && !ui->retry_request && !ui->remote_prepared && !ui->remote_status,
            "local queue receipt is separate from actual remote success and clears consumed preview");
    rock_ui_response(ui, read, state, "");
    require(ui->remote_status && !strcmp(value(ui->remote_status, "state"), "queued"), "actual remote state comes only from status reads");
    rock_ui_draw(ui); test_image(ui, "unit-remote-local-queue");
    json_object_put(state);
    state = remote_state_fixture(key, "succeeded");
    json_object *result = test_field(state, "result");
    json_object *remote = json_tokener_parse("{\"found\":true,\"state\":\"succeeded\",\"output\":\"Unit response only\\nNo actual remote execution\","
                                         "\"execution\":{\"kind\":\"unit-fixture-only\",\"physical_usb\":\"NOT_RUN\"},\"receipt\":{}}" );
    json_object_object_add(test_field(remote, "receipt"), "key", json_object_new_string(key));
    json_object_object_add(result, "remote", remote);
    json_object_object_add(result, "send_claimed", json_object_new_boolean(1));
    rock_ui_response(ui, read, state, "");
    require(ui->message_error, "callback-shaped or incomplete remote proof cannot be presented as actual completed output");
    json_object *receipt = test_field(remote, "receipt"), *execution = test_field(remote, "execution");
    json_object_object_add(receipt, "accepted", json_object_new_boolean(1));
    json_object_object_add(receipt, "request_sha256", json_object_new_string("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"));
    json_object_object_add(receipt, "endpoint_id", json_object_new_string("unit-fixture-only"));
    json_object_object_add(receipt, "actual_target", json_object_new_string("cloud"));
    json_object_object_add(receipt, "transport_evidence", json_object_new_string("pinned_tls_loopback_fixture"));
    json_object_object_add(receipt, "physical_usb", json_object_new_string("NOT_RUN"));
    json_object_object_add(execution, "kind", json_object_new_string("actual_linux_isolated_process"));
    json_object_object_add(execution, "socket_syscall_denied", json_object_new_boolean(1));
    json_object_object_add(execution, "wallet_path_visible", json_object_new_boolean(0));
    rock_ui_response(ui, read, state, "");
    require(!ui->message_error, "complete explicit unit proof exercises the guarded result layout without running anything");
    json_object_object_add(receipt, "endpoint_id", json_object_new_string("wrong-endpoint"));
    rock_ui_response(ui, read, state, "");
    require(ui->message_error, "completed result from another endpoint cannot claim the selected remote completion");
    json_object_object_add(receipt, "endpoint_id", json_object_new_string("unit-fixture-only"));
    rock_ui_response(ui, read, state, "");
    ui->scroll = 0; rock_ui_draw(ui); test_image(ui, "unit-remote-result");
    require(!action_enabled(ui, ACTION_REMOTE_CANCEL), "terminal remote result is not presented as cancellable");
    require(json_object_array_length(test_field(test_field(ui->snapshot, "hub"), "jobs")) == 0,
            "remote results do not create local Hub jobs");
    json_object_put(state);
    state = remote_state_fixture(key, "prepared");
    rock_ui_response(ui, read, state, "");
    require(!action_enabled(ui, ACTION_REMOTE_SUBMIT), "historical prepared record without original input cannot be approved");
    click(ui, ACTION_REMOTE_CANCEL);
    require(!strcmp(value(last_request, "op"), "remote.cancel") && json_object_object_length(last_request) == 4 &&
            !strcmp(value(last_request, "key"), key) && strcmp(value(last_request, "cancel_key"), key),
            "discard uses original job key and a separate cancellation identity");
    json_object *cancel = json_object_get(last_request);
    rock_ui_response(ui, cancel, unavailable, "");
    json_object *other_cancel = json_tokener_parse(json_object_to_json_string(cancel));
    json_object_object_add(other_cancel, "cancel_key", json_object_new_string("different-cancel-key"));
    json_object *cancelled = json_tokener_parse("{\"ok\":true,\"result\":{\"accepted\":true,\"before_send_claim\":true}}" );
    json_object_object_add(test_field(cancelled, "result"), "key", json_object_new_string(key));
    json_object_object_add(test_field(cancelled, "result"), "operation", json_object_new_string("different-cancel-key"));
    rock_ui_response(ui, other_cancel, cancelled, "");
    require(json_object_equal(ui->retry_request, cancel), "different cancellation identity on same job cannot resolve original retry");
    json_object_object_add(test_field(cancelled, "result"), "operation", json_object_new_string(value(cancel, "cancel_key")));
    rock_ui_response(ui, cancel, cancelled, "");
    require(!ui->retry_request, "matching cancellation receipt resolves only its own request");
    json_object_put(state);
    state = remote_state_fixture(key, "cancelled");
    json_object_object_add(test_field(state, "result"), "cancel_requested", json_object_new_boolean(1));
    rock_ui_response(ui, read, state, "");
    rock_ui_draw(ui); test_image(ui, "unit-remote-cancelled");
    remote_hit_geometry(ui, "cancelled-editor-at-end", ACTION_EDITOR, 1);
    json_object_array_add(test_field(test_field(ui->snapshot, "remote"), "history"), json_object_get(test_field(state, "result")));
    click(ui, ACTION_REMOTE_HISTORY);
    rock_ui_draw(ui); test_image(ui, "unit-remote-history");
    for (int page = PAGE_REMOTE; page <= PAGE_REMOTE_HISTORY; page++) {
        ui->page = (enum rock_page)page;
        rock_ui_draw(ui);
        require(cairo_status(ui->cr) == CAIRO_STATUS_SUCCESS, "all native remote pages render");
    }
    json_object_put(prepare); json_object_put(prepared); json_object_put(submit); json_object_put(read);
    json_object_put(state); json_object_put(unavailable); json_object_put(accepted_response);
    json_object_put(cancel); json_object_put(other_cancel); json_object_put(cancelled);
}
