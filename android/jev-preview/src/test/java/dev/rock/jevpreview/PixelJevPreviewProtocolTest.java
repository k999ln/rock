package dev.rock.jevpreview;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

/** Tests the debug relay response boundary without a device or network. */
public final class PixelJevPreviewProtocolTest {
    @Test public void acceptsOnlyTheFixedSuccessShape() throws Exception {
        PixelJevPreviewDebug.PreviewResult result = PixelJevPreviewDebug.parse(
            "{\"status\":\"ok\",\"answer\":\"local\","
                + "\"token\":{\"input\":367,\"output\":31},"
                + "\"model\":\"jev-1.13.0\"}");
        assertEquals("ok", result.status);
        assertEquals("local", result.answer);
        assertEquals(367, result.inputTokens);
        assertEquals(31, result.outputTokens);
        assertEquals("jev-1.13.0", result.model);
    }

    @Test public void acceptsSafeErrorStateWithoutProviderDetails() throws Exception {
        PixelJevPreviewDebug.PreviewResult result = PixelJevPreviewDebug.parse(
            "{\"status\":\"timeout\",\"answer\":\","
                + "\"token\":{\"input\":0,\"output\":0},\"model\":\"\"}");
        assertEquals("timeout", result.status);
        assertEquals("", result.answer);
        assertEquals("", result.model);
    }

    @Test(expected = PixelJevPreviewDebug.PreviewException.class)
    public void rejectsUnknownFields() throws Exception {
        PixelJevPreviewDebug.parse(
            "{\"status\":\"ok\",\"answer\":\"local\","
                + "\"token\":{\"input\":1,\"output\":1},"
                + "\"model\":\"jev-1.13.0\",\"raw\":\"secret\"}");
    }

    @Test(expected = PixelJevPreviewDebug.PreviewException.class)
    public void rejectsNonLocalSuccessAnswer() throws Exception {
        PixelJevPreviewDebug.parse(
            "{\"status\":\"ok\",\"answer\":\"unknown\","
                + "\"token\":{\"input\":1,\"output\":1},"
                + "\"model\":\"jev-1.13.0\"}");
    }
}
