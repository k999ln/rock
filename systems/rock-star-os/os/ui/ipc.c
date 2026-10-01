#define _GNU_SOURCE
#include "ipc.h"

#include <errno.h>
#include <limits.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/random.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

static int64_t now_ms(void)
{
    struct timespec t;
    if (clock_gettime(CLOCK_MONOTONIC, &t) < 0)
        return -1;
    return (int64_t)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}

static int wait_fd(int fd, short events, int64_t deadline)
{
    struct pollfd p = { .fd = fd, .events = events, .revents = 0 };
    for (;;) {
        int64_t left = deadline - now_ms();
        int n;
        if (left <= 0) {
            errno = ETIMEDOUT;
            return -1;
        }
        n = poll(&p, 1, left > INT_MAX ? INT_MAX : (int)left);
        if (n > 0)
            return 0;
        if (n == 0) {
            errno = ETIMEDOUT;
            return -1;
        }
        if (errno != EINTR)
            return -1;
    }
}

int rock_auth_operation(const char *operation)
{
    return operation && (!strcmp(operation, "auth.create") || !strcmp(operation, "auth.get") ||
                         !strcmp(operation, "auth.status") || !strcmp(operation, "auth.game.connect") ||
                         !strcmp(operation, "auth.game.exchange"));
}

json_object *rock_api_call(const char *socket_path, uid_t expected_uid,
                           json_object *request, char *error, size_t error_size)
{
    struct sockaddr_un addr = { .sun_family = AF_UNIX };
    struct ucred peer;
    socklen_t peer_size = sizeof(peer);
    const char *wire;
    char *buffer = NULL;
    size_t length, sent = 0, used = 0;
    int fd = -1;
    int64_t deadline;
    json_object *response = NULL, *ok = NULL, *operation = NULL;
    json_tokener *parser = NULL;
    if (error_size > 0)
        error[0] = '\0';
    if (!socket_path || !request || strlen(socket_path) >= sizeof(addr.sun_path)) {
        snprintf(error, error_size, "API request or socket path is invalid");
        goto done;
    }
    deadline = now_ms() + 3000;
    if (json_object_is_type(request, json_type_object) &&
        json_object_object_get_ex(request, "op", &operation) && json_object_is_type(operation, json_type_string) &&
        (!strcmp(json_object_get_string(operation), "install") || !strcmp(json_object_get_string(operation), "update") ||
         !strcmp(json_object_get_string(operation), "device.poweroff") || !strcmp(json_object_get_string(operation), "device.reboot")))
        deadline = now_ms() + 15000;
    if (operation && rock_auth_operation(json_object_get_string(operation))) deadline = now_ms() + 8000;
    if (operation && !strncmp(json_object_get_string(operation), "mcp.", 4)) deadline = now_ms() + 8000;
    wire = json_object_to_json_string_ext(request, JSON_C_TO_STRING_PLAIN);
    length = strlen(wire);
    if (length + 1 > ROCK_API_REQUEST_MAX) {
        snprintf(error, error_size, "API request exceeds 256 KiB");
        goto done;
    }
    memcpy(addr.sun_path, socket_path, strlen(socket_path) + 1);
    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0)
        goto system_error;
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        if (errno != EINPROGRESS)
            goto system_error;
        if (wait_fd(fd, POLLOUT, deadline) < 0)
            goto system_error;
        {
            int connected_error = 0;
            socklen_t size = sizeof(connected_error);
            if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &connected_error, &size) < 0)
                goto system_error;
            if (connected_error != 0) {
                errno = connected_error;
                goto system_error;
            }
        }
    }
    if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &peer_size) < 0)
        goto system_error;
    if (peer_size != sizeof(peer) || peer.uid != expected_uid) {
        snprintf(error, error_size, "API peer rejected (expected uid %u)", (unsigned)expected_uid);
        goto done;
    }
    while (sent < length + 1) {
        ssize_t n;
        const char *part = sent < length ? wire + sent : "\n";
        size_t size = sent < length ? length - sent : 1;
        if (wait_fd(fd, POLLOUT, deadline) < 0)
            goto system_error;
        n = send(fd, part, size, MSG_DONTWAIT | MSG_NOSIGNAL);
        if (n < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK))
            continue;
        if (n <= 0)
            goto system_error;
        sent += (size_t)n;
    }
    if (shutdown(fd, SHUT_WR) < 0)
        goto system_error;
    buffer = malloc(ROCK_API_RESPONSE_MAX + 1);
    if (buffer == NULL)
        goto system_error;
    for (;;) {
        ssize_t n;
        char *newline;
        if (used == ROCK_API_RESPONSE_MAX) {
            snprintf(error, error_size, "API response exceeds 1 MiB");
            goto done;
        }
        if (wait_fd(fd, POLLIN, deadline) < 0)
            goto system_error;
        n = recv(fd, buffer + used, ROCK_API_RESPONSE_MAX - used, MSG_DONTWAIT);
        if (n < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK))
            continue;
        if (n < 0)
            goto system_error;
        if (n == 0) {
            snprintf(error, error_size, "API closed without a complete response");
            goto done;
        }
        if (memchr(buffer + used, '\0', (size_t)n) != NULL) {
            snprintf(error, error_size, "API returned an invalid NUL byte");
            goto done;
        }
        used += (size_t)n;
        newline = memchr(buffer, '\n', used);
        if (newline != NULL) {
            if ((size_t)(newline - buffer) != used - 1) {
                snprintf(error, error_size, "API returned more than one response");
                goto done;
            }
            buffer[used - 1] = '\0';
            break;
        }
    }
    parser = json_tokener_new_ex(32);
    if (parser == NULL)
        goto system_error;
    response = json_tokener_parse_ex(parser, buffer, (int)used);
    if (json_tokener_get_error(parser) != json_tokener_success || !response ||
        !json_object_is_type(response, json_type_object) ||
        json_tokener_get_parse_end(parser) != used - 1 ||
        !json_object_object_get_ex(response, "ok", &ok) ||
        !json_object_is_type(ok, json_type_boolean)) {
        if (response)
            json_object_put(response);
        response = NULL;
        snprintf(error, error_size, "API returned an invalid response object");
    }
    goto done;
system_error:
    snprintf(error, error_size, "%s", strerror(errno));
done:
    if (parser)
        json_tokener_free(parser);
    if (fd >= 0)
        close(fd);
    free(buffer);
    return response;
}

int rock_request_key(char *out, size_t size)
{
    unsigned char bytes[16];
    size_t used = 0;
    static const char hex[] = "0123456789abcdef";
    if (size < 36)
        return -1;
    while (used < sizeof(bytes)) {
        ssize_t n = getrandom(bytes + used, sizeof(bytes) - used, 0);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0)
            return -1;
        used += (size_t)n;
    }
    memcpy(out, "ui-", 3);
    for (size_t i = 0; i < sizeof(bytes); i++) {
        out[3 + i * 2] = hex[bytes[i] >> 4];
        out[4 + i * 2] = hex[bytes[i] & 15];
    }
    out[35] = '\0';
    return 0;
}
