CC ?= cc
CFLAGS ?= -O2
override CFLAGS += -std=c11 -Wall -Wextra -Werror -fstack-protector-strong
CPPFLAGS ?=
LDFLAGS ?=
LDLIBS ?=
DESTDIR ?=
PREFIX ?= /usr

.PHONY: all clean install test

.PHONY: all clean install test
all: rockd rockctl rocktest

rockd: rockd.c protocol.h io.h
	$(CC) $(CPPFLAGS) $(CFLAGS) $(LDFLAGS) -o $@ rockd.c $(LDLIBS)

rockctl: rockctl.c protocol.h io.h
	$(CC) $(CPPFLAGS) $(CFLAGS) $(LDFLAGS) -o $@ rockctl.c $(LDLIBS)

rocktest: rocktest.c protocol.h io.h
	$(CC) $(CPPFLAGS) $(CFLAGS) $(LDFLAGS) -o $@ rocktest.c $(LDLIBS)

install: all
	install -D -m 0755 rockd $(DESTDIR)$(PREFIX)/sbin/rockd
	install -D -m 0755 rockctl $(DESTDIR)$(PREFIX)/bin/rockctl
	install -D -m 0755 rocktest $(DESTDIR)$(PREFIX)/libexec/rocktest

# Requires root ONLY within the disposable Linux test guest.
test: all
	./rocktest ./rockd ./rockctl

clean:
	rm -f rockd rockctl rocktest
