package dev.rock.automation;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Untrusted public metadata only. Never installs weights, follows links or grants execution authority. */
final class PublicModelDiscovery {
    static final int MAX_BYTES = 1_048_576;
    interface Transport { Reply get(String url) throws Exception; }
    static final class Reply {
        final int status; final String body; final long retrySeconds;
        Reply(int status, String body, long retrySeconds) { this.status = status; this.body = body; this.retrySeconds = retrySeconds; }
    }
    private final Transport transport;
    private long nextSearchAt, githubRetryAt, hfRetryAt;
    PublicModelDiscovery(Transport transport) { this.transport = transport; }
    static String query(String value) {
        if (value == null || value.trim().isEmpty() || value.length() > 80 || value.codePoints().anyMatch(Character::isISOControl))
            throw new IllegalArgumentException("INVALID_DISCOVERY_QUERY");
        return value.trim();
    }
    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    synchronized String search(String input, long now) throws Exception {
        String q = query(input);
        JSONObject out = new JSONObject().put("query", q).put("fetchedAt", now).put("executionStarted", false)
            .put("trustedForExecution", false).put("x", "external_search_only");
        if (now < nextSearchAt) return out.put("status", "rate_limited").put("retryAt", nextSearchAt)
            .put("sources", new JSONArray()).put("candidates", new JSONArray()).toString();
        nextSearchAt = now + 15_000;
        JSONArray candidates = new JSONArray(), sources = new JSONArray();
        for (String source : new String[]{"github", "huggingface"}) {
            long retry = "github".equals(source) ? githubRetryAt : hfRetryAt;
            JSONObject state = new JSONObject().put("source", source).put("requestedAt", now);
            if (now < retry) { sources.put(state.put("status", "rate_limited").put("retryAt", retry)); continue; }
            String url = "github".equals(source)
                ? "https://api.github.com/search/repositories?q=" + encode(q) + "&sort=updated&order=desc&per_page=4"
                : "https://huggingface.co/api/models?search=" + encode(q) + "&filter=gguf&limit=4&sort=downloads&direction=-1&full=true";
            try {
                Reply reply = transport.get(url);
                if (reply.status == 403 || reply.status == 429) {
                    long retryAt = now + Math.max(60, Math.min(3600, reply.retrySeconds)) * 1000;
                    if ("github".equals(source)) githubRetryAt = retryAt; else hfRetryAt = retryAt;
                    sources.put(state.put("status", "rate_limited").put("retryAt", retryAt)); continue;
                }
                if (reply.status != 200) { sources.put(state.put("status", "unavailable")); continue; }
                if (reply.body.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new IllegalArgumentException("RESPONSE_TOO_LARGE");
                JSONArray parsed = parse(source, reply.body);
                for (int i = 0; i < parsed.length(); i++) candidates.put(parsed.getJSONObject(i));
                state.put("status", "ok").put("count", parsed.length());
                if ("github".equals(source)) state.put("incompleteResults", new JSONObject(reply.body).optBoolean("incomplete_results"));
                sources.put(state);
            } catch (Exception unavailable) { sources.put(state.put("status", "unavailable")); }
        }
        int ok = 0; for (int i = 0; i < sources.length(); i++) if ("ok".equals(sources.getJSONObject(i).getString("status"))) ok++;
        return out.put("status", ok == 2 ? "ok" : ok == 1 ? "partial" : "unavailable")
            .put("sources", sources).put("candidates", candidates).toString();
    }
    static JSONArray parse(String source, String body) throws Exception {
        boolean github = "github".equals(source);
        if (!github && !"huggingface".equals(source)) throw new IllegalArgumentException("UNKNOWN_SOURCE");
        JSONArray raw = github ? new JSONObject(body).getJSONArray("items") : new JSONArray(body), out = new JSONArray();
        for (int i = 0; i < Math.min(4, raw.length()); i++) {
            JSONObject item = raw.getJSONObject(i);
            String id = item.optString(github ? "full_name" : "id");
            if (!id.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}")) continue;
            String license = "unknown";
            if (github) {
                JSONObject declared = item.optJSONObject("license");
                if (declared != null) license = clean(declared.optString("spdx_id", "unknown"), 80);
            } else {
                JSONArray tags = item.optJSONArray("tags");
                if (tags != null) for (int j = 0; j < Math.min(100, tags.length()); j++)
                    if (tags.optString(j).startsWith("license:")) { license = clean(tags.getString(j).substring(8), 80); break; }
            }
            out.put(new JSONObject().put("source", source).put("id", id)
                .put("url", (github ? "https://github.com/" : "https://huggingface.co/") + id)
                .put("licenseClaim", license).put("updatedAt", clean(item.optString(github ? "updated_at" : "lastModified"), 40))
                .put("description", clean(item.optString(github ? "description" : "pipeline_tag"), 240))
                .put("state", "unverified_candidate").put("trustedForExecution", false));
        }
        return out;
    }
    private static String clean(String value, int max) {
        String safe = value.replaceAll("[\\p{Cntrl}\\p{Cf}]", " "); return safe.substring(0, Math.min(max, safe.length()));
    }
    static Reply https(String url) throws Exception {
        URI uri = URI.create(url);
        if (!"https".equals(uri.getScheme()) || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getFragment() != null
            || !("api.github.com".equals(uri.getHost()) && "/search/repositories".equals(uri.getPath())
                || "huggingface.co".equals(uri.getHost()) && "/api/models".equals(uri.getPath())))
            throw new SecurityException("DISCOVERY_ORIGIN_DENIED");
        HttpsURLConnection c = (HttpsURLConnection) uri.toURL().openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(8000); c.setReadTimeout(8000);
        c.setRequestProperty("Accept", "application/json"); c.setRequestProperty("User-Agent", "RockstarOS-Developer-Preview-model-discovery");
        try {
            int status = c.getResponseCode(); long retry = 60;
            try { retry = Math.max(retry, Long.parseLong(c.getHeaderField("Retry-After"))); } catch (Exception absent) { }
            try { retry = Math.max(retry, Long.parseLong(c.getHeaderField("X-RateLimit-Reset")) - System.currentTimeMillis() / 1000); } catch (Exception absent) { }
            if (status != 200) return new Reply(status, "", retry);
            if (c.getContentLengthLong() > MAX_BYTES) throw new IllegalArgumentException("RESPONSE_TOO_LARGE");
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = in.read(buffer)) != -1) {
                    if (out.size() + count > MAX_BYTES) throw new IllegalArgumentException("RESPONSE_TOO_LARGE");
                    out.write(buffer, 0, count);
                }
                return new Reply(status, out.toString(StandardCharsets.UTF_8.name()), retry);
            }
        } finally { c.disconnect(); }
    }
}
