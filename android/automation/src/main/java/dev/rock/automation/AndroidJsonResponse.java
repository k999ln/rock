package dev.rock.automation;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.function.LongSupplier;

/** Shared response mechanics; each transport owns status, identity, schema and resource cleanup. */
final class AndroidJsonResponse {
    private AndroidJsonResponse() { }

    static void requireJsonHeaders(HttpURLConnection connection, String errorPrefix) throws IOException {
        String contentType = connection.getContentType();
        if (contentType == null || !"application/json".equalsIgnoreCase(contentType.split(";", 2)[0].trim()))
            throw new IOException(errorPrefix + "_CONTENT_TYPE_INVALID");
        String encoding = connection.getContentEncoding();
        if (encoding != null && !"identity".equalsIgnoreCase(encoding.trim()))
            throw new IOException(errorPrefix + "_CONTENT_ENCODING_INVALID");
    }

    static String decodeUtf8(byte[] bytes) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString();
    }

    /** The caller supplies its existing absolute monotonic deadline and retains the stream. */
    static byte[] readBounded(InputStream input, int maximum, long deadline,
            LongSupplier elapsedRealtime, String errorPrefix) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[1_024];
        while (true) {
            if (elapsedRealtime.getAsLong() >= deadline) throw new IOException(errorPrefix + "_RESPONSE_TIMEOUT");
            int count = input.read(buffer);
            if (elapsedRealtime.getAsLong() >= deadline) throw new IOException(errorPrefix + "_RESPONSE_TIMEOUT");
            if (count == -1) break;
            if (output.size() > maximum - count) throw new IOException(errorPrefix + "_RESPONSE_TOO_LARGE");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
