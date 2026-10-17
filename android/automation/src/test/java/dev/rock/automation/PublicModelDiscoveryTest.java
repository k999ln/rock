package dev.rock.automation;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
public final class PublicModelDiscoveryTest {
    private final String github = "{\"items\":[{\"full_name\":\"owner/model\",\"license\":{\"spdx_id\":\"MIT\"}},{\"full_name\":\"../bad\",\"html_url\":\"http://evil.test\"}]}";
    private final String hf = "[{\"id\":\"owner/model-GGUF\",\"tags\":[\"license:apache-2.0\"],\"pipeline_tag\":\"text-generation\"}]";
    @Test public void metadataIsBoundedAndSourceUrlCannotBeReplacedByRemoteInstructions() throws Exception {
        JSONArray a = PublicModelDiscovery.parse("github", github); assertEquals(1, a.length());
        assertEquals("https://github.com/owner/model", a.getJSONObject(0).getString("url"));
        assertFalse(a.getJSONObject(0).getBoolean("trustedForExecution"));
        assertEquals("apache-2.0", PublicModelDiscovery.parse("huggingface", hf).getJSONObject(0).getString("licenseClaim"));
    }
    @Test public void partialFailureAndSourceRateLimitsAreExplicitAndNotReplayedAsFreshResults() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        PublicModelDiscovery d = new PublicModelDiscovery(url -> { calls.incrementAndGet(); return url.contains("github") ? new PublicModelDiscovery.Reply(429, "", 120) : new PublicModelDiscovery.Reply(200, hf, 0); });
        JSONObject first = new JSONObject(d.search("Qwen", 1000)); assertEquals("partial", first.getString("status"));
        assertEquals(1, first.getJSONArray("candidates").length()); assertFalse(first.getBoolean("executionStarted"));
        assertEquals("rate_limited", new JSONObject(d.search("Qwen", 1001)).getString("status")); assertEquals(2, calls.get());
        JSONObject second = new JSONObject(d.search("Qwen", 20_000)); assertEquals("partial", second.getString("status")); assertEquals(3, calls.get());
    }
    @Test public void oversizeMalformedAndUnavailableRepliesCannotCreateCandidates() throws Exception {
        for (String body : new String[]{"not JSON", "x".repeat(PublicModelDiscovery.MAX_BYTES + 1)}) {
            PublicModelDiscovery d = new PublicModelDiscovery(url -> new PublicModelDiscovery.Reply(200, body, 0));
            JSONObject result = new JSONObject(d.search("Qwen", 1)); assertEquals("unavailable", result.getString("status")); assertEquals(0, result.getJSONArray("candidates").length());
        }
    }
    @Test public void invalidInputAndArbitraryOrRedirectOriginsAreDeniedBeforeNetwork() throws Exception {
        PublicModelDiscovery d = new PublicModelDiscovery(url -> { fail("must not request"); return null; });
        for (String q : new String[]{"", "x".repeat(81), "a\nb"}) try { d.search(q, 1); fail(); } catch (IllegalArgumentException expected) { }
        for (String url : new String[]{"http://api.github.com/search/repositories", "https://evil.test/api/models", "https://api.github.com@evil.test/search/repositories", "https://huggingface.co/other", "https://huggingface.co:444/api/models"})
            try { PublicModelDiscovery.https(url); fail(); } catch (SecurityException expected) { }
    }
}
