CC ?= cc
PKG_CONFIG ?= pkg-config
CFLAGS ?= -O2
override CFLAGS += -std=c11 -Wall -Wextra -Werror -fstack-protector-strong -pthread
override CPPFLAGS += $(shell $(PKG_CONFIG) --cflags cairo freetype2 json-c)
override LDLIBS += $(shell $(PKG_CONFIG) --libs cairo freetype2 json-c) -lm -pthread

.PHONY: all clean install test test-health
all: rock-ui

rock-ui: main.o ui.o device.o ipc.o health.o
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^ $(LDLIBS)

main.o: main.c ui.h ipc.h device.h health.h
ui.o: ui.c ui.h ipc.h remote-ui.inc atm-ui.inc auth-ui.inc service-ui.inc activation-ui.inc mcp-ui.inc
device.o: device.c device.h
ipc.o: ipc.c ipc.h
health.o: health.c health.h

install: rock-ui
	install -D -m 0755 rock-ui $(DESTDIR)/usr/bin/rock-ui

clean:
	rm -f rock-ui *.o rock-ui-test rock-ipc-test rock-ui-health-test

# Real root -> UID1000 peer checks require root; this separate Linux target is
# not installed and never changes the normal unprivileged visual test target.
rock-ui-health-test: test_health.c health.c health.h
	$(CC) $(CFLAGS) -DROCK_UI_HEALTH_TEST $(LDFLAGS) -o $@ test_health.c health.c

test-health: rock-ui-health-test
	./rock-ui-health-test

rock-ui-test: test_ui.o ui.o device.o ipc.o
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^ $(LDLIBS)

rock-ipc-test: test_ipc.o ipc.o
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $^ $(LDLIBS)

test_ui.o: test_ui.c ui.h device.h test_remote.inc test_atm.inc test_auth.inc test_service.inc test_activation.inc test_mcp.inc test_lifecycle.inc
test_ipc.o: test_ipc.c ipc.h

test: rock-ui-test rock-ipc-test
	./rock-ui-test $(FONT)
	python3 test_ipc.py
	python3 -B test_evidence.py
