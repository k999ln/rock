#define _GNU_SOURCE
#include "ui.h"
#include "ipc.h"
#include "device.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <time.h>
#include <unistd.h>

struct api_worker {
    pthread_t thread;
    pthread_mutex_t mutex;
    int started, done;
    const char *socket_path;
    uid_t expected_uid;
    json_object *request, *response;
    char error[256];
};

static volatile sig_atomic_t stopping;

static void stop_signal(int signal_number)
{
    (void)signal_number;
    stopping = 1;
}

static int64_t now_ms(void)
{
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) < 0) return 0;
    return (int64_t)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}

static void *worker_main(void *opaque)
{
    struct api_worker *worker = opaque;
    json_object *operation = NULL;
    json_object_object_get_ex(worker->request, "op", &operation);
    int local_auth = rock_auth_operation(operation ? json_object_get_string(operation) : NULL);
    json_object *response = rock_api_call(local_auth ? ROCK_AUTH_SOCKET : worker->socket_path,
                                           local_auth ? ROCK_AUTH_UID : worker->expected_uid,
                                           worker->request, worker->error, sizeof(worker->error));
    /* PIN is never retained in retry/receipt objects or sent to Platform. */
    if (local_auth) json_object_object_del(worker->request, "pin");
    pthread_mutex_lock(&worker->mutex);
    worker->response = response;
    worker->done = 1;
    pthread_mutex_unlock(&worker->mutex);
    return NULL;
}

static int submit(void *opaque, json_object *request)
{
    struct api_worker *worker = opaque;
    if (worker->started) return -1;
    worker->request = json_object_get(request);
    worker->response = NULL;
    worker->error[0] = '\0';
    worker->done = 0;
    if (pthread_create(&worker->thread, NULL, worker_main, worker) != 0) {
        json_object_put(worker->request);
        worker->request = NULL;
        return -1;
    }
    worker->started = 1;
    return 0;
}

static int collect(struct api_worker *worker, struct rock_ui *ui)
{
    int done;
    int mutation;
    if (!worker->started) return 0;
    pthread_mutex_lock(&worker->mutex);
    done = worker->done;
    pthread_mutex_unlock(&worker->mutex);
    if (!done) return 0;
    pthread_join(worker->thread, NULL);
    mutation = !rock_ui_request_is_read(worker->request);
    rock_ui_response(ui, worker->request, worker->response, worker->error);
    json_object_put(worker->request);
    if (worker->response) json_object_put(worker->response);
    worker->request = NULL;
    worker->response = NULL;
    worker->started = 0;
    worker->done = 0;
    return mutation ? 2 : 1;
}

static enum rock_page parse_page(const char *name)
{
    static const char *names[] = { "hub", "installed", "history", "wallet", "detail", "editor", "result", "system",
                                   "remote", "remote-result", "remote-history", "atm", "atm-status", "auth", "activation",
                                   "mcp", "mcp-tool", "mcp-result" };
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if (!strcmp(name, names[i])) return (enum rock_page)i;
    return (enum rock_page)-1;
}

static int read_text_file(const char *path, char *out, size_t capacity)
{
    int fd = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    size_t used = 0;
    if (fd < 0) return -1;
    while (used < capacity) {
        ssize_t n = read(fd, out + used, capacity - used);
        if (n < 0 && errno == EINTR) continue;
        if (n < 0) { close(fd); return -1; }
        if (n == 0) break;
        used += (size_t)n;
    }
    close(fd);
    if (used >= capacity || memchr(out, '\0', used)) return -1;
    out[used] = '\0';
    return 0;
}

static void usage(void)
{
    fputs("usage: rock-ui [--socket PATH] [--framebuffer /dev/fb0]\n"
          "               [--input '/dev/input/event*'] [--font PATH]\n"
          "       rock-ui --screenshot FILE.png [--size 720x960] [--page PAGE]\n"
          "               [--tool ID] [--job ID] [--text-file PATH] [--scroll PIXELS]\n"
          "               [--wallet-tests] [--socket PATH] [--font PATH]\n"
          "               [--test-backend-uid UID]\n", stderr);
}

