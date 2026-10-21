#include "spider-motion.h"
#include <math.h>
#include <string.h>

#define PI 3.14159265358979323846

static void rest(struct rock_spider_motion *s, double now)
{
    memset(s, 0, sizeof(*s));
    s->initialized = 1;
    s->last_now = now;
    s->target = -1;
    s->x = 128;
    s->y = 213;
    for (int i = 0; i < 8; i++) {
        double angle = (i + .5) * PI / 4;
        s->feet[i].x = s->x + 43 * cos(angle);
        s->feet[i].y = s->y + 34 * sin(angle);
    }
}

static void choose_target(struct rock_spider_motion *s, const struct rock_spider_input *in, size_t count)
{
    int order[6], n = 0;
    /* Visit secrets first and spend twice as long at them; never invent nodes. */
    for (int secret = 1; secret >= 0; secret--)
        for (size_t i = 0; i < count; i++)
            if (!!in->secret[i] == secret) {
                order[n++] = (int)i;
                if (secret) order[n++] = (int)i;
            }
    if (!n) { s->target = -1; s->target_id = 0; return; }
    s->cursor %= n;
    s->target = order[s->cursor++];
    s->target_id = in->ids[s->target];
    s->dwell = 0;
    s->settled = 0;
}

void rock_spider_step(struct rock_spider_motion *s, const struct rock_spider_input *in, double now)
{
    if (!isfinite(now)) return;
    if (!s->initialized) rest(s, now);
    if (!in->active) { rest(s, now); return; }
    double elapsed = now - s->last_now;
    int continuity = s->active && elapsed >= 0 && elapsed <= .5;
    double dt = continuity ? elapsed : 0;
    if (dt > .1) dt = .1; /* Resume without jumping or replaying unseen events. */
    s->last_now = now;
    s->active = 1;
    s->phase += dt;
    if (!continuity || !in->blocked_valid || in->blocked < 0) {
        s->blocked_ready = 0;
        s->alert_left = 0;
    }
    if (in->blocked_valid && in->blocked >= 0) {
        if (s->blocked_ready && in->blocked > s->last_blocked) s->alert_left = 2.4;
        if (s->blocked_ready && in->blocked < s->last_blocked) s->alert_left = 0;
        s->last_blocked = in->blocked;
        s->blocked_ready = 1;
    }
    s->alert_left = fmax(0, s->alert_left - dt);
    s->alert = fmin(1, s->alert_left / .7);

    size_t count = in->count > 3 ? 3 : in->count;
    int found = -1;
    if (s->target >= 0)
        for (size_t i = 0; i < count; i++)
            if (in->ids[i] == s->target_id) { found = (int)i; break; }
    s->target = found;
    if (s->target < 0 && count) { s->cursor = 0; choose_target(s, in, count); }
    if (!count) { s->target_id = 0; s->dwell = 0; s->settled = 0; }
    double gx = 126 + 26 * sin(s->phase * .48);
    double gy = 212 + 48 * sin(s->phase * .31);
    if (s->target >= 0) { gx = 136; gy = 149 + 60 * s->target; }
    double dx = gx - s->x, dy = gy - s->y;
    double distance = hypot(dx, dy), travel = fmin(distance, dt * 48);
    if (distance > .001) {
        s->x += dx / distance * travel;
        s->y += dy / distance * travel;
        double angle = atan2(dy, dx);
        double difference = atan2(sin(angle - s->heading), cos(angle - s->heading));
        s->heading += difference * fmin(1, dt * 3);
    }
    s->settled = s->target >= 0 && distance < 2;
    if (s->settled) {
        s->dwell += dt;
        if (s->dwell > 2.8) choose_target(s, in, count);
    }

    for (int i = 0; i < 8; i++) {
        struct rock_spider_foot *foot = &s->feet[i];
        double angle = (i + .5) * PI / 4;
        double tx = s->x + 43 * cos(angle), ty = s->y + 34 * sin(angle);
        if (s->settled && (i == 0 || i == 7)) {
            tx = 190;
            ty = 149 + 60 * s->target + (i == 0 ? 19 : -19);
        }
        double reach = hypot(tx - foot->x, ty - foot->y);
        int swing = sin(s->phase * 6 + (i % 2) * PI) > .25;
        if (!foot->stepping && reach > 6 && (swing || reach > 25)) {
            foot->from_x = foot->x; foot->from_y = foot->y;
            foot->to_x = tx; foot->to_y = ty;
            foot->progress = 0; foot->stepping = 1;
        }
        if (foot->stepping) {
            foot->progress = fmin(1, foot->progress + dt / .28);
            double t = foot->progress, smooth = t * t * (3 - 2 * t);
            foot->x = foot->from_x + (foot->to_x - foot->from_x) * smooth;
            foot->y = foot->from_y + (foot->to_y - foot->from_y) * smooth;
            foot->lift = sin(t * PI) * 8;
            if (t >= 1) { foot->stepping = 0; foot->lift = 0; }
        }
    }
}
