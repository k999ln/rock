#define _GNU_SOURCE
#include "protocol.h"
#include "io.h"

#include <fcntl.h>
#include <grp.h>
#include <inttypes.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/wait.h>

static char test_dir[] = "/tmp/rock-core-test.XXXXXX";
static char socket_path[108], state_path[108], counter_path[128], temp_path[128];
static char lock_path[128], log_path[128];
static pid_t daemon_pid = -1;
static const char *daemon_path, *client_path;

#define REQUEST(literal, expected) request(literal, sizeof(literal) - 1, expected)

static void cleanup(void)
{
    if (daemon_pid > 0) {
        kill(daemon_pid, SIGKILL);
        (void)waitpid(daemon_pid, NULL, 0);
    }
    /* Only these exact files in our newly-created temporary directory. */
    (void)unlink(socket_path);
    (void)unlink(counter_path);
    (void)unlink(temp_path);
    (void)unlink(lock_path);
    (void)unlink(log_path);
    (void)rmdir(state_path);
    (void)rmdir(test_dir);
}

static void fail(const char *message)
{
    fprintf(stderr, "FAIL %s (errno=%d: %s)\n", message, errno, strerror(errno));
    exit(1);
}

static void require(int value, const char *message)
{
    if (!value)
        fail(message);
}

static void pause_ms(long milliseconds)
{
    struct timespec delay = { .tv_sec = milliseconds / 1000,
                             .tv_nsec = (milliseconds % 1000) * 1000000 };
    while (nanosleep(&delay, &delay) < 0 && errno == EINTR) { }
}

static void assume_uid(uid_t uid)
{
    if (setgroups(0, NULL) < 0 || setgid(uid) < 0 || setuid(uid) < 0)
        _exit(98);
}

static int child_exit(pid_t pid)
{
    int status;
    for (int i = 0; i < 100; i++) {
        pid_t result = waitpid(pid, &status, WNOHANG);
        if (result == pid)
            return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
        if (result < 0)
            fail("waitpid");
        pause_ms(50);
    }
    (void)kill(pid, SIGKILL);
    (void)waitpid(pid, NULL, 0);
    fail("child process timeout");
    return 1;
}

static pid_t spawn_daemon(uid_t uid)
{
    pid_t pid = fork();
    require(pid >= 0, "fork daemon");
    if (pid == 0) {
        int log_fd = open(log_path, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, 0600);
        if (log_fd < 0 || dup2(log_fd, STDOUT_FILENO) < 0 || dup2(log_fd, STDERR_FILENO) < 0)
            _exit(97);
        close(log_fd);
        assume_uid(uid);
        execl(daemon_path, daemon_path, "--socket", socket_path,
              "--state-dir", state_path, (char *)NULL);
        _exit(99);
    }
    return pid;
}

static void start_daemon(void)
{
    daemon_pid = spawn_daemon(ROCK_UID);
    for (int i = 0; i < 100; i++) {
        int fd = rock_connect(socket_path);
        if (fd >= 0) {
            close(fd);
            return;
        }
        pause_ms(50);
    }
    fail("service did not start");
}

static void stop_daemon(int sig)
{
    require(daemon_pid > 0 && kill(daemon_pid, sig) == 0, "stop daemon");
    require(child_exit(daemon_pid) == (sig == SIGKILL ? 128 + SIGKILL : 0), "daemon exit status");
    daemon_pid = -1;
}

static int receive_response(int fd, char *response, size_t capacity)
{
    size_t used = 0;
    int64_t deadline = rock_now_ms() + 4000;
    while (used + 1 < capacity) {
        ssize_t n = rock_read(fd, response + used, capacity - used - 1, deadline);
        if (n < 0) {
            if (used > 0 && errno == ECONNRESET)
                break;
            return -1;
        }
        if (n == 0)
            break;
        used += (size_t)n;
    }
    response[used] = '\0';
    return 0;
}

static void request(const void *data, size_t length, const char *expected)
{
    char response[ROCK_RESPONSE_SIZE];
    int fd = rock_connect(socket_path);
    require(fd >= 0, "connect request");
    require(rock_send(fd, data, length, rock_now_ms() + 2000) == 0, "send request");
    require(shutdown(fd, SHUT_WR) == 0, "shutdown request");
    require(receive_response(fd, response, sizeof(response)) == 0, "read response");
    close(fd);
    if (strstr(response, expected) == NULL) {
        fprintf(stderr, "expected: %s\nreceived: %s\n", expected, response);
        fail("response mismatch");
    }
}

static void status_count(uint64_t expected)
{
    char count[64];
    (void)snprintf(count, sizeof(count), " completed=%" PRIu64 "\n", expected);
    REQUEST("STATUS\n", count);
}

static void run_client(uid_t uid, const char *command, int expected)
{
    pid_t pid = fork();
    require(pid >= 0, "fork client");
    if (pid == 0) {
        assume_uid(uid);
        execl(client_path, client_path, "--socket", socket_path, command, (char *)NULL);
        _exit(99);
    }
    require(child_exit(pid) == expected, "CLI exit status");
}

static void write_state_file(const char *path, const char *text)
{
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0600);
    require(fd >= 0, "open test state file");
    require(write(fd, text, strlen(text)) == (ssize_t)strlen(text), "write test state file");
    require(fchown(fd, ROCK_UID, ROCK_GID) == 0, "own test state file");
    require(fsync(fd) == 0 && close(fd) == 0, "sync test state file");
}

