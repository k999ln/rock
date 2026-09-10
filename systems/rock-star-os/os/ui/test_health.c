#define _GNU_SOURCE
#include "health.h"

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <inttypes.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

/* Real Linux credentials; run this separate target as root. The server child
 * drops all groups and both UIDs to1000. No test authorization bypass exists. */
struct fixture {
    char directory[128], socket_directory[128], path[128];
    pid_t pid;
    int command, response;
};
enum { REQUEST_SIZE = sizeof("ROCK_UI_HEALTH/1 ") - 1 + 64 + 1 };
static struct fixture active = { .command = -1, .response = -1 };
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "health test failed at %s:%d: %s (errno=%d)\n", __FILE__, __LINE__, #x, errno); exit(1); } } while (0)
#define CHILD(x) do { if (!(x)) _exit(90); } while (0)

static void cleanup(void)
{
    if (active.pid > 0) {
        (void)kill(active.pid, SIGKILL);
        while (waitpid(active.pid, NULL, 0) < 0 && errno == EINTR) {}
    }
    if (active.command >= 0) close(active.command);
    if (active.response >= 0) close(active.response);
    if (*active.path) (void)unlink(active.path);
    if (*active.socket_directory) (void)rmdir(active.socket_directory);
    if (*active.directory) (void)rmdir(active.directory);
    memset(&active, 0, sizeof(active));
    active.command = active.response = -1;
}

static void server(int command, int response, const char *path)
{
    struct rock_ui_health health;
    CHILD(setgroups(0, NULL) == 0 && setgid(1000) == 0 && setuid(1000) == 0);
    rock_ui_health_init(&health);
    CHILD(rock_ui_health_open_at(&health, path) == 0);
    CHILD(write(response, "R", 1) == 1);
    char action;
    while (read(command, &action, 1) == 1 && action != 'Q') {
        switch (action) {
        case 'P': rock_ui_health_present(&health, 720, 960, 2); break;
        case 'I': rock_ui_health_present(&health, 720, 960, 0); break;
        case 'D': rock_ui_health_present(&health, 319, 960, 2); break;
        case 'X': health.frames = UINT64_MAX; rock_ui_health_present(&health, 720, 960, 2); break;
        case 'Y': health.loops = UINT64_MAX; break;
        case 'T':
            CHILD(poll(NULL, 0, 1) == 0);
            rock_ui_health_after_poll(&health);
            break;
        case 'F':
            CHILD((fcntl(health.listener, F_GETFL) & O_NONBLOCK) != 0);
            CHILD((fcntl(health.listener, F_GETFD) & FD_CLOEXEC) != 0);
            for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) if (health.clients[i].fd >= 0) {
                CHILD((fcntl(health.clients[i].fd, F_GETFL) & O_NONBLOCK) != 0);
                CHILD((fcntl(health.clients[i].fd, F_GETFD) & FD_CLOEXEC) != 0);
            }
            break;
        case 'O': CHILD(rock_ui_health_open_at(&health, path) < 0); break;
        case 'C': rock_ui_health_close(&health); rock_ui_health_close(&health); break;
        default: _exit(91);
        }
        CHILD(write(response, "R", 1) == 1);
    }
    rock_ui_health_close(&health);
    close(command); close(response);
    _exit(0);
}

static void ack(void)
{
    struct pollfd p = { .fd = active.response, .events = POLLIN };
    char value;
    CHECK(poll(&p, 1, 1000) == 1);
    CHECK(read(active.response, &value, 1) == 1 && value == 'R');
}

static void action(char value)
{
    CHECK(write(active.command, &value, 1) == 1); ack();
}

