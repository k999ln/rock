/* Native actions/rendering only; real signed package and job lifecycle are
 * covered by Hub integration tests and the separate guest input harness. */
static void click_version(struct rock_ui *ui, const char *version)
{
    ui->scroll = 0;
    for (int scroll = 0; scroll < 35; scroll++) {
        rock_ui_draw(ui);
        for (int i = 0; i < ui->hit_count; i++) {
            struct rock_hit *hit = &ui->hits[i];
            if (hit->action != ACTION_VERSION || !hit->enabled || strcmp(hit->version, version)) continue;
            int x = (int)(hit->x + hit->w / 2), y = (int)(hit->y + hit->h / 2);
            rock_ui_pointer(ui, x, y, 1);
            rock_ui_pointer(ui, x, y, 0);
            return;
        }
        rock_ui_scroll(ui, 100);
    }
    require(0, "requested catalog version is visible and selectable");
}

static void lifecycle_selection_test(struct rock_ui *ui)
{
    ui->page = PAGE_HUB;
    ui->busy = ui->editing = 0;
    ui->message[0] = '\0';
    snapshot(ui, 0, 0);
    json_object *catalog = NULL, *manifest = NULL, *newer = NULL;
    json_object_object_get_ex(ui->snapshot, "catalog", &catalog);
    json_object *older = json_object_array_get_idx(catalog, 0);
    require(json_object_deep_copy(older, &newer, NULL) == 0, "copy independent known catalog version");
    json_object_object_get_ex(newer, "manifest", &manifest);
    json_object_object_add(manifest, "version", json_object_new_string("1.1.0"));
    json_object_object_add(manifest, "description", json_object_new_string("新しい版の説明"));
    json_object_object_add(newer, "hash", json_object_new_string("new-test-package-hash"));
    json_object_array_add(catalog, newer);
    click(ui, ACTION_DETAIL);
    require(!strcmp(ui->selected_version, "1.1.0"), "Hub still opens the latest version by default");
    int before = request_count;
    ui->scroll = 0;
    test_image(ui, "tool-version-default-latest");
    click_version(ui, "1.0.0");
    require(request_count == before && !strcmp(ui->selected_version, "1.0.0") && !ui->confirm_request,
            "choosing the older known version only changes detail, never installs or approves");
    ui->scroll = 0;
    test_image(ui, "tool-version-older-selected");
    click(ui, ACTION_INSTALL);
    require(request_count == before + 1 && !strcmp(value(last_request, "op"), "install") &&
            !strcmp(value(last_request, "id"), "test.native") && !strcmp(value(last_request, "version"), "1.0.0"),
            "explicit install submits the reviewed older version");
    accepted(ui);
    snapshot(ui, 1, 0);
    require(!action_enabled(ui, ACTION_VERSION) && !action_enabled(ui, ACTION_EDITOR) && action_enabled(ui, ACTION_APPROVE),
            "installed version uses explicit permission approval rather than version selection or automatic execution");
    click(ui, ACTION_APPROVE);
    require(!strcmp(value(last_request, "approved_hash"), "test-package-hash"),
            "approval remains bound to the selected installed package hash");
    accepted(ui);

    /* A catalog refresh can invalidate a pointer target already drawn. */
    ui->page = PAGE_HUB;
    ui->message[0] = '\0';
    snapshot(ui, 0, 0);
    click(ui, ACTION_DETAIL);
    ui->scroll = 0;
    for (int scroll = 0, found = 0; scroll < 35; scroll++) {
        rock_ui_draw(ui);
        for (int i = 0; i < ui->hit_count; i++) {
            struct rock_hit *hit = &ui->hits[i];
            if (hit->action != ACTION_INSTALL || !hit->enabled) continue;
            int x = (int)(hit->x + hit->w / 2), y = (int)(hit->y + hit->h / 2);
            before = request_count;
            rock_ui_pointer(ui, x, y, 1);
            json_object_object_add(ui->snapshot, "catalog", json_object_new_array());
            rock_ui_pointer(ui, x, y, 0);
            require(request_count == before, "removed catalog version cannot install from a stale pointer target");
            found = 1;
            break;
        }
        if (found) break;
        require(scroll < 34, "install target found for catalog refresh race");
        rock_ui_scroll(ui, 100);
    }

    ui->message[0] = '\0';
    snapshot(ui, 1, 1);
    before = request_count;
    click(ui, ACTION_DISABLE);
    require(ui->confirm_request && request_count == before && !strcmp(value(ui->confirm_request, "op"), "disable"),
            "stopping use requires a distinct native confirmation before dispatch");
    test_image(ui, "tool-disable-confirmation");
    click(ui, ACTION_DISMISS);
    require(!ui->confirm_request && request_count == before, "back leaves the Tool enabled without sending disable");
    click(ui, ACTION_DISABLE);
    click(ui, ACTION_CONFIRM);
    require(request_count == before + 1 && !strcmp(value(last_request, "op"), "disable") &&
            !strcmp(value(last_request, "id"), "test.native") && !*value(last_request, "version") &&
            strlen(value(last_request, "key")) == 35, "confirmed stop uses existing tool lifecycle, not a fabricated job cancellation");
    json_object *disable = json_object_get(last_request);
    rock_ui_response(ui, disable, NULL, "test-only lost disable acknowledgement");
    snapshot(ui, 1, 1);
    require(ui->retry_request && json_object_equal(ui->retry_request, disable) && !action_enabled(ui, ACTION_DISABLE),
            "uncertain stop preserves its original receipt and blocks another stop");
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, disable), "explicit stop retry retains the same request key and fields");
    accepted(ui);
    json_object_put(disable);
    snapshot(ui, 1, 0);
    require(!action_enabled(ui, ACTION_DISABLE) && !action_enabled(ui, ACTION_EDITOR) && action_enabled(ui, ACTION_APPROVE),
            "disabled Tool cannot run until current permissions are approved again");
    ui->scroll = 0;
    test_image(ui, "tool-disabled-permissions-required");
    click(ui, ACTION_APPROVE);
    require(!strcmp(value(last_request, "op"), "approve") &&
            !strcmp(value(last_request, "approved_hash"), "test-package-hash"), "re-enable reuses exact installed-hash consent");
    accepted(ui);
    snapshot(ui, 1, 1);
    require(action_enabled(ui, ACTION_EDITOR), "acknowledged re-enable permits opening the Tool");
    ui->page = PAGE_HUB;
    ui->scroll = 0;
    ui->message[0] = '\0';
}
