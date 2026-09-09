/* Test-only stdin bridge. The Python host dispatches exactly the requests that
 * actual pointer/key actions emit into real disposable Wallet/auth fixtures.
 * Neither this bridge nor fixture paths are installed in the OS. */
static const char *wallet_replay_action(enum rock_action action)
{
#define NAMED_ACTION(name) case name: return #name
    switch (action) {
        NAMED_ACTION(ACTION_NAV); NAMED_ACTION(ACTION_WALLET_REGISTER);
        NAMED_ACTION(ACTION_AUTH_BEGIN); NAMED_ACTION(ACTION_AUTH_PIN);
        NAMED_ACTION(ACTION_AUTH_SIGN); NAMED_ACTION(ACTION_WALLET_TERMS);
        NAMED_ACTION(ACTION_CONFIRM); NAMED_ACTION(ACTION_CONSENT);
        NAMED_ACTION(ACTION_BILL); NAMED_ACTION(ACTION_WALLET_EXPAND);
        NAMED_ACTION(ACTION_AMOUNT); NAMED_ACTION(ACTION_SALE);
        NAMED_ACTION(ACTION_SETTLE); NAMED_ACTION(ACTION_ATM_OPEN);
        NAMED_ACTION(ACTION_ATM_ISSUE); NAMED_ACTION(ACTION_ATM_STATUS);
        NAMED_ACTION(ACTION_ATM_CANCEL); default: return "OTHER";
    }
#undef NAMED_ACTION
}

static int wallet_replay_bridge(const char *font)
{
    struct rock_ui ui;
    char error[256], *line = NULL;
    size_t capacity = 0;
    require(rock_ui_init(&ui, 720, 960, font, capture, NULL, error, sizeof(error)) == 0, error);
    while (getline(&line, &capacity, stdin) >= 0) {
        require(strlen(line) < 1024 * 1024, "bounded test command");
        json_object *command = json_tokener_parse(line), *item = NULL;
        require(command != NULL, "valid renderer bridge command");
        const char *op = value(command, "event");
        if (last_request) { json_object_put(last_request); last_request = NULL; }
        if (!strcmp(op, "response")) {
            json_object *request = NULL, *response = NULL;
            require(json_object_object_get_ex(command, "request", &request) &&
                    json_object_object_get_ex(command, "response", &response), "real fixture request and reply required");
            rock_ui_response(&ui, request, response, "");
            rock_ui_flush_queued(&ui);
        } else if (!strcmp(op, "refresh")) {
            rock_ui_refresh(&ui);
        } else if (!strcmp(op, "click")) {
            int x = json_object_get_int(json_object_object_get(command, "x"));
            int y = json_object_get_int(json_object_object_get(command, "y"));
            const char *expected = value(command, "action");
            rock_ui_draw(&ui);
            int found = 0;
            for (int i = 0; i < ui.hit_count; i++) {
                struct rock_hit *h = &ui.hits[i];
                if (h->enabled && !strcmp(wallet_replay_action(h->action), expected) &&
                    x >= h->x && x < h->x + h->w && y >= h->y && y < h->y + h->h) found = 1;
            }
            if (!found) fprintf(stderr, "coordinate=%d,%d expected=%s scroll=%.0f top=%.0f\n", x, y, expected, ui.scroll, ui.content_top);
            require(found, "Wallet replay coordinate targets the expected enabled visible action");
            rock_ui_pointer(&ui, x, y, 1); rock_ui_pointer(&ui, x, y, 0);
        } else if (!strcmp(op, "keys")) {
            require(json_object_object_get_ex(command, "codes", &item), "key codes required");
            for (size_t i = 0; i < json_object_array_length(item); i++)
                rock_ui_key(&ui, (unsigned)json_object_get_int(json_object_array_get_idx(item, i)), 1);
            for (size_t i = json_object_array_length(item); i > 0; i--)
                rock_ui_key(&ui, (unsigned)json_object_get_int(json_object_array_get_idx(item, i - 1)), 0);
        } else if (!strcmp(op, "text")) {
            require(rock_ui_text(&ui, value(command, "text")) == 0, "real text input accepted");
        } else if (!strcmp(op, "capture")) {
            rock_ui_draw(&ui);
            require(cairo_surface_write_to_png(ui.surface, value(command, "path")) == CAIRO_STATUS_SUCCESS,
                    "test framebuffer captured");
        } else require(!strcmp(op, "inspect"), "known renderer command");
        rock_ui_draw(&ui);
        require(cairo_status(ui.cr) == CAIRO_STATUS_SUCCESS, "real Wallet snapshot frame renders");
        require(!ui.atm_code_visible, "ATM redemption code never revealed by the replay");
        json_object *output = json_object_new_object(), *hits = json_object_new_array();
        json_object_object_add(output, "request", last_request ? json_object_get(last_request) : NULL);
        json_object_object_add(output, "hits", hits);
        json_object_object_add(output, "scroll", json_object_new_double(ui.scroll));
        json_object_object_add(output, "page", json_object_new_int(ui.page));
        json_object_object_add(output, "busy", json_object_new_boolean(ui.busy));
        json_object_object_add(output, "retry", json_object_new_boolean(ui.retry_request != NULL));
        for (int i = 0; i < ui.hit_count; i++) {
            struct rock_hit *h = &ui.hits[i];
            if (!h->enabled) continue;
            json_object *row = json_object_new_object(), *rect = json_object_new_array();
            json_object_object_add(row, "action", json_object_new_string(wallet_replay_action(h->action)));
            json_object_object_add(row, "rect", rect);
            double bounds[] = {h->x, h->y, h->w, h->h};
            for (int j = 0; j < 4; j++) json_object_array_add(rect, json_object_new_double(bounds[j]));
            json_object_array_add(hits, row);
        }
        puts(json_object_to_json_string_ext(output, JSON_C_TO_STRING_PLAIN)); fflush(stdout);
        json_object_put(output); json_object_put(command);
    }
    free(line);
    rock_ui_destroy(&ui);
    if (last_request) { json_object_put(last_request); last_request = NULL; }
    return 0;
}