static void start(void)
{
    int commands[2], responses[2];
    CHECK(active.pid == 0);
    strcpy(active.directory, "/tmp/rock-ui-health-test.XXXXXX");
    CHECK(mkdtemp(active.directory) != NULL && chmod(active.directory, 0711) == 0);
    CHECK(snprintf(active.socket_directory, sizeof(active.socket_directory), "%s/ready", active.directory) < (int)sizeof(active.socket_directory));
    CHECK(snprintf(active.path, sizeof(active.path), "%s/ready.sock", active.socket_directory) < (int)sizeof(active.path));
    CHECK(mkdir(active.socket_directory, 0700) == 0 && chown(active.socket_directory, 1000, 1000) == 0);
    CHECK(pipe2(commands, O_CLOEXEC) == 0 && pipe2(responses, O_CLOEXEC) == 0);
    active.pid = fork(); CHECK(active.pid >= 0);
    if (!active.pid) {
        close(commands[1]); close(responses[0]);
        server(commands[0], responses[1], active.path);
    }
    close(commands[0]); close(responses[1]);
    active.command = commands[1]; active.response = responses[0]; ack();
}

static void stop(void)
{
    int status;
    CHECK(write(active.command, "Q", 1) == 1);
    CHECK(waitpid(active.pid, &status, 0) == active.pid && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    active.pid = 0; cleanup();
}

static int connect_client(void)
{
    struct sockaddr_un address = { .sun_family = AF_UNIX };
    struct timeval timeout = { .tv_sec = 1 };
    int fd = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
    CHECK(fd >= 0 && strlen(active.path) < sizeof(address.sun_path));
    memcpy(address.sun_path, active.path, strlen(active.path) + 1);
    CHECK(setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) == 0);
    CHECK(setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) == 0);
    CHECK(connect(fd, (struct sockaddr *)&address, sizeof(address)) == 0);
    return fd;
}

static size_t request(char *out, char nonce)
{
    size_t prefix = sizeof("ROCK_UI_HEALTH/1 ") - 1;
    memcpy(out, "ROCK_UI_HEALTH/1 ", prefix);
    memset(out + prefix, nonce, 64); out[prefix + 64] = '\n';
    return REQUEST_SIZE;
}

static int send_request(char nonce)
{
    char wire[REQUEST_SIZE]; int fd = connect_client();
    CHECK(send(fd, wire, request(wire, nonce), MSG_NOSIGNAL) == REQUEST_SIZE);
    return fd;
}

static void closed(int fd)
{
    struct pollfd p = { .fd = fd, .events = POLLIN };
    char raw[ROCK_UI_HEALTH_MAX];
    CHECK(poll(&p, 1, 500) == 1);
    CHECK(recv(fd, raw, sizeof(raw), 0) <= 0);
    close(fd);
}

static uint64_t ready(int fd, char nonce, uint64_t expected_frames)
{
    char wire[ROCK_UI_HEALTH_MAX + 1], echoed[65], expected[65];
    long pid; uint64_t frames, loops; int width, height, inputs, consumed = 0;
    ssize_t size = recv(fd, wire, ROCK_UI_HEALTH_MAX, 0);
    CHECK(size > 0 && size < ROCK_UI_HEALTH_MAX); wire[size] = '\0';
    CHECK(sscanf(wire, "ROCK_UI_READY/1 %64[0-9a-f] %ld %" SCNu64 " %" SCNu64 " %d %d %d\n%n",
        echoed, &pid, &frames, &loops, &width, &height, &inputs, &consumed) == 7);
    memset(expected, nonce, 64); expected[64] = '\0';
    CHECK(consumed == size && wire[size - 1] == '\n' && !strcmp(echoed, expected));
    CHECK(pid == active.pid && frames == expected_frames && loops > 0 && width == 720 && height == 960 && inputs == 2);
    closed(fd); return loops;
}

