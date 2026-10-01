#define _GNU_SOURCE
#include "health.h"

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

static int64_t monotonic_ms(void)
{
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) < 0 || value.tv_sec < 0 ||
        value.tv_sec > (INT64_MAX - 1000) / 1000) return -1;
    return (int64_t)value.tv_sec * 1000 + value.tv_nsec / 1000000;
}

static void drop(struct rock_ui_health_client *client)
{
    if (client->fd >= 0) close(client->fd);
    client->fd = -1;
    client->deadline_ms = 0;
}

void rock_ui_health_init(struct rock_ui_health *health)
{
    memset(health, 0, sizeof(*health));
    health->listener = -1;
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) health->clients[i].fd = -1;
}

void rock_ui_health_close(struct rock_ui_health *health)
{
    struct stat info;
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) drop(&health->clients[i]);
    if (health->listener >= 0) close(health->listener);
    health->listener = -1;
    /* Never unlink another process's replacement or a symlink. */
    if (health->opened && lstat(health->path, &info) == 0 && S_ISSOCK(info.st_mode) &&
        info.st_uid == 1000 && info.st_dev == health->device && info.st_ino == health->inode)
        (void)unlink(health->path);
    health->opened = 0;
    health->failed = 1;
}

static int open_path(struct rock_ui_health *health, const char *path)
{
    struct sockaddr_un address = { .sun_family = AF_UNIX };
    struct stat parent, info;
    char directory[sizeof(address.sun_path)];
    char *slash;
    if (!health || !path || getuid() != 1000 || geteuid() != 1000 ||
        health->listener >= 0 || health->opened || health->failed ||
        path[0] != '/' || strlen(path) >= sizeof(address.sun_path)) {
        errno = EINVAL;
        return -1;
    }
    memcpy(directory, path, strlen(path) + 1);
    slash = strrchr(directory, '/');
    if (!slash || slash == directory) { errno = EINVAL; return -1; }
    *slash = '\0';
    if (lstat(directory, &parent) < 0) return -1;
    if (!S_ISDIR(parent.st_mode) || parent.st_uid != 1000 ||
        (parent.st_mode & 07777) != 0700) { errno = EPERM; return -1; }
    if (lstat(path, &info) == 0) { errno = EEXIST; return -1; }
    if (errno != ENOENT) return -1;
    health->listener = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    if (health->listener < 0) return -1;
    memcpy(address.sun_path, path, strlen(path) + 1);
    if (bind(health->listener, (struct sockaddr *)&address, sizeof(address)) < 0) goto failed;
    if (lstat(path, &info) < 0 || !S_ISSOCK(info.st_mode) || info.st_uid != 1000) goto failed;
    health->opened = 1;
    health->device = info.st_dev;
    health->inode = info.st_ino;
    memcpy(health->path, path, strlen(path) + 1);
    if (chmod(path, 0600) < 0 || listen(health->listener, ROCK_UI_HEALTH_CLIENTS) < 0) goto failed;
    return 0;
failed:
    {
        int error = errno;
        rock_ui_health_close(health);
        errno = error;
        return -1;
    }
}

int rock_ui_health_open(struct rock_ui_health *health)
{
    return open_path(health, ROCK_UI_HEALTH_PATH);
}

#ifdef ROCK_UI_HEALTH_TEST
int rock_ui_health_open_at(struct rock_ui_health *health, const char *path)
{
    return open_path(health, path);
}
#endif

void rock_ui_health_present(struct rock_ui_health *health, int width, int height, int inputs)
{
    if (!health->opened || health->failed) return;
    if (health->frames == UINT64_MAX || width < 320 || width > 4096 ||
        height < 320 || height > 4096 || inputs < 0 || inputs > 24) {
        health->failed = 1;
        return;
    }
    health->frames++;
    health->width = width;
    health->height = height;
    health->inputs = inputs;
}

/* recvmsg may install SCM_RIGHTS descriptors even when the packet is rejected. */
static void close_rights(struct msghdr *message)
{
    struct cmsghdr *item;
    for (item = CMSG_FIRSTHDR(message); item; item = CMSG_NXTHDR(message, item)) {
        if (item->cmsg_level == SOL_SOCKET && item->cmsg_type == SCM_RIGHTS &&
            item->cmsg_len >= CMSG_LEN(0)) {
            size_t bytes = item->cmsg_len - CMSG_LEN(0);
            unsigned char *data = CMSG_DATA(item);
            for (size_t at = 0; at + sizeof(int) <= bytes; at += sizeof(int)) {
                int descriptor;
                memcpy(&descriptor, data + at, sizeof(descriptor));
                if (descriptor >= 0) close(descriptor);
            }
        }
    }
}

