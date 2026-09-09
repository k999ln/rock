#define _GNU_SOURCE
#include "protocol.h"
#include "io.h"

#include <fcntl.h>
#include <inttypes.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/file.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/utsname.h>

static volatile sig_atomic_t stopping;
static int state_fd = -1;
static uint64_t completed;

static void stop_signal(int sig)
{
    (void)sig;
    stopping = 1;
}

static int owned_file(int fd)
{
    struct stat st;
    if (fstat(fd, &st) < 0)
        return -1;
    if (!S_ISREG(st.st_mode) || st.st_uid != ROCK_UID || st.st_gid != ROCK_GID ||
        st.st_nlink != 1 || (st.st_mode & 077) != 0) {
        errno = EPERM;
        return -1;
    }
    return 0;
}

static int open_directory(const char *path, mode_t forbidden)
{
    struct stat st;
    int fd = open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0)
        return -1;
    if (fstat(fd, &st) < 0 || st.st_uid != ROCK_UID || st.st_gid != ROCK_GID ||
        (st.st_mode & forbidden) != 0) {
        close(fd);
        errno = EPERM;
        return -1;
    }
    return fd;
}

/* No successful reply is sent before both the file and its rename are synced. */
static int save_counter(uint64_t next)
{
    char text[32];
    int size = snprintf(text, sizeof(text), "%" PRIu64 "\n", next);
    int fd = openat(state_fd, "counter.tmp", O_WRONLY | O_CREAT | O_EXCL |
                    O_NOFOLLOW | O_CLOEXEC, 0600);
    size_t used = 0;
    if (fd < 0)
        return -1;
    while (used < (size_t)size) {
        ssize_t n = write(fd, text + used, (size_t)size - used);
        if (n < 0 && errno == EINTR)
            continue;
        if (n <= 0)
            goto fail;
        used += (size_t)n;
    }
    if (fsync(fd) < 0)
        goto fail;
    if (close(fd) < 0)
        return -1;
    if (renameat(state_fd, "counter.tmp", state_fd, "counter") < 0 ||
        fsync(state_fd) < 0)
        return -1;
    completed = next;
    return 0;
fail:
    {
        int saved = errno;
        close(fd);
        errno = saved;
    }
    return -1;
}

static int load_state(void)
{
    char buf[32];
    struct stat st;
    ssize_t n;
    int fd;
    if (fstatat(state_fd, "counter.tmp", &st, AT_SYMLINK_NOFOLLOW) == 0) {
        if (!S_ISREG(st.st_mode) || st.st_uid != ROCK_UID || st.st_gid != ROCK_GID ||
            st.st_nlink != 1 || (st.st_mode & 077) != 0) {
            errno = EPERM;
            return -1;
        }
        if (unlinkat(state_fd, "counter.tmp", 0) < 0)
            return -1;
    } else if (errno != ENOENT) {
        return -1;
    }
    fd = openat(state_fd, "counter", O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0)
        return errno == ENOENT ? save_counter(0) : -1;
    if (owned_file(fd) < 0 || fstat(fd, &st) < 0) {
        close(fd);
        return -1;
    }
    do {
        n = read(fd, buf, sizeof(buf));
    } while (n < 0 && errno == EINTR);
    close(fd);
    if (n < 2 || n != st.st_size || n >= (ssize_t)sizeof(buf) || buf[n - 1] != '\n') {
        errno = EINVAL;
        return -1;
    }
    completed = 0;
    for (ssize_t i = 0; i < n - 1; i++) {
        unsigned digit = (unsigned char)buf[i] - (unsigned)'0';
        if (digit > 9 || completed > (UINT64_MAX - digit) / 10) {
            errno = EINVAL;
            return -1;
        }
        completed = completed * 10 + digit;
    }
    return 0;
}

static void reply(int fd, const char *text)
{
    (void)rock_send(fd, text, strlen(text), rock_now_ms() + ROCK_TIMEOUT_MS);
}

static void read_error(int fd, ssize_t n)
{
    reply(fd, n < 0 && errno == ETIMEDOUT ? "ERR TIMEOUT\n" : "ERR FRAME\n");
}

static int is_space(unsigned char c)
{
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f';
}

