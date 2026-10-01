#ifndef ROCK_UI_HEALTH_H
#define ROCK_UI_HEALTH_H

#include <stdint.h>
#include <sys/types.h>

#define ROCK_UI_HEALTH_PATH "/run/rock-ui-health/ready.sock"
#define ROCK_UI_HEALTH_MAX 256
#define ROCK_UI_HEALTH_CLIENTS 4

struct rock_ui_health_client {
    int fd;
    int64_t deadline_ms;
};

struct rock_ui_health {
    int listener, opened, failed;
    uint64_t frames, loops;
    int width, height, inputs;
    dev_t device;
    ino_t inode;
    char path[108];
    struct rock_ui_health_client clients[ROCK_UI_HEALTH_CLIENTS];
};

/* Native framebuffer mode only. No thread, network or business-service calls.
 * init must precede every cleanup path; open never replaces an existing path.
 * A successful open requires the S60-created UID1000 directory with mode0700. */
void rock_ui_health_init(struct rock_ui_health *health);
int rock_ui_health_open(struct rock_ui_health *health);

/* Call present only after Cairo and the actual framebuffer copy succeeded.
 * Call after_poll once after each successful main-loop poll (including timeout),
 * before its ready<=0 continue. Never invoke it from an auxiliary worker.
 * Invalid dimensions/counters cannot produce READY; an idle frame need not be
 * redrawn for a fresh probe. The root checker requires two advancing loops. */
void rock_ui_health_present(struct rock_ui_health *health, int width, int height, int inputs);
void rock_ui_health_after_poll(struct rock_ui_health *health);
void rock_ui_health_close(struct rock_ui_health *health);

#ifdef ROCK_UI_HEALTH_TEST
/* Test-only pathname seam; UID and peer authentication remain real and fixed. */
int rock_ui_health_open_at(struct rock_ui_health *health, const char *path);
#endif

#endif