int main(int argc, char **argv)
{
    const char *socket_path = ROCK_API_SOCKET, *framebuffer_path = "/dev/fb0";
    const char *input_pattern = "/dev/input/event*", *font_path = ROCK_UI_FONT;
    const char *screenshot = NULL, *tool = "", *selected_job = "", *text_file = NULL;
    int width = ROCK_UI_WIDTH, height = ROCK_UI_HEIGHT, wallet_tests = 0, test_uid_set = 0;
    double initial_scroll = 0;
    uid_t backend_uid = ROCK_API_UID;
    enum rock_page initial_page = PAGE_HUB;
    struct rock_fb fb;
    struct rock_input inputs[ROCK_INPUT_MAX];
    struct rock_ui ui;
    struct api_worker worker;
    char error[256];
    int count = 0, result = 1, dirty = 1;
    int64_t next_refresh;
    time_t last_clock_tick = (time_t)-1;
    memset(&fb, 0, sizeof(fb));
    fb.fd = -1;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--wallet-tests")) { wallet_tests = 1; continue; }
        if (i + 1 >= argc) { usage(); return 2; }
        const char *option = argv[i], *value = argv[++i];
        if (!strcmp(option, "--socket")) socket_path = value;
        else if (!strcmp(option, "--framebuffer")) framebuffer_path = value;
        else if (!strcmp(option, "--input")) input_pattern = value;
        else if (!strcmp(option, "--font")) font_path = value;
        else if (!strcmp(option, "--screenshot")) screenshot = value;
        else if (!strcmp(option, "--tool")) tool = value;
        else if (!strcmp(option, "--job")) selected_job = value;
        else if (!strcmp(option, "--text-file")) text_file = value;
        else if (!strcmp(option, "--page")) {
            initial_page = parse_page(value);
            if ((int)initial_page < 0) { usage(); return 2; }
        } else if (!strcmp(option, "--size")) {
            char extra;
            if (sscanf(value, "%dx%d%c", &width, &height, &extra) != 2 ||
                width < 320 || height < 320 || width > 4096 || height > 4096) {
                usage(); return 2;
            }
        } else if (!strcmp(option, "--scroll")) {
            char *end;
            initial_scroll = strtod(value, &end);
            if (*end || initial_scroll < 0 || initial_scroll > 1000000) { usage(); return 2; }
        } else if (!strcmp(option, "--test-backend-uid")) {
            char *end;
            unsigned long uid = strtoul(value, &end, 10);
            if (!*value || *end || uid > UINT_MAX) { usage(); return 2; }
            backend_uid = (uid_t)uid;
            test_uid_set = 1;
        } else { usage(); return 2; }
    }
    if (!screenshot && (getuid() != 1000 || geteuid() != 1000)) {
        fputs("rock-ui: framebuffer mode must run as uid 1000\n", stderr);
        return 1;
    }
    if (test_uid_set && !screenshot) {
        fputs("rock-ui: --test-backend-uid is restricted to explicit screenshot tests\n", stderr);
        return 2;
    }
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0) {
        perror("rock-ui: no_new_privs");
        return 1;
    }
    if (!screenshot) {
        if (rock_fb_open(&fb, framebuffer_path, error, sizeof(error)) < 0) {
            fprintf(stderr, "rock-ui: framebuffer: %s\n", error);
            return 1;
        }
        width = fb.width;
        height = fb.height;
    }
    memset(&worker, 0, sizeof(worker));
    worker.socket_path = socket_path;
    worker.expected_uid = backend_uid;
    if (pthread_mutex_init(&worker.mutex, NULL) != 0) {
        fputs("rock-ui: worker initialization failed\n", stderr);
        rock_fb_close(&fb);
        return 1;
    }
    if (rock_ui_init(&ui, width, height, font_path, submit, &worker, error, sizeof(error)) < 0) {
        fprintf(stderr, "rock-ui: %s\n", error);
        pthread_mutex_destroy(&worker.mutex);
        rock_fb_close(&fb);
        return 1;
    }
    ui.page = initial_page;
    ui.wallet_expanded = wallet_tests;
    snprintf(ui.selected_id, sizeof(ui.selected_id), "%s", tool);
    snprintf(ui.selected_job, sizeof(ui.selected_job), "%s", selected_job);
    if (text_file && read_text_file(text_file, ui.text, sizeof(ui.text)) < 0) {
        fprintf(stderr, "rock-ui: input file cannot be read or exceeds 4096 bytes\n");
        goto done;
    }
    if (screenshot) {
        json_object *request = json_object_new_object(), *response;
        json_object_object_add(request, "v", json_object_new_int(1));
        json_object_object_add(request, "op", json_object_new_string("snapshot"));
        response = rock_api_call(socket_path, backend_uid, request, error, sizeof(error));
        rock_ui_response(&ui, request, response, error);
        if (response) json_object_put(response);
        json_object_put(request);
        rock_ui_draw(&ui);
        rock_ui_scroll(&ui, initial_scroll);
        rock_ui_draw(&ui);
        if (cairo_status(ui.cr) != CAIRO_STATUS_SUCCESS ||
            cairo_surface_write_to_png(ui.surface, screenshot) != CAIRO_STATUS_SUCCESS) {
            fprintf(stderr, "rock-ui: screenshot rendering failed: %s\n", cairo_status_to_string(cairo_status(ui.cr)));
            goto done;
        }
        printf("rock-ui native Cairo screenshot: %s; backend=%s\n", screenshot, ui.connected ? "connected" : "unavailable");
        result = ui.connected ? 0 : 3;
        goto done;
    }
    {
        struct sigaction action = { .sa_handler = stop_signal };
        sigemptyset(&action.sa_mask);
        if (sigaction(SIGTERM, &action, NULL) < 0 || sigaction(SIGINT, &action, NULL) < 0) {
            perror("rock-ui: signals");
            goto done;
        }
    }
    count = rock_inputs_open(inputs, ROCK_INPUT_MAX, input_pattern);
    fprintf(stdout, "rock-ui native framebuffer %dx%d, uid=%u, input_devices=%d\n", width, height, (unsigned)geteuid(), count);
    if (count == 0) fprintf(stderr, "rock-ui: no readable evdev input nodes; check init ownership\n");
    fflush(stdout);
    next_refresh = 0;
    while (!stopping) {
        struct pollfd polls[ROCK_INPUT_MAX];
        int update = collect(&worker, &ui);
        int64_t now = now_ms();
        if (update) {
            dirty = 1;
            if (update == 2) next_refresh = 0;
        }
        if (!ui.busy && ui.queued_request) {
            rock_ui_flush_queued(&ui);
            dirty = 1;
        }
        if (!ui.busy && now >= next_refresh) {
            rock_ui_refresh(&ui);
            next_refresh = now + rock_ui_refresh_interval(&ui);
        }
        /* Minute-only clock does not repaint the full framebuffer every second.
         * Authentication and ATM expiry still update at one-second resolution. */
        time_t wall_now = time(NULL);
        time_t clock_tick = ui.page == PAGE_AUTH_PIN || ui.page == PAGE_ATM_STATUS ? wall_now : wall_now / 60;
        if (clock_tick != last_clock_tick) { dirty = 1; last_clock_tick = clock_tick; }
        if (dirty) {
            rock_ui_draw(&ui);
            if (cairo_status(ui.cr) != CAIRO_STATUS_SUCCESS || rock_fb_present(&fb, ui.surface) < 0) {
                fprintf(stderr, "rock-ui: rendering failed: %s\n", cairo_status_to_string(cairo_status(ui.cr)));
                goto done;
            }
            dirty = 0;
        }
        for (int i = 0; i < count; i++) polls[i] = (struct pollfd){ .fd = inputs[i].fd, .events = POLLIN, .revents = 0 };
        /* Input wakes poll immediately. Short polling is only needed while an
         * owned background response is outstanding. */
        int ready = poll(polls, (nfds_t)count, ui.busy ? 16 : 250);
        if (ready < 0 && errno != EINTR) { perror("rock-ui: input poll"); goto done; }
        if (ready <= 0) continue;
        for (int i = 0; i < count; i++) {
            if (!(polls[i].revents & POLLIN)) continue;
            struct input_event events[32];
            ssize_t bytes = read(inputs[i].fd, events, sizeof(events));
            if (bytes <= 0) continue;
            for (size_t e = 0; e < (size_t)bytes / sizeof(events[0]); e++) {
                struct input_event *event = &events[e];
                struct rock_input_frame frame;
                enum rock_page previous_page = ui.page;
                if (event->type == EV_SYN && event->code == SYN_DROPPED) {
                    ui.shift = 0;
                    ui.control = 0;
                    ui.dragged = 1;
                }
                if (rock_input_feed(&inputs[i], event, width, height, &frame)) {
                    if (frame.state == 0 && frame.moved && ui.pointer_down)
                        rock_ui_pointer(&ui, frame.x, frame.y, -1);
                    rock_ui_pointer(&ui, frame.x, frame.y, frame.state);
                    if (frame.wheel) rock_ui_scroll(&ui, -frame.wheel * 92.0);
                    dirty = 1;
                }
                if (event->type == EV_KEY && event->code < BTN_MISC && !inputs[i].dropped) {
                    rock_ui_key(&ui, event->code, event->value);
                    dirty = 1;
                }
                if (ui.page != previous_page) next_refresh = 0;
            }
        }
    }
    result = 0;
done:
    if (worker.started) {
        pthread_join(worker.thread, NULL);
        if (worker.request) json_object_put(worker.request);
        if (worker.response) json_object_put(worker.response);
    }
    rock_inputs_close(inputs, (size_t)count);
    rock_ui_destroy(&ui);
    pthread_mutex_destroy(&worker.mutex);
    rock_fb_close(&fb);
    return result;
}
