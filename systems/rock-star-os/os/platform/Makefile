CC ?= cc
CFLAGS ?= -O2
override CFLAGS += -std=c11 -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=2

all: rock-sandbox-exec
rock-sandbox-exec: sandbox-exec.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $< -lseccomp
clean:
	rm -f rock-sandbox-exec
.PHONY: all clean