static void test_present_and_poll_and_fresh_loop(void)
{
    start(); action('F');
    int fd = send_request('a'); action('T'); closed(fd); /* No frame. */
    action('P'); fd = send_request('a');
    struct pollfd wait = { .fd = fd, .events = POLLIN };
    CHECK(poll(&wait, 1, 60) == 0); /* A frame alone, with no loop progress, is insufficient. */
    action('T'); uint64_t first = ready(fd, 'a', 1);
    fd = send_request('b'); CHECK(poll(&(struct pollfd){.fd=fd,.events=POLLIN}, 1, 60) == 0);
    action('T'); CHECK(ready(fd, 'b', 1) > first); /* No extra redraw required. */
    stop(); puts("PASS present, main-loop progress and fresh nonce");
}

static void test_connect_send_race_and_expiry(void)
{
    start(); action('P'); int fd = connect_client(); action('T'); action('F');
    char wire[REQUEST_SIZE]; CHECK(send(fd, wire, request(wire, 'a'), MSG_NOSIGNAL) == REQUEST_SIZE);
    action('T'); ready(fd, 'a', 1);
    fd = connect_client(); action('T');
    struct timespec delay = { .tv_sec = 1, .tv_nsec = 100000000 };
    CHECK(nanosleep(&delay, NULL) == 0); action('T'); closed(fd);
    fd = send_request('b'); action('T'); ready(fd, 'b', 1);
    stop(); puts("PASS connect-before-send retained and bounded expiry recovered");
}

static void test_capacity_and_close(void)
{
    start(); action('P'); int pending[ROCK_UI_HEALTH_CLIENTS];
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) pending[i] = connect_client();
    action('T'); action('F'); int excess = connect_client(); action('T'); closed(excess);
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) close(pending[i]);
    action('T'); int fd = send_request('a'); action('T'); ready(fd, 'a', 1);
    fd = connect_client(); action('T'); action('C'); closed(fd);
    struct stat info; CHECK(lstat(active.path, &info) < 0 && errno == ENOENT);
    stop(); puts("PASS fixed capacity, cleanup and repeated close");
}

static void test_strict_packets(void)
{
    start(); action('P'); char wire[ROCK_UI_HEALTH_MAX + 1];
    for (int which = 0; which < 7; which++) {
        size_t length = request(wire, 'a');
        if (which == 0) wire[0] = 'r';
        if (which == 1) wire[sizeof("ROCK_UI_HEALTH/1 ") - 1] = 'A';
        if (which == 2) wire[40] = '\0';
        if (which == 3) wire[REQUEST_SIZE - 1] = ' ';
        if (which == 4) wire[length++] = '\n';
        if (which == 5) { memset(wire + length, 'x', sizeof(wire) - length); length = sizeof(wire); }
        int fd = connect_client(); CHECK(send(fd, wire, length, MSG_NOSIGNAL) == (ssize_t)length);
        if (which == 6) CHECK(send(fd, wire, length, MSG_NOSIGNAL) == (ssize_t)length);
        action('T'); closed(fd);
    }
    int fd = send_request('b'); action('T'); ready(fd, 'b', 1);
    stop(); puts("PASS exact packet, lowercase nonce, truncation and extra packet rejection");
}

static int descriptor_count(pid_t pid)
{
    char path[64]; snprintf(path, sizeof(path), "/proc/%ld/fd", (long)pid);
    DIR *directory = opendir(path); CHECK(directory != NULL);
    int count = 0; struct dirent *entry;
    while ((entry = readdir(directory))) if (entry->d_name[0] != '.') count++;
    closedir(directory); return count;
}

