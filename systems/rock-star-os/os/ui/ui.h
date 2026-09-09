#ifndef ROCK_UI_UI_H
#define ROCK_UI_UI_H
#include <cairo/cairo.h>
#include <cairo/cairo-ft.h>
#include <ft2build.h>
#include FT_FREETYPE_H
#include <json-c/json.h>
#include <stddef.h>
#include <stdint.h>

#define ROCK_UI_WIDTH 720
#define ROCK_UI_HEIGHT 960
#define ROCK_UI_TEXT_MAX 4096
#define ROCK_UI_SEARCH_MAX 128
#define ROCK_UI_HITS 256
#define ROCK_UI_FONT "/usr/share/fonts/rock/NotoSansCJKjp-Regular.otf"

enum rock_page { PAGE_HUB, PAGE_INSTALLED, PAGE_HISTORY, PAGE_WALLET, PAGE_DETAIL, PAGE_EDITOR, PAGE_RESULT, PAGE_SYSTEM,
                 PAGE_REMOTE, PAGE_REMOTE_RESULT, PAGE_REMOTE_HISTORY, PAGE_ATM, PAGE_ATM_STATUS, PAGE_AUTH_PIN, PAGE_ACTIVATION,
                 PAGE_MCP, PAGE_MCP_TOOL, PAGE_MCP_RESULT };
enum rock_action {
    ACTION_NONE, ACTION_NAV, ACTION_DETAIL, ACTION_EDITOR, ACTION_RESULT, ACTION_REFRESH,
    ACTION_INSTALL, ACTION_APPROVE, ACTION_UPDATE, ACTION_ROLLBACK, ACTION_UNINSTALL,
    ACTION_RUN, ACTION_CANCEL, ACTION_INPUT, ACTION_CLEAR, ACTION_SAMPLE, ACTION_RETRY,
    ACTION_WALLET_EXPAND, ACTION_AMOUNT, ACTION_CONSENT, ACTION_SALE, ACTION_SETTLE,
    ACTION_BILL, ACTION_RESERVE, ACTION_DISPENSE, ACTION_UNKNOWN, ACTION_RECONCILE,
    ACTION_CONFIRM, ACTION_DISMISS, ACTION_REGISTRY_REFRESH, ACTION_SEARCH, ACTION_SEARCH_CLEAR,
    ACTION_WALLET_REGISTER, ACTION_SYSTEM, ACTION_POWEROFF, ACTION_REBOOT,
    ACTION_REMOTE_OPEN, ACTION_REMOTE_PREPARE, ACTION_REMOTE_SUBMIT, ACTION_REMOTE_CANCEL,
    ACTION_REMOTE_RESULT, ACTION_REMOTE_HISTORY, ACTION_REMOTE_STATUS, ACTION_REMOTE_NEW,
    ACTION_ATM_OPEN, ACTION_ATM_ISSUE, ACTION_ATM_RESULT, ACTION_ATM_STATUS, ACTION_ATM_CANCEL, ACTION_ATM_CODE,
    ACTION_AUTH_BEGIN, ACTION_AUTH_PIN, ACTION_AUTH_SIGN, ACTION_AUTH_BACK, ACTION_WALLET_TERMS, ACTION_DEVICE_ACTIVATE,
    ACTION_MCP_OPEN, ACTION_MCP_CONNECT, ACTION_MCP_DISCONNECT, ACTION_MCP_TOOL, ACTION_MCP_PREPARE,
    ACTION_MCP_SUBMIT, ACTION_MCP_RESULT, ACTION_MCP_RECONCILE, ACTION_MCP_EDIT
};

struct rock_hit {
    double x, y, w, h;
    enum rock_action action;
    int number;
    char id[201], version[80];
    int enabled;
};

struct rock_ui {
    cairo_surface_t *surface;
    cairo_t *cr;
    FT_Library ft;
    FT_Face face, bold_face;
    cairo_font_face_t *font, *bold;
    int width, height;
    double scale, offset_x, offset_y;
    enum rock_page page;
    enum rock_page return_page, system_return_page;
    json_object *snapshot, *retry_request, *confirm_request, *power_receipt, *queued_request;
    json_object *remote_prepared, *remote_status;
    char remote_text[ROCK_UI_TEXT_MAX + 1], remote_key[129];
    int remote_poll;
    json_object *mcp_view, *mcp_prepared, *mcp_status;
    char mcp_alias[129], mcp_key[129], mcp_text[ROCK_UI_TEXT_MAX + 1];
    json_object *atm_history, *atm_status, *atm_issue;
    char atm_selected[40];
    int atm_code_visible, atm_poll;
    json_object *wallet_auth, *auth_challenge, *atm_quote;
    char auth_pin[5], auth_local_key[40], auth_wallet_key[40];
    int auth_mode, auth_poll;
    char selected_id[201], selected_version[80], selected_job[201];
    char text[ROCK_UI_TEXT_MAX + 1], amount[32], search[ROCK_UI_SEARCH_MAX + 1];
    char message[512], connection_error[256], confirm_title[160];
    int connected, busy, busy_read, message_error, wallet_expanded, shift, control, caps_lock, activation_seen;
    int refresh_background, startup_waiting, startup_retry_ms;
    int64_t refresh_due_ms, startup_wait_ms;
    int focus, hit_count, editing, select_all;
    struct rock_hit hits[ROCK_UI_HITS];
    double scroll, content_height, content_top;
    int pointer_x, pointer_y, pointer_visible, pointer_down, dragged;
    int press_x, press_y;
    double press_scroll;
    int (*submit)(void *, json_object *);
    void *submit_context;
};

int rock_ui_init(struct rock_ui *ui, int width, int height, const char *font_path,
                 int (*submit)(void *, json_object *), void *context,
                 char *error, size_t size);
void rock_ui_destroy(struct rock_ui *ui);
void rock_ui_draw(struct rock_ui *ui);
void rock_ui_response(struct rock_ui *ui, json_object *request, json_object *response, const char *error);
void rock_ui_key(struct rock_ui *ui, unsigned code, int value);
void rock_ui_pointer(struct rock_ui *ui, int x, int y, int state);
void rock_ui_scroll(struct rock_ui *ui, double amount);
int rock_ui_text(struct rock_ui *ui, const char *text);
void rock_ui_refresh(struct rock_ui *ui);
void rock_ui_flush_queued(struct rock_ui *ui);
int rock_ui_request_is_read(json_object *request);
int rock_ui_refresh_interval(struct rock_ui *ui);
int rock_ui_poll(struct rock_ui *ui, int64_t now_ms);
void rock_ui_poll_completed(struct rock_ui *ui, int64_t now_ms, int mutation);
void rock_ui_poll_reset(struct rock_ui *ui);
#endif
