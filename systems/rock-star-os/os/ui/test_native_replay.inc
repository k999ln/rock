/* Host geometry only: public signed manifests and the actual replay steps are
 * supplied by test_native_replay.py. No Hub operation or QEMU is performed. */
static int native_replay_geometry(const char *font, const char *case_path)
{
    struct rock_ui ui;
    char error[256];
    json_object *input = json_object_from_file(case_path), *source = NULL, *steps = NULL;
    require(input && json_object_object_get_ex(input, "snapshot", &source) &&
            json_object_object_get_ex(input, "steps", &steps), "native replay geometry input exists");
    test_image_directory = value(input, "images");
    require(rock_ui_init(&ui, 720, 960, font, capture, NULL, error, sizeof(error)) == 0, error);
    json_object *snapshot_request = json_tokener_parse("{\"v\":1,\"op\":\"snapshot\"}");
    json_object *response = json_object_new_object();
    json_object_object_add(response, "ok", json_object_new_boolean(1));
    json_object_object_add(response, "snapshot", json_object_get(source));
    rock_ui_response(&ui, snapshot_request, response, "");
    enum rock_action actions[] = {ACTION_DETAIL, ACTION_INSTALL, ACTION_APPROVE, ACTION_EDITOR, ACTION_INPUT};
    size_t clicks = 0, captures = 0;
    const char *tool = "org.example.action-checklist", *version = "2.0.0";
    json_object *entry = NULL, *catalog = NULL;
    json_object_object_get_ex(source, "catalog", &catalog);
    for (size_t i = 0; i < json_object_array_length(catalog); i++) {
        json_object *candidate = json_object_array_get_idx(catalog, i), *manifest = NULL;
        json_object_object_get_ex(candidate, "manifest", &manifest);
        if (!strcmp(value(manifest, "id"), tool) && !strcmp(value(manifest, "version"), version)) entry = candidate;
    }
    require(entry != NULL, "public default Tool version is present");
    for (size_t i = 0; i < json_object_array_length(steps); i++) {
        json_object *step = json_object_array_get_idx(steps, i), *argument = NULL;
        if (json_object_object_get_ex(step, "click", &argument)) {
            require(clicks < sizeof(actions) / sizeof(actions[0]), "bounded replay click count");
            int x = json_object_get_int(json_object_array_get_idx(argument, 0));
            int y = json_object_get_int(json_object_array_get_idx(argument, 1));
            enum rock_action expected = actions[clicks++];
            printf("native-replay coordinate=%d,%d action=%d scroll=%.0f\n", x, y, expected, ui.scroll);
            coordinate_click(&ui, x, y, expected);
            if (expected == ACTION_DETAIL) {
                require(!strcmp(ui.selected_id, tool) && !strcmp(ui.selected_version, version) && request_count == 0,
                        "real public first card selects latest checklist without a request");
                for (int h = 0; h < ui.hit_count; h++) {
                    struct rock_hit *hit = &ui.hits[h];
                    require(!(hit->action == ACTION_INSTALL && hit->enabled &&
                            360 >= hit->x && 360 < hit->x + hit->w && 793 >= hit->y && 793 < hit->y + hit->h),
                            "old unscrolled install coordinate must not be mistaken for the new install button");
                }
            } else if (expected == ACTION_INSTALL) {
                require(request_count == 1 && !strcmp(value(last_request, "op"), "install") &&
                        !strcmp(value(last_request, "id"), tool) && !strcmp(value(last_request, "version"), version),
                        "scrolled input requests the actual default public Tool version");
                json_object *hub_state = NULL, *list = NULL, *manifest = NULL;
                json_object_object_get_ex(source, "hub", &hub_state);
                json_object_object_get_ex(hub_state, "installed", &list);
                json_object_object_get_ex(entry, "manifest", &manifest);
                json_object *item = json_object_new_object();
                json_object_object_add(item, "id", json_object_new_string(tool));
                json_object_object_add(item, "version", json_object_new_string(version));
                json_object_object_add(item, "hash", json_object_new_string(value(entry, "hash")));
                json_object_object_add(item, "manifest", json_object_get(manifest));
                json_object_object_add(item, "enabled", json_object_new_boolean(0));
                json_object_object_add(item, "cached_versions", json_object_new_array());
                json_object_array_add(list, item);
                accepted(&ui);
                rock_ui_response(&ui, snapshot_request, response, "");
            } else if (expected == ACTION_APPROVE) {
                require(request_count == 2 && !strcmp(value(last_request, "op"), "approve") &&
                        !strcmp(value(last_request, "approved_hash"), value(entry, "hash")),
                        "post-install PageUp reaches approval bound to the real signed package hash");
                json_object *hub_state = NULL, *list = NULL;
                json_object_object_get_ex(source, "hub", &hub_state);
                json_object_object_get_ex(hub_state, "installed", &list);
                json_object_object_add(json_object_array_get_idx(list, 0), "enabled", json_object_new_boolean(1));
                accepted(&ui);
                rock_ui_response(&ui, snapshot_request, response, "");
            } else if (expected == ACTION_EDITOR) {
                require(ui.page == PAGE_EDITOR && request_count == 2,
                        "reviewed default Tool opens the editor without an automatic run");
            } else {
                require(ui.editing == 1 && request_count == 2, "documented text field accepts focus without running");
            }
        } else if (json_object_object_get_ex(step, "keys", &argument)) {
            require(json_object_array_length(argument) == 1, "geometry prefix has one page key");
            const char *key = json_object_get_string(json_object_array_get_idx(argument, 0));
            require(!strcmp(key, "pgdn") || !strcmp(key, "pgup"), "geometry prefix uses only page keys");
            unsigned code = !strcmp(key, "pgdn") ? KEY_PAGEDOWN : KEY_PAGEUP;
            rock_ui_key(&ui, code, 1);
            rock_ui_key(&ui, code, 0);
        } else if (json_object_object_get_ex(step, "capture", &argument)) {
            test_image(&ui, json_object_get_string(argument));
            captures++;
        } else {
            require(json_object_object_get_ex(step, "wait", &argument), "known prefix action");
        }
        rock_ui_draw(&ui);
        require(cairo_status(ui.cr) == CAIRO_STATUS_SUCCESS, "public replay frame renders");
    }
    require(clicks == 5 && captures == 5 && ui.page == PAGE_EDITOR,
            "five captured public-catalog frames cover all five replay pointer targets");
    rock_ui_destroy(&ui);
    json_object_put(snapshot_request);
    json_object_put(response);
    json_object_put(input);
    if (last_request) { json_object_put(last_request); last_request = NULL; }
    puts("PASS public signed catalog native replay geometry; backend and guest execution NOT_RUN");
    return 0;
}
