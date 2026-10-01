#ifndef ROCK_IO_H
#define ROCK_IO_H

#include <errno.h>
#include <limits.h>
#include <poll.h>
#include <stdint.h>
#include <stddef.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>
#include <string.h>

static inline int64_t rock_now_ms(void)
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) < 0)
        return -1;
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static inline int rock_wait(int fd, short events, int64_t deadline)
{
    struct pollfd p = { .fd = fd, .events = events, .revents = 0 };
    for (;;) {
        int64_t left = deadline - rock_now_ms();
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

static inline ssize_t rock_read(int fd, void *buf, size_t size, int64_t deadline)
{
    for (;;) {
        ssize_t n;
        if (rock_wait(fd, POLLIN, deadline) < 0)
            return -1;
        n = recv(fd, buf, size, MSG_DONTWAIT);
        if (n >= 0 || (errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK))
            return n;
    }
}

static inline int rock_send(int fd, const void *buf, size_t size, int64_t deadline)
{
    const unsigned char *p = buf;
    while (size > 0) {
        ssize_t n;
        if (rock_wait(fd, POLLOUT, deadline) < 0)
            return -1;
        n = send(fd, p, size, MSG_NOSIGNAL | MSG_DONTWAIT);
        if (n < 0) {
            if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)
                continue;
            return -1;
        }
        if (n == 0) {
            errno = EIO;
            return -1;
        }
        p += n;
        size -= (size_t)n;
    }
    return 0;
}

static inline int rock_connect(const char *path)
{
    struct sockaddr_un addr = { .sun_family = AF_UNIX };
    int fd;
    if (strlen(path) >= sizeof(addr.sun_path)) {
        errno = ENAMETOOLONG;
        return -1;
    }
    memcpy(addr.sun_path, path, strlen(path) + 1);
    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0)
        return -1;
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        int saved = errno;
        close(fd);
        errno = saved;
        return -1;
    }
    return fd;
}

#endif
