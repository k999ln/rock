#define _GNU_SOURCE
#include "device.h"

#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

int rock_fb_open(struct rock_fb *fb, const char *path, char *error, size_t size)
{
    uint64_t required;
    memset(fb, 0, sizeof(*fb));
    fb->fd = -1;
    fb->fd = open(path, O_RDWR | O_CLOEXEC);
    if (fb->fd < 0 || ioctl(fb->fd, FBIOGET_VSCREENINFO, &fb->variable) < 0 ||
        ioctl(fb->fd, FBIOGET_FSCREENINFO, &fb->fixed) < 0)
        goto fail;
    if (fb->variable.xres < 320 || fb->variable.yres < 320 ||
        fb->variable.xres > 4096 || fb->variable.yres > 4096 ||
        (fb->variable.bits_per_pixel != 16 && fb->variable.bits_per_pixel != 24 &&
         fb->variable.bits_per_pixel != 32) || fb->fixed.type != FB_TYPE_PACKED_PIXELS ||
        (fb->fixed.visual != FB_VISUAL_TRUECOLOR && fb->fixed.visual != FB_VISUAL_DIRECTCOLOR)) {
        snprintf(error, size, "unsupported framebuffer format or dimensions");
        rock_fb_close(fb);
        return -1;
    }
    required = ((uint64_t)fb->variable.yoffset + fb->variable.yres - 1) * fb->fixed.line_length +
               ((uint64_t)fb->variable.xoffset + fb->variable.xres) * (fb->variable.bits_per_pixel / 8);
    if (required > fb->fixed.smem_len || fb->fixed.smem_len > 256U * 1024U * 1024U) {
        snprintf(error, size, "framebuffer memory bounds are invalid");
        rock_fb_close(fb);
        return -1;
    }
    fb->memory_size = fb->fixed.smem_len;
    fb->memory = mmap(NULL, fb->memory_size, PROT_READ | PROT_WRITE, MAP_SHARED, fb->fd, 0);
    if (fb->memory == MAP_FAILED) {
        fb->memory = NULL;
        goto fail;
    }
    fb->width = (int)fb->variable.xres;
    fb->height = (int)fb->variable.yres;
    return 0;
fail:
    snprintf(error, size, "%s", strerror(errno));
    rock_fb_close(fb);
    return -1;
}

static uint32_t channel(unsigned value, struct fb_bitfield field)
{
    uint32_t maximum;
    if (field.length == 0 || field.length > 16 || field.offset > 31 ||
        field.length + field.offset > 32)
        return 0;
    maximum = (UINT32_C(1) << field.length) - 1;
    return ((value * maximum + 127) / 255) << field.offset;
}

int rock_fb_present(struct rock_fb *fb, cairo_surface_t *surface)
{
    const unsigned char *image;
    int stride;
    unsigned bytes = fb->variable.bits_per_pixel / 8;
    if (!fb->memory || cairo_image_surface_get_width(surface) != fb->width ||
        cairo_image_surface_get_height(surface) != fb->height)
        return -1;
    cairo_surface_flush(surface);
    image = cairo_image_surface_get_data(surface);
    stride = cairo_image_surface_get_stride(surface);
    for (int y = 0; y < fb->height; y++) {
        const uint32_t *src = (const uint32_t *)(image + (size_t)y * (size_t)stride);
        unsigned char *dest = fb->memory + ((size_t)y + fb->variable.yoffset) * fb->fixed.line_length +
                              (size_t)fb->variable.xoffset * bytes;
        if (bytes == 4 && fb->variable.red.offset == 16 && fb->variable.green.offset == 8 &&
            fb->variable.blue.offset == 0 && fb->variable.red.length == 8 &&
            fb->variable.green.length == 8 && fb->variable.blue.length == 8) {
            memcpy(dest, src, (size_t)fb->width * 4);
            continue;
        }
        for (int x = 0; x < fb->width; x++) {
            uint32_t pixel = channel((src[x] >> 16) & 255, fb->variable.red) |
                             channel((src[x] >> 8) & 255, fb->variable.green) |
                             channel(src[x] & 255, fb->variable.blue) |
                             channel(255, fb->variable.transp);
            memcpy(dest + (size_t)x * bytes, &pixel, bytes);
        }
    }
    return 0;
}

void rock_fb_close(struct rock_fb *fb)
{
    if (fb->memory)
        munmap(fb->memory, fb->memory_size);
    if (fb->fd >= 0)
        close(fb->fd);
    fb->memory = NULL;
    fb->fd = -1;
}