int main(int argc, char **argv)
{
    struct stat st;
    char max_request[ROCK_MAX_INPUT + ROCK_HEADER_SIZE];
    char response[ROCK_RESPONSE_SIZE];
    int prefix, fd;
    int64_t began;
    if (argc != 3 || getuid() != 0) {
        fprintf(stderr, "usage (root in disposable Linux guest): rocktest /path/rockd /path/rockctl\n");
        return 2;
    }
    daemon_path = argv[1];
    client_path = argv[2];
    require(mkdtemp(test_dir) != NULL, "create isolated test directory");
    (void)snprintf(socket_path, sizeof(socket_path), "%s/rockd.sock", test_dir);
    (void)snprintf(state_path, sizeof(state_path), "%s/state", test_dir);
    (void)snprintf(counter_path, sizeof(counter_path), "%s/counter", state_path);
    (void)snprintf(temp_path, sizeof(temp_path), "%s/counter.tmp", state_path);
    (void)snprintf(lock_path, sizeof(lock_path), "%s/lock", state_path);
    (void)snprintf(log_path, sizeof(log_path), "%s/daemon.log", test_dir);
    require(atexit(cleanup) == 0, "register test cleanup");
    require(chown(test_dir, ROCK_UID, ROCK_GID) == 0 && chmod(test_dir, 0755) == 0,
            "configure socket directory");
    require(mkdir(state_path, 0700) == 0 && chown(state_path, ROCK_UID, ROCK_GID) == 0,
            "configure state directory");

    require(child_exit(spawn_daemon(0)) == 1, "root service startup refused");
    puts("PASS root service startup refused");
    start_daemon();
    require(lstat(socket_path, &st) == 0 && S_ISSOCK(st.st_mode) &&
            (st.st_mode & 0777) == 0660 && st.st_uid == ROCK_UID && st.st_gid == ROCK_GID,
            "socket ownership and permissions");
    status_count(0);
    run_client(0, "status", 0);
    run_client(ROCK_UID, "self-test", 0);
    status_count(1);
    require(child_exit(spawn_daemon(ROCK_UID)) == 1, "duplicate service refused");
    puts("PASS root and uid1000 authorized; uid1000 service; no_new_privs; singleton lock");

    require(chmod(socket_path, 0666) == 0, "loosen socket for independent peer credential test");
    run_client(1001, "status", 3);
    require(chmod(socket_path, 0660) == 0, "restore socket permissions");
    status_count(1);
    puts("PASS uid1001 rejected by SO_PEERCRED even with mode 0666");

    REQUEST("NORMALIZE 4097\n", "ERR LIMIT\n");
    REQUEST("NORMALIZE 9999999999999999999999999\n", "ERR LIMIT\n");
    prefix = snprintf(max_request, sizeof(max_request), "NORMALIZE %u\n", ROCK_MAX_INPUT);
    memset(max_request + prefix, 'A', ROCK_MAX_INPUT);
    {
        int result_prefix = snprintf(response, sizeof(response),
                                     "OK NORMALIZE completed=2 bytes=4096\n");
        memset(response + result_prefix, 'a', ROCK_MAX_INPUT);
        response[result_prefix + ROCK_MAX_INPUT] = '\n';
        response[result_prefix + ROCK_MAX_INPUT + 1] = '\0';
        request(max_request, (size_t)prefix + ROCK_MAX_INPUT, response);
    }
    REQUEST("NORMALIZE 0\n", "OK NORMALIZE completed=3 bytes=0\n\n");
    REQUEST("NORMALIZE 1\n\0", "ERR TEXT\n");
    REQUEST("NORMALIZE 3\nab", "ERR FRAME\n");
    REQUEST("STATUS\nextra", "ERR FRAME\n");
    REQUEST("RUN /bin/sh\n", "ERR COMMAND\n");
    status_count(3);
    puts("PASS 4096-byte boundary, oversized frames, empty text, control bytes, malformed input");

    fd = rock_connect(socket_path);
    require(fd >= 0, "connect idle client");
    began = rock_now_ms();
    require(receive_response(fd, response, sizeof(response)) == 0 &&
            strcmp(response, "ERR TIMEOUT\n") == 0, "idle request timeout");
    close(fd);
    require(rock_now_ms() - began < 3500, "bounded request deadline");
    status_count(3);
    puts("PASS idle request expires; service still responds");

    stop_daemon(SIGKILL);
    write_state_file(temp_path, "incomplete uncommitted update\n");
    start_daemon();
    status_count(3);
    REQUEST("NORMALIZE 8\n NEXT OS", "OK NORMALIZE completed=4 bytes=7\nnext os\n");
    stop_daemon(SIGTERM);
    start_daemon();
    status_count(4);
    require(chmod(state_path, 0500) == 0, "make state read-only for failure test");
    REQUEST("NORMALIZE 1\nx", "ERR STORAGE\n");
    require(child_exit(daemon_pid) == 1, "storage failure stops service");
    daemon_pid = -1;
    require(chmod(state_path, 0700) == 0, "restore writable state");
    start_daemon();
    status_count(4);
    stop_daemon(SIGTERM);
    puts("PASS crash/stale-temp recovery and graceful restart preserve monotonic counter");
    puts("PASS storage failure returns no success and stops; restart preserves previous counter");

    write_state_file(counter_path, "corrupt\n");
    require(child_exit(spawn_daemon(ROCK_UID)) == 1, "corrupt counter refused");
    require(unlink(counter_path) == 0 && symlink("/etc/passwd", counter_path) == 0,
            "create counter symlink test");
    require(child_exit(spawn_daemon(ROCK_UID)) == 1, "counter symlink refused");
    require(unlink(counter_path) == 0 && mkfifo(counter_path, 0600) == 0 &&
            chown(counter_path, ROCK_UID, ROCK_GID) == 0, "create counter FIFO test");
    require(child_exit(spawn_daemon(ROCK_UID)) == 1, "counter FIFO refused without blocking");
    puts("PASS corrupt, symlink, and FIFO state fail closed");
    puts("PASS ALL rockd integration tests");
    return 0;
}
