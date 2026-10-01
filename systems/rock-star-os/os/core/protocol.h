#ifndef ROCK_PROTOCOL_H
#define ROCK_PROTOCOL_H

#define ROCK_VERSION "0.1.0"
#define ROCK_UID 1000
#define ROCK_GID 1000
#define ROCK_SOCKET "/run/rock/rockd.sock"
#define ROCK_STATE_DIR "/var/lib/rock"
#define ROCK_MAX_INPUT 4096U
#define ROCK_HEADER_SIZE 80U
#define ROCK_RESPONSE_SIZE (ROCK_MAX_INPUT + 512U)
#define ROCK_TIMEOUT_MS 2000

#endif
