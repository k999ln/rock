#ifndef ROCK_UI_DEVICE_H
#define ROCK_UI_DEVICE_H
#include <cairo/cairo.h>
#include <linux/fb.h>
#include <linux/input.h>
#include <poll.h>
#include <stddef.h>

#define ROCK_INPUT_MAX 24

struct rock_fb {
    int fd;
    unsigned char *memory;
    size_t memory_size;
    struct fb_var_screeninfo variable;
    struct fb_fix_screeninfo fixed;
    int width, height;
};

struct rock_input {
    int fd;
    char name[128];
    struct input_absinfo x_range, y_range;
    int has_absolute;
    int initialized, x, y, down, next_down, motion, wheel, dropped;
};

struct rock_input_frame {
    int x, y, state, moved, wheel;
};

int rock_fb_open(struct rock_fb *fb, const char *path, char *error, size_t size);
int rock_fb_present(struct rock_fb *fb, cairo_surface_t *surface);
void rock_fb_close(struct rock_fb *fb);
int rock_inputs_open(struct rock_input *inputs, size_t capacity, const char *pattern);
void rock_inputs_close(struct rock_input *inputs, size_t count);
int rock_abs_position(int value, const struct input_absinfo *range, int pixels);
int rock_input_feed(struct rock_input *input, const struct input_event *event,
                    int width, int height, struct rock_input_frame *frame);
#endif
