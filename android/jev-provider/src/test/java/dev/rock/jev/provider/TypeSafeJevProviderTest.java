package dev.rock.jev.provider;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Direct protocol and fail-closed tests; no device, network, or real key is used. */
public final class TypeSafeJevProviderTest {
    private static TypeSafeJevProvider.DecisionRequest request() throws Exception {
        Map<String, String> options = new LinkedHashMap<>();
        options.put("local", "Keep the work local");
        options.put("review", "Ask for review");
        return new TypeSafeJevProvider.DecisionRequest(
            "request-1", new JSONObject().put("topic", "public docs"), "classify", "none",
            List.of(new TypeSafeJevProvider.ChoiceQuestion("route", "Which safe route fits?", options)),
            5_000, 1_000);
    }

    private static TypeSafeJevProvider provider(AtomicReference<String> seenBody) {
        return new TypeSafeJevProvider(
            () -> "test-key".toCharArray(),
            (endpoint, authorization, body, timeoutMs) -> {
                assertEquals(TypeSafeJevProvider.OFFICIAL_ENDPOINT, endpoint);
                assertEquals("Bearer test-key", authorization);
                assertTrue(timeoutMs > 0 && timeoutMs <= 5_000);
                seenBody.set(body);
                return new TypeSafeJevProvider.HttpResponse(200, "application/json", response());
            },
            100);
    }

    private static String response() {
        return "{\"model\":\"jev-1.13.0\",\"answers\":{\"route\":{"
            + "\"type\":\"choice\",\"choice\":\"local\","
            + "\"probabilities\":{\"local\":0.8,\"review\":0.2},\"confidence\":0.8}},"
            + "\"usage\":{\"input_tokens\":12,\"output_tokens\":3}}";
    }

    @Test public void sendsOfficialTypedPayloadAndReturnsAdvisoryOnly() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        TypeSafeJevProvider.AdvisoryResult result = provider(body).decide(request());
        assertEquals("answered", result.status);
        assertEquals("TYPESAFE_SYSTEMONE", result.reasonCode);
        assertEquals("local", result.answers.get("route").value);
        assertFalse(result.externalActionAllowed);
        assertEquals("advisory-only", result.authority);
        assertTrue(body.get().contains("\"state\""));
        assertTrue(body.get().contains("\"model\":\"jev-1.13.0\""));
        assertTrue(body.get().contains("\"questions\""));
    }

    @Test public void disabledProviderFailsClosedWithoutTransport() throws Exception {
        TypeSafeJevProvider.AdvisoryResult result = TypeSafeJevProvider.disabled().decide(request());
        assertEquals("abstained", result.status);
        assertEquals("PROVIDER_DISABLED", result.reasonCode);
        assertTrue(result.answers.isEmpty());
    }

    @Test public void publicDataAndExternalWritesAreRejected() throws Exception {
        TypeSafeJevProvider.DecisionRequest secret = new TypeSafeJevProvider.DecisionRequest(
            "request-1", new JSONObject().put("api_key", "secret"), "classify", "none",
            request().questions(), 5_000, 1_000);
        assertEquals("SECRET_DATA_PROHIBITED", provider(new AtomicReference<>()).decide(secret).reasonCode);
        TypeSafeJevProvider.DecisionRequest write = new TypeSafeJevProvider.DecisionRequest(
            "request-1", new JSONObject().put("topic", "public docs"), "classify", "external-write",
            request().questions(), 5_000, 1_000);
        assertEquals("REQUEST_SCOPE_BLOCKED", provider(new AtomicReference<>()).decide(write).reasonCode);
    }

    @Test public void costGateAndMalformedResponseAbstain() throws Exception {
        TypeSafeJevProvider expensive = new TypeSafeJevProvider(
            () -> "test-key".toCharArray(), (endpoint, authorization, body, timeoutMs) -> {
                throw new AssertionError("transport must not be called");
            }, 1_001);
        assertEquals("MAX_COST_EXCEEDED", expensive.decide(request()).reasonCode);
        TypeSafeJevProvider malformed = new TypeSafeJevProvider(
            () -> "test-key".toCharArray(), (endpoint, authorization, body, timeoutMs) ->
                new TypeSafeJevProvider.HttpResponse(200, "application/json", "{\"model\":\"jev-1.13.0\"}"), 100);
        assertEquals("PROVIDER_MALFORMED_RESPONSE", malformed.decide(request()).reasonCode);
    }

    @Test public void oversizedResponseAndUnknownModelAbstain() throws Exception {
        StringBuilder huge = new StringBuilder(TypeSafeJevProvider.MAX_RESPONSE_BYTES + 1);
        for (int i = 0; i <= TypeSafeJevProvider.MAX_RESPONSE_BYTES; i++) huge.append('x');
        TypeSafeJevProvider tooLarge = new TypeSafeJevProvider(
            () -> "test-key".toCharArray(), (endpoint, authorization, body, timeoutMs) ->
                new TypeSafeJevProvider.HttpResponse(200, "application/json", huge.toString()), 100);
        assertEquals("PROVIDER_RESPONSE_TOO_LARGE", tooLarge.decide(request()).reasonCode);
        TypeSafeJevProvider unknownModel = new TypeSafeJevProvider(
            () -> "test-key".toCharArray(), (endpoint, authorization, body, timeoutMs) ->
                new TypeSafeJevProvider.HttpResponse(200, "application/json", response().replace("jev-1.13.0", "other-1")), 100);
        assertEquals("PROVIDER_MALFORMED_RESPONSE", unknownModel.decide(request()).reasonCode);
    }
}
