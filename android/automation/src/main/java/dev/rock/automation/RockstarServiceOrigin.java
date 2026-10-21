package dev.rock.automation;

import java.net.URI;

/** Service-origin identity shared by transport configuration and encrypted session storage. */
final class RockstarServiceOrigin {
    private RockstarServiceOrigin() { }

    static String canonicalOrigin(String value) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_REQUIRED");
        final URI uri;
        try { uri = URI.create(value); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_INVALID", invalid); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
                (uri.getPort() != -1 && uri.getPort() != 443) ||
                (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath())))
            throw new IllegalArgumentException("ROCKSTAR_SERVICE_ORIGIN_INVALID");
        int port = uri.getPort();
        return "https://" + uri.getHost().toLowerCase(java.util.Locale.ROOT) +
            (port == -1 || port == 443 ? "" : ":" + port);
    }
}
