#ifndef ROCK_SPIDER_MOTION_H
#define ROCK_SPIDER_MOTION_H
#include <stddef.h>
#include <stdint.h>

/* Metadata only; no payloads, paths, network or security decisions here. */
struct rock_spider_input {
    int active, blocked_valid;
    int64_t blocked;
    size_t count;
    uint64_t ids[3];
    int secret[3];
};
struct rock_spider_foot {
    double x, y, lift, from_x, from_y, to_x, to_y, progress;
    int stepping;
};
struct rock_spider_motion {
    int initialized, active, target, settled, blocked_ready, cursor;
    uint64_t target_id;
    int64_t last_blocked;
    double x, y, phase, heading, alert, alert_left, dwell, last_now;
    struct rock_spider_foot feet[8];
};
void rock_spider_step(struct rock_spider_motion *motion,
                      const struct rock_spider_input *input, double now_seconds);
#endif