static void handle_client(int fd, const char *architecture)
{
    struct ucred peer;
    socklen_t peer_size = sizeof(peer);
    char header[ROCK_HEADER_SIZE];
    unsigned char input[ROCK_MAX_INPUT];
    char output[ROCK_MAX_INPUT + 1];
    char response[ROCK_RESPONSE_SIZE];
    int64_t deadline = rock_now_ms() + ROCK_TIMEOUT_MS;
    size_t used = 0, count = 0, result_size = 0;
    int normalize = 0, pending_space = 0;
    ssize_t n;
    unsigned char extra;

    if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &peer_size) < 0 ||
        peer_size != sizeof(peer) || (peer.uid != 0 && peer.uid != ROCK_UID)) {
        reply(fd, "ERR FORBIDDEN\n");
        return;
    }
    for (;;) {
        char c;
        n = rock_read(fd, &c, 1, deadline);
        if (n <= 0) {
            read_error(fd, n);
            return;
        }
        if (c == '\n')
            break;
        if (used + 1 >= sizeof(header)) {
            reply(fd, "ERR LIMIT\n");
            return;
        }
        if ((unsigned char)c < 32 || (unsigned char)c > 126) {
            reply(fd, "ERR FRAME\n");
            return;
        }
        header[used++] = c;
    }
    header[used] = '\0';
    if (strcmp(header, "STATUS") != 0) {
        const char *p;
        if (strncmp(header, "NORMALIZE ", 10) != 0 || header[10] == '\0') {
            reply(fd, "ERR COMMAND\n");
            return;
        }
        normalize = 1;
        for (p = header + 10; *p; p++) {
            unsigned digit = (unsigned char)*p - (unsigned)'0';
            if (digit > 9) {
                reply(fd, "ERR FRAME\n");
                return;
            }
            if (count > (ROCK_MAX_INPUT - digit) / 10) {
                reply(fd, "ERR LIMIT\n");
                return;
            }
            count = count * 10 + digit;
        }
        used = 0;
        while (used < count) {
            n = rock_read(fd, input + used, count - used, deadline);
            if (n <= 0) {
                read_error(fd, n);
                return;
            }
            used += (size_t)n;
        }
    }
    n = rock_read(fd, &extra, 1, deadline);
    if (n != 0) {
        if (n < 0)
            read_error(fd, n);
        else
            reply(fd, "ERR FRAME\n");
        return;
    }
    if (!normalize) {
        (void)snprintf(response, sizeof(response),
                       "OK STATUS product=Rock_star_os service=rockd version=" ROCK_VERSION
                       " architecture=%s uid=%u no_new_privs=1 completed=%" PRIu64 "\n",
                       architecture, (unsigned)geteuid(), completed);
        reply(fd, response);
        return;
    }
    for (size_t i = 0; i < count; i++) {
        unsigned char c = input[i];
        if (is_space(c)) {
            if (result_size > 0)
                pending_space = 1;
            continue;
        }
        if (c < 32 || c == 127) {
            reply(fd, "ERR TEXT\n");
            return;
        }
        if (pending_space) {
            output[result_size++] = ' ';
            pending_space = 0;
        }
        output[result_size++] = (char)(c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c);
    }
    output[result_size] = '\0';
    if (completed == UINT64_MAX) {
        reply(fd, "ERR EXHAUSTED\n");
        return;
    }
    if (save_counter(completed + 1) < 0) {
        perror("rockd: persist counter");
        reply(fd, "ERR STORAGE\n");
        stopping = 2;
        return;
    }
    (void)snprintf(response, sizeof(response),
                   "OK NORMALIZE completed=%" PRIu64 " bytes=%zu\n%s\n",
                   completed, result_size, output);
    reply(fd, response);
}

