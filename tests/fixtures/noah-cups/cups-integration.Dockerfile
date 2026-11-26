FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV LC_ALL=C
ENV LANG=C

# Keep package installation from trying to start a daemon while the image is
# being built. The test starts exactly one foreground cupsd per container.
RUN set -eux; \
    printf '%s\n' '#!/bin/sh' 'exit 101' > /usr/sbin/policy-rc.d; \
    chmod 755 /usr/sbin/policy-rc.d; \
    apt-get update; \
    apt-get install -y --no-install-recommends cups cups-client cups-bsd; \
    rm -f /usr/sbin/policy-rc.d; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /run/cups /var/log/cups /var/spool/cups/tmp; \
    chown -R lp:lp /var/log/cups /var/spool/cups

CMD ["/usr/sbin/cupsd", "-f"]