static void test_ancillary_descriptors_closed(void)
{
    start(); action('P'); int before = descriptor_count(active.pid);
    for (int count = 1; count <= 20; count += 19) {
        int fd = connect_client(), original = open("/dev/null", O_RDONLY | O_CLOEXEC);
        CHECK(original >= 0); int descriptors[20];
        for (int i = 0; i < count; i++) descriptors[i] = original;
        char wire[REQUEST_SIZE]; request(wire, 'a');
        union { struct cmsghdr align; char bytes[CMSG_SPACE(sizeof(descriptors))]; } control;
        memset(&control, 0, sizeof(control));
        struct iovec vector = { .iov_base=wire, .iov_len=sizeof(wire) };
        struct msghdr message = { .msg_iov=&vector, .msg_iovlen=1,
            .msg_control=control.bytes, .msg_controllen=CMSG_SPACE(sizeof(int)*(size_t)count) };
        struct cmsghdr *header = CMSG_FIRSTHDR(&message);
        header->cmsg_level=SOL_SOCKET; header->cmsg_type=SCM_RIGHTS; header->cmsg_len=CMSG_LEN(sizeof(int)*(size_t)count);
        memcpy(CMSG_DATA(header), descriptors, sizeof(int)*(size_t)count);
        CHECK(sendmsg(fd, &message, MSG_NOSIGNAL) == REQUEST_SIZE); close(original);
        action('T'); closed(fd); CHECK(descriptor_count(active.pid) == before);
    }
    stop(); puts("PASS ancillary rejection closes received and truncated SCM_RIGHTS");
}

static void test_root_peer_required(void)
{
    start(); action('P'); int synchronized[2]; CHECK(pipe2(synchronized, O_CLOEXEC) == 0);
    pid_t client = fork(); CHECK(client >= 0);
    if (!client) {
        CHILD(setgroups(0, NULL) == 0 && setgid(1000) == 0 && setuid(1000) == 0);
        int fd = send_request('a'); CHILD(write(synchronized[1], "R", 1) == 1);
        char buffer[256]; ssize_t received = recv(fd, buffer, sizeof(buffer), 0);
        close(fd); _exit(received <= 0 ? 0 : 92);
    }
    close(synchronized[1]); char value; CHECK(read(synchronized[0], &value, 1) == 1); close(synchronized[0]);
    action('T'); int status; CHECK(waitpid(client, &status, 0) == client && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    int fd = send_request('b'); action('T'); ready(fd, 'b', 1);
    stop(); puts("PASS actual UID1000 client denied and actual root accepted");
}

static void test_invalid_readiness_and_overflow(void)
{
    const char cases[] = { 'I', 'D', 'X', 'Y' };
    for (size_t i = 0; i < sizeof(cases); i++) {
        start(); action(cases[i]); int fd = send_request('a'); action('T');
        if (cases[i] == 'I') closed(fd);
        else { CHECK(poll(&(struct pollfd){.fd=fd,.events=POLLIN}, 1, 60) == 0); close(fd); }
        stop();
    }
    puts("PASS zero inputs, invalid dimensions and counter overflow fail closed");
}

static void test_open_owner_path_and_preserved_listener(void)
{
    start(); struct stat info; CHECK(lstat(active.path, &info) == 0 && S_ISSOCK(info.st_mode));
    CHECK(info.st_uid == 1000 && (info.st_mode & 07777) == 0600);
    struct rock_ui_health rejected; rock_ui_health_init(&rejected);
    CHECK(rock_ui_health_open_at(&rejected, active.path) < 0); /* Root cannot serve as the UI. */
    rock_ui_health_close(&rejected); action('O'); action('P');
    int fd = send_request('a'); action('T'); ready(fd, 'a', 1);
    stop(); puts("PASS fixed UI owner, protected socket and no overwrite");
}

int main(void)
{
    if (getuid() != 0 || geteuid() != 0) {
        fputs("Run the isolated Linux test-health target as root for real UID0/UID1000 checks.\n", stderr);
        return 2;
    }
    signal(SIGPIPE, SIG_IGN); CHECK(atexit(cleanup) == 0);
    test_present_and_poll_and_fresh_loop();
    test_connect_send_race_and_expiry();
    test_capacity_and_close();
    test_strict_packets();
    test_ancillary_descriptors_closed();
    test_root_peer_required();
    test_invalid_readiness_and_overflow();
    test_open_owner_path_and_preserved_listener();
    puts("PASS: 8 native UI readiness protocol/ownership/lifecycle test groups");
    return 0;
}
