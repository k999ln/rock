#include <time.h>

/* Explicit renderer fixtures only; actual TLS/Broker integration is tested in
 * test_mcp_hub_gateway.py and does not use these response objects. */
static void mcp_ui_test(struct rock_ui *ui)
{
    ui->busy = ui->busy_read = ui->editing = 0;
    if (ui->retry_request) { json_object_put(ui->retry_request); ui->retry_request = NULL; }
    if (ui->queued_request) { json_object_put(ui->queued_request); ui->queued_request = NULL; }
    snapshot(ui, 0, 0); ui->page = PAGE_HUB;
    json_object_object_add(ui->snapshot, "mcp", json_tokener_parse("{\"configured\":true}"));
    click(ui, ACTION_MCP_OPEN);
    require(!strcmp(value(last_request, "op"), "mcp.snapshot") && rock_ui_request_is_read(last_request),
            "Hub opens a separate live connection read");
    json_object *view_reply = json_tokener_parse("{\"ok\":true,\"result\":{\"can_submit\":true,\"connections\":[{"
        "\"alias\":\"memo\",\"label\":\"MCP試験用の道具\",\"tool\":\"text.upper\",\"state\":\"connected\",\"epoch\":1,"
        "\"route\":{\"origin\":\"http://127.0.0.1:9999\"},\"contract\":{\"price\":{\"amount_minor\":0,\"currency\":\"USD\"}}}],\"history\":[]}}");
    rock_ui_response(ui, last_request, view_reply, "");
    test_image(ui, "mcp-connections");
    click(ui, ACTION_MCP_TOOL);
    click(ui, ACTION_INPUT); ui->select_all = 1;
    require(rock_ui_text(ui, "Selected public text") == 0, "MCP selected text can be entered on device");
    test_image(ui, "mcp-input");
    click(ui, ACTION_MCP_PREPARE);
    require(!strcmp(value(last_request, "op"), "mcp.prepare") && !strcmp(value(last_request, "text"), ui->text),
            "native preparation gives text only to dedicated Platform; client hashes before TLS");
    json_object *prepare = json_object_get(last_request);
    json_object *preview = json_tokener_parse("{\"ok\":true,\"result\":{\"prepared\":true,\"submitted\":false,\"state\":\"prepared\","
        "\"plan\":{\"alias\":\"memo\",\"epoch\":1,\"input_transfer\":\"explicit_submit_only\"},"
        "\"consent\":{\"approved\":true,\"digest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}}");
    json_object *plan = test_field(test_field(preview, "result"), "plan");
    json_object *item = json_object_array_get_idx(test_field(test_field(view_reply, "result"), "connections"), 0);
    json_object_object_add(plan, "key", json_object_new_string(value(prepare, "key")));
    json_object_object_add(plan, "input_bytes", json_object_new_int((int)strlen(ui->text)));
    json_object_object_add(plan, "expires_at", json_object_new_int64(time(NULL) + 120));
    json_object_object_add(plan, "route", json_object_get(test_field(item, "route")));
    json_object_object_add(plan, "contract", json_object_get(test_field(item, "contract")));
    rock_ui_response(ui, prepare, preview, "");
    require(action_enabled(ui, ACTION_MCP_SUBMIT), "matching current preview allows a separate explicit consent");
    test_image(ui, "mcp-preview");
    snprintf(ui->text, sizeof(ui->text), "changed input");
    require(!action_enabled(ui, ACTION_MCP_SUBMIT), "changed selected text cannot use old consent");
    snprintf(ui->text, sizeof(ui->text), "%s", ui->mcp_text);
    json_object_object_add(plan, "expires_at", json_object_new_int64(time(NULL) - 1));
    require(!action_enabled(ui, ACTION_MCP_SUBMIT), "expired preview cannot send");
    json_object_object_add(plan, "expires_at", json_object_new_int64(time(NULL) + 120));
    json_object_object_add(item, "epoch", json_object_new_int(2));
    require(!action_enabled(ui, ACTION_MCP_SUBMIT), "connection generation change requires new confirmation");
    json_object_object_add(item, "epoch", json_object_new_int(1));
    click(ui, ACTION_MCP_SUBMIT);
    json_object *submit = json_object_get(last_request);
    require(!strcmp(value(submit, "key"), value(prepare, "key")) &&
            !strcmp(value(submit, "text"), "Selected public text"), "submit sends the exact displayed text and key");
    json_object *uncertain = json_tokener_parse("{\"ok\":false,\"code\":\"unavailable\",\"error\":\"test lost response\"}");
    rock_ui_response(ui, submit, uncertain, "");
    require(ui->retry_request && json_object_equal(ui->retry_request, submit), "lost MCP acceptance retains exact text, key and consent");
    ui->connected = 1;
    click(ui, ACTION_RETRY);
    require(json_object_equal(last_request, submit), "native retry cannot generate a second effect identity");
    json_object *accepted_reply = json_tokener_parse("{\"ok\":true,\"result\":{\"accepted_locally\":true,"
        "\"consent_digest\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}");
    json_object_object_add(test_field(accepted_reply, "result"), "key", json_object_new_string(value(submit, "key")));
    rock_ui_response(ui, submit, accepted_reply, "");
    require(!ui->retry_request && ui->page == PAGE_MCP_RESULT && !ui->mcp_status,
            "local acceptance opens pending result without inventing completion");
    test_image(ui, "mcp-result-pending");
    ui->page = PAGE_HUB;
    json_object_put(accepted_reply); json_object_put(uncertain); json_object_put(submit);
    json_object_put(preview); json_object_put(prepare); json_object_put(view_reply);
    puts("PASS native MCP selection, confirmation, expiry, epoch, exact retry and pending result");
}
