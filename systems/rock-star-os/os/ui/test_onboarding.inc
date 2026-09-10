/* Real native sample-button events; no RPC is sent until the user runs. */
static void onboarding_test(struct rock_ui *ui)
{
    const char *ids[] = {"org.rockstar.citation-organizer", "org.rockstar.proposal-draft"};
    const char *names[] = {"引用整理", "提案下書き"};
    for (int i = 0; i < 2; i++) {
        snapshot(ui, 1, 1);
        json_object *catalog = NULL, *hub_state = NULL, *list = NULL, *manifest = NULL;
        json_object_object_get_ex(ui->snapshot, "catalog", &catalog);
        json_object_object_get_ex(json_object_array_get_idx(catalog, 0), "manifest", &manifest);
        json_object_object_add(manifest, "id", json_object_new_string(ids[i]));
        json_object_object_add(manifest, "name", json_object_new_string(names[i]));
        json_object_object_get_ex(ui->snapshot, "hub", &hub_state);
        json_object_object_get_ex(hub_state, "installed", &list);
        json_object_object_add(json_object_array_get_idx(list, 0), "id", json_object_new_string(ids[i]));
        snprintf(ui->selected_id, sizeof(ui->selected_id), "%s", ids[i]);
        ui->page = PAGE_EDITOR;
        ui->text[0] = '\0';
        int before = request_count;
        click(ui, ACTION_SAMPLE);
        require(request_count == before && ui->page == PAGE_EDITOR && !ui->confirm_request,
                "sample input never starts a job or authorizes a payment");
        if (!i) {
            require(strstr(ui->text, "（出典: [店舗情報](https://example.test/store)）") &&
                    strstr(ui->text, "```text\n（出典: [コード内の例]"),
                    "citation example exercises both citation extraction and protected code");
        } else {
            json_object *sample = json_tokener_parse(ui->text), *requirements = NULL, *deliverables = NULL;
            require(sample && *value(sample, "title") && *value(sample, "deadline") && *value(sample, "price") &&
                    json_object_object_get_ex(sample, "requirements", &requirements) &&
                    json_object_object_get_ex(sample, "deliverables", &deliverables) &&
                    json_object_is_type(requirements, json_type_array) && json_object_array_length(requirements) > 0 &&
                    json_object_is_type(deliverables, json_type_array) && json_object_array_length(deliverables) > 0,
                    "proposal example is a valid structured brief instead of generic prose");
            json_object_put(sample);
        }
        test_image(ui, !i ? "citation-sample" : "proposal-sample");
        click(ui, ACTION_RUN);
        require(request_count == before + 1 && !strcmp(value(last_request, "op"), "run") &&
                !strcmp(value(last_request, "id"), ids[i]) && !strcmp(value(last_request, "text"), ui->text),
                "explicit run submits the reviewed example through the existing Hub request");
        accepted(ui);
    }
    snapshot(ui, 1, 1);
    json_object *catalog = NULL, *entry = NULL, *manifest = NULL, *historical = NULL;
    json_object *hub_state = NULL, *jobs = NULL;
    json_object_object_get_ex(ui->snapshot, "catalog", &catalog);
    entry = json_object_array_get_idx(catalog, 0);
    require(json_object_deep_copy(entry, &historical, NULL) == 0, "independent historical package metadata");
    json_object_object_get_ex(historical, "manifest", &manifest);
    json_object_object_add(manifest, "name", json_object_new_string("保存時の道具"));
    json_object_object_add(historical, "hash", json_object_new_string("historical-package-hash"));
    json_object_object_get_ex(entry, "manifest", &manifest);
    json_object_object_add(manifest, "version", json_object_new_string("2.0.0"));
    json_object_object_add(manifest, "name", json_object_new_string("更新後の別名"));
    json_object_array_add(catalog, historical);
    json_object_object_get_ex(ui->snapshot, "hub", &hub_state);
    json_object_object_get_ex(hub_state, "jobs", &jobs);
    json_object_array_add(jobs, json_tokener_parse(
        "{\"id\":\"saved-onboarding-job\",\"tool_id\":\"test.native\",\"version\":\"1.0.0\","
        "\"package_hash\":\"historical-package-hash\",\"status\":\"completed\",\"created\":1789012800,"
        "\"output\":\"保存された実行結果。新しい版への更新後も同じ結果を表示します。\"}"));
    ui->page = PAGE_RESULT;
    snprintf(ui->selected_job, sizeof(ui->selected_job), "saved-onboarding-job");
    ui->scroll = 0;
    test_image(ui, "result-executed-version");
    json_object_object_add(hub_state, "installed", json_object_new_array());
    test_image(ui, "result-deleted-tool");
    json_object_object_add(ui->snapshot, "catalog", json_object_new_array());
    test_image(ui, "result-unknown-package");
    ui->text[0] = '\0';
    ui->page = PAGE_HUB;
    ui->scroll = 0;
    ui->message[0] = '\0';
}
