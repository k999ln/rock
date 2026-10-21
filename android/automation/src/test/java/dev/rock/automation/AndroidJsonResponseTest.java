package dev.rock.automation;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;
import static org.junit.Assert.*;

/** Pure host checks for shared mechanics; AndroidResponseDeadlineTest exercises all four callers. */
public final class AndroidJsonResponseTest {
    private static final String[] PREFIXES = { "DEVICE_AUTH", "DEVICE_HOME", "DEVICE_LLM_QUOTE",
        "DEVICE_LLM_POST", "A2A_BROKER", "A2A_WALLET_HANDOFF" };

    @Test public void jsonCharsetAndIdentityVariantsRemainAccepted() throws Exception {
        for (String prefix : PREFIXES)
            for (String type : new String[] { "application/json", " Application/JSON ; charset=utf-8" })
                for (String encoding : new String[] { null, "identity", " Identity " })
                    AndroidJsonResponse.requireJsonHeaders(new Headers(type, encoding), prefix);
    }

    @Test public void invalidMediaTypeKeepsCallerErrorAndPrecedesEncodingInspection() throws Exception {
        for (String prefix : PREFIXES)
            for (String type : new String[] { null, "", "text/plain", "application/jsonp", "application/json, text/plain" }) {
                Headers headers = new Headers(type, "gzip");
                IOException failure = assertThrows(IOException.class,
                    () -> AndroidJsonResponse.requireJsonHeaders(headers, prefix));
                assertEquals(prefix + "_CONTENT_TYPE_INVALID", failure.getMessage());
                assertEquals(0, headers.encodingReads);
            }
    }

    @Test public void compressedAndEmptyEncodingsKeepCallerErrors() throws Exception {
        for (String prefix : PREFIXES)
            for (String encoding : new String[] { "gzip", "br", "", "identity, gzip" }) {
                IOException failure = assertThrows(IOException.class,
                    () -> AndroidJsonResponse.requireJsonHeaders(new Headers("application/json", encoding), prefix));
                assertEquals(prefix + "_CONTENT_ENCODING_INVALID", failure.getMessage());
            }
    }

    @Test public void unicodeDecodePreservesCallerOwnedBytes() throws Exception {
        String text = "{\"message\":\"日本語 🪨\"}";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8), original = bytes.clone();
        assertEquals(text, AndroidJsonResponse.decodeUtf8(bytes));
        assertArrayEquals(original, bytes);
    }

    @Test public void malformedUtf8NeverUsesReplacementCharacters() {
        for (byte[] bytes : new byte[][] { {(byte) 0xc3, 0x28}, {(byte) 0xe2, (byte) 0x82},
                {(byte) 0xc0, (byte) 0x80}, {(byte) 0xed, (byte) 0xa0, (byte) 0x80} })
            assertThrows(CharacterCodingException.class, () -> AndroidJsonResponse.decodeUtf8(bytes));
    }

    @Test public void authorizationAndHandoffRetainDistinctUtf8Errors() throws Exception {
        Object[][] parsers = {
            { AndroidRockstarDeviceAuthorizationTransport.class, "parseFlatObject", "DEVICE_AUTH" },
            { AndroidA2AWalletHandoffSource.class, "parseObject", "A2A_WALLET_HANDOFF" }
        };
        for (Object[] parser : parsers) {
            Method method = ((Class<?>) parser[0]).getDeclaredMethod((String) parser[1], byte[].class);
            method.setAccessible(true);
            InvocationTargetException wrapped = assertThrows(InvocationTargetException.class,
                () -> method.invoke(null, new byte[] {(byte) 0xc3, 0x28}));
            assertTrue(wrapped.getCause() instanceof IOException);
            assertEquals(parser[2] + "_RESPONSE_UTF8_INVALID", wrapped.getCause().getMessage());
        }
    }

    @Test public void shortAndZeroReadsKeepTheSameAbsoluteDeadline() throws Exception {
        AtomicLong clock = new AtomicLong(5);
        int[] reads = {0};
        InputStream stream = new InputStream() {
            @Override public int read() { throw new AssertionError("bulk read expected"); }
            @Override public int read(byte[] bytes, int offset, int length) {
                clock.incrementAndGet();
                int read = reads[0]++;
                if (read == 0) return 0;
                if (read == 3) return -1;
                bytes[offset] = (byte) ('a' + read - 1);
                return 1;
            }
        };
        assertArrayEquals(new byte[] {'a', 'b'},
            AndroidJsonResponse.readBounded(stream, 2, 10, clock::get, "DEVICE_HOME"));
        assertEquals(4, reads[0]);
    }

    @Test public void exactDeadlineStopsBeforeReadAndAfterLateBytesOrEof() throws Exception {
        AtomicLong clock = new AtomicLong(10);
        InputStream unread = new InputStream() {
            @Override public int read() { throw new AssertionError("expired read began"); }
        };
        assertEquals("DEVICE_AUTH_RESPONSE_TIMEOUT", assertThrows(IOException.class,
            () -> AndroidJsonResponse.readBounded(unread, 2, 10, clock::get, "DEVICE_AUTH")).getMessage());
        for (int returned : new int[] {-1, 0, 2}) {
            clock.set(9);
            InputStream late = new InputStream() {
                @Override public int read() { throw new AssertionError("bulk read expected"); }
                @Override public int read(byte[] bytes, int offset, int length) {
                    clock.set(10); return returned;
                }
            };
            assertEquals("A2A_BROKER_RESPONSE_TIMEOUT", assertThrows(IOException.class,
                () -> AndroidJsonResponse.readBounded(late, 1, 10, clock::get, "A2A_BROKER")).getMessage());
        }
    }

    @Test public void sizeLimitAndStreamCleanupRemainCallerOwned() throws Exception {
        for (int limit : new int[] {1, 2}) {
            boolean[] closed = {false};
            InputStream stream = new ByteArrayInputStream(new byte[] {'{', '}'}) {
                @Override public void close() { closed[0] = true; }
            };
            if (limit == 2)
                assertArrayEquals(new byte[] {'{', '}'},
                    AndroidJsonResponse.readBounded(stream, limit, 10, () -> 1, "A2A_WALLET_HANDOFF"));
            else
                assertEquals("A2A_WALLET_HANDOFF_RESPONSE_TOO_LARGE", assertThrows(IOException.class,
                    () -> AndroidJsonResponse.readBounded(stream, limit, 10, () -> 1, "A2A_WALLET_HANDOFF")).getMessage());
            assertFalse(closed[0]);
        }
    }

    @Test public void streamFailureIsPropagatedWithoutRetryOrCleanup() {
        IOException offline = new IOException("fixture offline");
        InputStream stream = new InputStream() {
            @Override public int read() throws IOException { throw offline; }
            @Override public void close() { throw new AssertionError("caller owns cleanup"); }
        };
        assertSame(offline, assertThrows(IOException.class,
            () -> AndroidJsonResponse.readBounded(stream, 2, 10, () -> 1, "DEVICE_HOME")));
    }

    private static final class Headers extends HttpURLConnection {
        private final String type, encoding;
        int encodingReads;
        Headers(String type, String encoding) throws Exception {
            super(new URL("https://rockstar.example")); this.type = type; this.encoding = encoding;
        }
        @Override public String getContentType() { return type; }
        @Override public String getContentEncoding() { encodingReads++; return encoding; }
        @Override public void disconnect() { throw new AssertionError("caller owns cleanup"); }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { throw new AssertionError("network not expected"); }
    }
}