int rock_inputs_open(struct rock_input *inputs, size_t capacity, const char *pattern)
{
    glob_t matches;
    size_t count = 0;
    memset(&matches, 0, sizeof(matches));
    if (glob(pattern, 0, NULL, &matches) != 0)
        return 0;
    for (size_t i = 0; i < matches.gl_pathc && count < capacity; i++) {
        struct rock_input *input = &inputs[count];
        memset(input, 0, sizeof(*input));
        input->fd = open(matches.gl_pathv[i], O_RDONLY | O_NONBLOCK | O_CLOEXEC);
        if (input->fd < 0)
            continue;
        if (ioctl(input->fd, EVIOCGNAME(sizeof(input->name)), input->name) < 0) {
            close(input->fd);
            continue;
        }
        if (ioctl(input->fd, EVIOCGABS(ABS_X), &input->x_range) == 0 &&
            ioctl(input->fd, EVIOCGABS(ABS_Y), &input->y_range) == 0)
            input->has_absolute = 1;
        else if (ioctl(input->fd, EVIOCGABS(ABS_MT_POSITION_X), &input->x_range) == 0 &&
                 ioctl(input->fd, EVIOCGABS(ABS_MT_POSITION_Y), &input->y_range) == 0)
            input->has_absolute = 1;
        count++;
    }
    globfree(&matches);
    return (int)count;
}

void rock_inputs_close(struct rock_input *inputs, size_t count)
{
    for (size_t i = 0; i < count; i++)
        close(inputs[i].fd);
}

int rock_abs_position(int value, const struct input_absinfo *range, int pixels)
{
    int64_t scaled;
    if (range->maximum <= range->minimum)
        return pixels / 2;
    scaled = ((int64_t)value - range->minimum) * pixels / ((int64_t)range->maximum - range->minimum);
    if (scaled < 0)
        return 0;
    if (scaled >= pixels)
        return pixels - 1;
    return (int)scaled;
}

/* Coordinates and button state are one evdev frame, regardless of event order. */
int rock_input_feed(struct rock_input *input, const struct input_event *event,
                    int width, int height, struct rock_input_frame *frame)
{
    if (!input->initialized) {
        input->x = input->has_absolute ? rock_abs_position(input->x_range.value, &input->x_range, width) : width / 2;
        input->y = input->has_absolute ? rock_abs_position(input->y_range.value, &input->y_range, height) : height / 2;
        input->initialized = 1;
    }
    if (event->type == EV_SYN && event->code == SYN_DROPPED) {
        input->dropped = 1;
        input->motion = 0;
        input->wheel = 0;
        input->next_down = 0;
        return 0;
    }
    if (event->type == EV_SYN && event->code == SYN_REPORT) {
        int changed = input->motion || input->wheel || input->next_down != input->down;
        *frame = (struct rock_input_frame){ .x = input->x, .y = input->y,
            .state = input->next_down == input->down ? -1 : input->next_down,
            .moved = input->motion, .wheel = input->wheel };
        input->down = input->next_down;
        input->motion = 0;
        input->wheel = 0;
        input->dropped = 0;
        return changed;
    }
    if (input->dropped) return 0;
    if (event->type == EV_ABS && input->has_absolute) {
        if (event->code == ABS_X || event->code == ABS_MT_POSITION_X) {
            input->x = rock_abs_position(event->value, &input->x_range, width);
            input->motion = 1;
        } else if (event->code == ABS_Y || event->code == ABS_MT_POSITION_Y) {
            input->y = rock_abs_position(event->value, &input->y_range, height);
            input->motion = 1;
        } else if (event->code == ABS_MT_TRACKING_ID) {
            input->next_down = event->value >= 0;
        }
    } else if (event->type == EV_REL) {
        if (event->code == REL_X || event->code == REL_Y) {
            int64_t position = (event->code == REL_X ? input->x : input->y);
            int limit = event->code == REL_X ? width : height;
            position += event->value;
            if (position < 0) position = 0;
            if (position >= limit) position = limit - 1;
            if (event->code == REL_X) input->x = (int)position;
            else input->y = (int)position;
            input->motion = 1;
        } else if (event->code == REL_WHEEL) {
            int steps = event->value;
            if (steps > 20) steps = 20;
            if (steps < -20) steps = -20;
            input->wheel += steps;
            if (input->wheel > 20) input->wheel = 20;
            if (input->wheel < -20) input->wheel = -20;
        }
    } else if (event->type == EV_KEY && (event->code == BTN_LEFT || event->code == BTN_TOUCH)) {
        input->next_down = event->value != 0;
    }
    return 0;
}