int main(int argc, char **argv)
{
    const char *socket_path = ROCK_SOCKET, *state_path = ROCK_STATE_DIR;
    char parent[sizeof(((struct sockaddr_un *)0)->sun_path)];
    char *base;
    struct sockaddr_un addr = { .sun_family = AF_UNIX };
    struct utsname system_info;
    struct stat st;
    struct sigaction action = { .sa_handler = stop_signal };
    int listener = -1, socket_dir = -1, lock_fd = -1, bound = 0, result = 1;
    for (int i = 1; i < argc; i++) {
        if (i + 1 < argc && strcmp(argv[i], "--socket") == 0)
            socket_path = argv[++i];
        else if (i + 1 < argc && strcmp(argv[i], "--state-dir") == 0)
            state_path = argv[++i];
        else {
            fprintf(stderr, "usage: rockd [--socket PATH] [--state-dir PATH]\n");
            return 2;
        }
    }
    if (getuid() != ROCK_UID || geteuid() != ROCK_UID || getgid() != ROCK_GID ||
        getegid() != ROCK_GID) {
        fprintf(stderr, "rockd: must run as uid=1000 gid=1000; root is refused\n");
        return 1;
    }
    {
        gid_t groups[64];
        int count = getgroups(64, groups);
        if (count < 0) {
            perror("rockd: supplementary groups");
            return 1;
        }
        for (int i = 0; i < count; i++) {
            if (groups[i] != ROCK_GID) {
                fprintf(stderr, "rockd: supplementary groups must be empty or gid=1000\n");
                return 1;
            }
        }
    }
    if (socket_path[0] != '/' || state_path[0] != '/' ||
        strlen(socket_path) >= sizeof(addr.sun_path)) {
        fprintf(stderr, "rockd: absolute paths required; socket path too long or invalid\n");
        return 2;
    }
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0 ||
        prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) < 0 || uname(&system_info) < 0) {
        perror("rockd: process restrictions");
        return 1;
    }
    umask(0077);
    (void)sigemptyset(&action.sa_mask);
    if (sigaction(SIGTERM, &action, NULL) < 0 || sigaction(SIGINT, &action, NULL) < 0) {
        perror("rockd: signal handler");
        return 1;
    }
    state_fd = open_directory(state_path, 0077);
    if (state_fd < 0)
        goto fail;
    lock_fd = openat(state_fd, "lock", O_RDWR | O_CREAT | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (lock_fd < 0 || owned_file(lock_fd) < 0 || flock(lock_fd, LOCK_EX | LOCK_NB) < 0 ||
        load_state() < 0)
        goto fail;
    memcpy(parent, socket_path, strlen(socket_path) + 1);
    base = strrchr(parent, '/');
    if (base == NULL || base == parent || base[1] == '\0') {
        errno = EINVAL;
        goto fail;
    }
    *base++ = '\0';
    socket_dir = open_directory(parent, 0022);
    if (socket_dir < 0)
        goto fail;
    if (fstatat(socket_dir, base, &st, AT_SYMLINK_NOFOLLOW) == 0) {
        int probe;
        if (!S_ISSOCK(st.st_mode) || st.st_uid != ROCK_UID || st.st_gid != ROCK_GID) {
            errno = EPERM;
            goto fail;
        }
        probe = rock_connect(socket_path);
        if (probe >= 0) {
            close(probe);
            errno = EADDRINUSE;
            goto fail;
        }
        if (errno != ECONNREFUSED || unlinkat(socket_dir, base, 0) < 0)
            goto fail;
    } else if (errno != ENOENT) {
        goto fail;
    }
    listener = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (listener < 0)
        goto fail;
    memcpy(addr.sun_path, socket_path, strlen(socket_path) + 1);
    if (bind(listener, (struct sockaddr *)&addr, sizeof(addr)) < 0)
        goto fail;
    bound = 1;
    if (fchmodat(socket_dir, base, 0660, 0) < 0 || listen(listener, 16) < 0)
        goto fail;
    fprintf(stdout, "rockd " ROCK_VERSION " ready uid=1000 architecture=%s completed=%" PRIu64 "\n",
            system_info.machine, completed);
    fflush(stdout);
    while (!stopping) {
        struct pollfd pending = { .fd = listener, .events = POLLIN, .revents = 0 };
        int ready = poll(&pending, 1, 200);
        int client;
        if (ready == 0 || (ready < 0 && errno == EINTR))
            continue;
        if (ready < 0)
            goto fail;
        if (stopping)
            break;
        client = accept4(listener, NULL, NULL, SOCK_CLOEXEC | SOCK_NONBLOCK);
        if (client < 0) {
            if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)
                continue;
            goto fail;
        }
        handle_client(client, system_info.machine);
        close(client);
    }
    result = stopping == 2 ? 1 : 0;
    goto cleanup;
fail:
    perror("rockd: startup or accept");
cleanup:
    if (listener >= 0)
        close(listener);
    if (bound)
        (void)unlinkat(socket_dir, base, 0);
    if (socket_dir >= 0)
        close(socket_dir);
    if (lock_fd >= 0)
        close(lock_fd);
    if (state_fd >= 0)
        close(state_fd);
    return result;
}
