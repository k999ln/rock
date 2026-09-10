#define _GNU_SOURCE
#include "ipc.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Test-only transport harness. Not installed in the OS image. */
int main(int argc, char **argv)
{
    json_object *request, *response;
    char error[256];
    if (argc != 4) return 2;
    if (!strcmp(argv[3], "--oversized-request")) {
        char *oversized = malloc(ROCK_API_REQUEST_MAX + 1);
        if (!oversized) return 2;
        memset(oversized, 'x', ROCK_API_REQUEST_MAX);
        oversized[ROCK_API_REQUEST_MAX] = '\0';
        request = json_object_new_object();
        json_object_object_add(request, "text", json_object_new_string(oversized));
        free(oversized);
    } else request = json_tokener_parse(argv[3]);
    if (!request) return 2;
    response = rock_api_call(argv[1], (uid_t)strtoul(argv[2], NULL, 10), request, error, sizeof(error));
    json_object_put(request);
    if (!response) {
        fprintf(stderr, "%s\n", error);
        return 1;
    }
    puts(json_object_to_json_string_ext(response, JSON_C_TO_STRING_PLAIN));
    json_object_put(response);
    return 0;
}