static ssize_t receive_packet(int fd, char *data, int *invalid)
{
    union { struct cmsghdr align; unsigned char bytes[CMSG_SPACE(sizeof(int) * 16)]; } control;
    struct iovec vector = { .iov_base = data, .iov_len = ROCK_UI_HEALTH_MAX };
    struct msghdr message = { .msg_iov = &vector, .msg_iovlen = 1,
        .msg_control = control.bytes, .msg_controllen = sizeof(control.bytes) };
    ssize_t size = recvmsg(fd, &message, MSG_DONTWAIT | MSG_CMSG_CLOEXEC);
    *invalid = 0;
    if (size >= 0) {
        *invalid = (message.msg_flags & (MSG_TRUNC | MSG_CTRUNC)) || message.msg_controllen != 0;
        close_rights(&message);
    }
    return size;
}

static void service_client(struct rock_ui_health *health, struct rock_ui_health_client *client)
{
    static const char prefix[] = "ROCK_UI_HEALTH/1 ";
    char packet[ROCK_UI_HEALTH_MAX], extra[ROCK_UI_HEALTH_MAX], reply[ROCK_UI_HEALTH_MAX];
    char nonce[65];
    int invalid;
    ssize_t size = receive_packet(client->fd, packet, &invalid);
    if (size < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
    if (size != (ssize_t)(sizeof(prefix) - 1 + 64 + 1) || invalid ||
        memcmp(packet, prefix, sizeof(prefix) - 1) || packet[size - 1] != '\n') goto finished;
    memcpy(nonce, packet + sizeof(prefix) - 1, 64); nonce[64] = '\0';
    for (int i = 0; i < 64; i++)
        if (!((nonce[i] >= '0' && nonce[i] <= '9') || (nonce[i] >= 'a' && nonce[i] <= 'f'))) goto finished;
    /* One packet, one reply. Reject any additional packet already queued. A
     * later write after reply cannot retroactively change this observation. */
    size = receive_packet(client->fd, extra, &invalid);
    if (size >= 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) goto finished;
    if (health->failed || !health->frames || !health->loops || health->inputs < 1) goto finished;
    int length = snprintf(reply, sizeof(reply), "ROCK_UI_READY/1 %s %ld %" PRIu64 " %" PRIu64 " %d %d %d\n",
        nonce, (long)getpid(), health->frames, health->loops, health->width, health->height, health->inputs);
    if (length > 0 && length < (int)sizeof(reply))
        (void)send(client->fd, reply, (size_t)length, MSG_DONTWAIT | MSG_NOSIGNAL);
finished:
    drop(client);
}

void rock_ui_health_after_poll(struct rock_ui_health *health)
{
    if (!health->opened || health->failed) return;
    int64_t now = monotonic_ms();
    if (now < 0 || health->loops == UINT64_MAX) { health->failed = 1; return; }
    if (health->frames) health->loops++;
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++)
        if (health->clients[i].fd >= 0 && now >= health->clients[i].deadline_ms) drop(&health->clients[i]);
    /* Bounded work even if another process floods the listen backlog. */
    for (int accepted = 0; accepted < ROCK_UI_HEALTH_CLIENTS; accepted++) {
        int fd = accept4(health->listener, NULL, NULL, SOCK_NONBLOCK | SOCK_CLOEXEC);
        if (fd < 0) {
            if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) health->failed = 1;
            break;
        }
        struct ucred peer;
        socklen_t length = sizeof(peer);
        int slot = -1;
        for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++) if (health->clients[i].fd < 0) { slot = i; break; }
        if (slot < 0 || getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &length) < 0 ||
            length != sizeof(peer) || peer.uid != 0) { close(fd); continue; }
        health->clients[slot].fd = fd;
        health->clients[slot].deadline_ms = now + 1000;
    }
    for (int i = 0; i < ROCK_UI_HEALTH_CLIENTS; i++)
        if (health->clients[i].fd >= 0) service_client(health, &health->clients[i]);
}
