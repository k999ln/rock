#ifndef ROCK_UI_IPC_H
#define ROCK_UI_IPC_H
#include <json-c/json.h>
#include <stddef.h>
#include <sys/types.h>

#define ROCK_API_SOCKET "/run/rock-platform/api.sock"
#define ROCK_API_UID 1002
#define ROCK_AUTH_SOCKET "/run/rock-authenticator/api.sock"
#define ROCK_AUTH_UID 1004
#define ROCK_API_REQUEST_MAX (256U * 1024U)
#define ROCK_API_RESPONSE_MAX (1024U * 1024U)

/* Returns an owned JSON object, including ok:false backend responses.
 * NULL means a transport/protocol failure; error is always initialized. */
json_object *rock_api_call(const char *socket_path, uid_t expected_uid,
                           json_object *request, char *error, size_t error_size);
int rock_request_key(char *out, size_t size);
int rock_auth_operation(const char *operation);
#endif
