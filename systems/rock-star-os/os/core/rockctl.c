#define _GNU_SOURCE
#include "protocol.h"
#include "io.h"

#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>

static int exchange(const char *path, const char *command, const char *input,
                    char *response, size_t capacity)
{
    char header[ROCK_HEADER_SIZE];
    size_t size = input == NULL ? 0 : strlen(input), used = 0;
    int fd;
    int64_t deadline = rock_now_ms() + 5000;
    response[0] = '\0';
    if (size > ROCK_MAX_INPUT) {
        fprintf(stderr, "rockctl: input exceeds 4096 bytes\n");
        return 2;
    }
    if (input != NULL)
        (void)snprintf(header, sizeof(header), "NORMALIZE %zu\n", size);
    else
        (void)snprintf(header, sizeof(header), "%s\n", command);
    fd = rock_connect(path);
    if (fd < 0) {
        perror("rockctl: connect");
        return 1;
    }
    {
        struct ucred peer;
        socklen_t peer_size = sizeof(peer);
        if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &peer_size) < 0 ||
            peer_size != sizeof(peer) || peer.uid != ROCK_UID) {
            fprintf(stderr, "rockctl: service must have uid=1000\n");
            close(fd);
            return 1;
        }
    }
    /* A denied peer can receive an error before its request has been sent. */
    (void)rock_send(fd, header, strlen(header), deadline);
    if (size > 0)
        (void)rock_send(fd, input, size, deadline);
    (void)shutdown(fd, SHUT_WR);
    for (;;) {
        ssize_t n;
        if (used + 1 == capacity) {
            fprintf(stderr, "rockctl: response limit exceeded\n");
            close(fd);
            return 1;
        }
        n = rock_read(fd, response + used, capacity - used - 1, deadline);
        if (n < 0) {
            if (used > 0 && errno == ECONNRESET)
                break;
            perror("rockctl: response");
            close(fd);
            return 1;
        }
        if (n == 0)
            break;
        used += (size_t)n;
    }
    close(fd);
    response[used] = '\0';
    if (strncmp(response, "ERR FORBIDDEN\n", 14) == 0)
        return 3;
    if (strncmp(response, "ERR ", 4) == 0)
        return 4;
    if (strncmp(response, "OK ", 3) != 0) {
        fprintf(stderr, "rockctl: invalid or empty response\n");
        return 1;
    }
    return 0;
}

static int self_test(const char *path)
{
    char response[ROCK_RESPONSE_SIZE] = { 0 };
    uint64_t before, after;
    char *counter;
    int result = exchange(path, "STATUS", NULL, response, sizeof(response));
    if (result != 0) {
        fputs(response, stderr);
        return result;
    }
    counter = strstr(response, " completed=");
    if (counter == NULL || sscanf(counter, " completed=%" SCNu64, &before) != 1 ||
        strstr(response, "product=Rock_star_os service=rockd version=" ROCK_VERSION) == NULL ||
        strstr(response, " uid=1000 no_new_privs=1 ") == NULL)
        return 1;
    result = exchange(path, "NORMALIZE", "  ROCK\tStar\r\nOS  ", response, sizeof(response));
    if (result != 0) {
        fputs(response, stderr);
        return result;
    }
    if (sscanf(response, "OK NORMALIZE completed=%" SCNu64, &after) != 1 ||
        after != before + 1 || strstr(response, " bytes=12\nrock star os\n") == NULL)
        return 1;
    result = exchange(path, "STATUS", NULL, response, sizeof(response));
    counter = strstr(response, " completed=");
    if (result != 0 || counter == NULL ||
        sscanf(counter, " completed=%" SCNu64, &before) != 1 || before != after)
        return 1;
    printf("PASS rockctl self-test completed=%" PRIu64 "\n", after);
    return 0;
}

int main(int argc, char **argv)
{
    const char *socket_path = ROCK_SOCKET;
    char response[ROCK_RESPONSE_SIZE] = { 0 };
    int arg = 1, result;
    if (argc > 2 && strcmp(argv[arg], "--socket") == 0) {
        socket_path = argv[arg + 1];
        arg += 2;
    }
    if (argc == arg + 1 && strcmp(argv[arg], "self-test") == 0)
        return self_test(socket_path);
    if (argc == arg + 1 && strcmp(argv[arg], "status") == 0)
        result = exchange(socket_path, "STATUS", NULL, response, sizeof(response));
    else if (argc == arg + 2 && strcmp(argv[arg], "normalize") == 0)
        result = exchange(socket_path, "NORMALIZE", argv[arg + 1], response, sizeof(response));
    else {
        fprintf(stderr, "usage: rockctl [--socket PATH] status | normalize TEXT | self-test\n");
        return 2;
    }
    fputs(response, result == 0 ? stdout : stderr);
    return result;
}
