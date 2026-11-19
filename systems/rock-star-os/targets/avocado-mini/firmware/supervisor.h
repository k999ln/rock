#ifndef MINI_SUPERVISOR_H
#define MINI_SUPERVISOR_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#define MINI_FRAME_BYTES 20u
#define MINI_HEARTBEAT_MS 500u
#define MINI_ARM_MS 250u
#define MINI_STOP_OK 1u
#define MINI_LATCH_OK 2u
#define MINI_TEMP_OK 4u
#define MINI_POWER_OK 8u
#define MINI_DOCKED 16u
#define MINI_LOCAL_BUTTON 32u
#define MINI_OUTPUT_ON 64u
#define MINI_FAULT 128u
#define MINI_REQUIRED (MINI_STOP_OK | MINI_LATCH_OK | MINI_TEMP_OK | MINI_POWER_OK | MINI_DOCKED)
enum mini_kind { MINI_STATUS=1, MINI_HEARTBEAT=2, MINI_ARM=3, MINI_STOP=4 };
struct mini_frame { uint32_t boot, sequence, epoch; uint16_t flags; uint8_t kind; };
struct mini_supervisor {
 uint32_t boot, epoch, sequence, heartbeat_at, arm_at;
 uint16_t inputs;
 bool seen_sequence, heartbeat_valid, arm_valid, local_armed, fault, output, last_button, dock_known, last_dock;
};
uint16_t mini_crc(const uint8_t *bytes, size_t size);
void mini_encode(const struct mini_frame *frame, uint8_t bytes[MINI_FRAME_BYTES]);
bool mini_decode(const uint8_t bytes[MINI_FRAME_BYTES], struct mini_frame *frame);
void mini_init(struct mini_supervisor *state, uint32_t boot);
void mini_tick(struct mini_supervisor *state, uint32_t now, uint16_t inputs);
bool mini_receive(struct mini_supervisor *state, uint32_t now, const struct mini_frame *frame);
uint16_t mini_status(const struct mini_supervisor *state);
#endif
