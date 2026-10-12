package dev.rock.automation;

import android.os.SystemClock;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collection;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import static org.junit.Assert.*;

/** Runs the four production response readers with real monotonic time and controlled streams. */
@RunWith(Parameterized.class)
public final class AndroidResponseDeadlineTest {
    @Parameterized.Parameters(name = "{0}") public static Collection<Object[]> readers() {
        return Arrays.asList(new Object[][] {
            {AndroidRockstarDeviceHomeTransport.class, "DEVICE_HOME"},
            {AndroidRockstarDeviceAuthorizationTransport.class, "DEVICE_AUTH"},
            {AndroidA2ABrokerDeviceTransport.class, "A2A_BROKER"},
            {AndroidA2AWalletHandoffSource.class, "A2A_WALLET_HANDOFF"}
        });
    }

    private final Method reader;
    private final String prefix;
    public AndroidResponseDeadlineTest(Class<?> transport, String prefix) throws Exception {
        reader = transport.getDeclaredMethod("readBounded", InputStream.class, int.class, long.class);
        reader.setAccessible(true);
        this.prefix = prefix;
    }

    @Test public void expiredEmptyResponseCannotBypassTheDeadline() throws Exception {
        assertTimeout(new ByteArrayInputStream(new byte[0]), SystemClock.elapsedRealtime() - 1);
    }

    @Test public void expiredDeadlineDoesNotStartAnotherBlockingRead() throws Exception {
        assertTimeout(new InputStream() {
            @Override public int read() { throw new AssertionError("read began after the deadline"); }
        }, SystemClock.elapsedRealtime() - 1);
    }

    @Test public void lateEofCannotTurnCompleteJsonIntoSuccess() throws Exception {
        byte[] json = "{\"state\":\"ready\"}".getBytes(StandardCharsets.UTF_8);
        long deadline = SystemClock.elapsedRealtime() + 500;
        boolean[] reachedEof = {false};
        InputStream stream = new ByteArrayInputStream(json) {
            @Override public synchronized int read(byte[] buffer, int offset, int length) {
                if (available() == 0) {
                    reachedEof[0] = true;
                    while (SystemClock.elapsedRealtime() <= deadline) pause(5);
                }
                return super.read(buffer, offset, length);
            }
        };
        assertTimeout(stream, deadline);
        assertTrue("fixture must reach the delayed EOF", reachedEof[0]);
    }

    @Test public void smallChunksStopAtTimeLimitBeforeByteLimit() throws Exception {
        int[] reads = {0};
        InputStream stream = new InputStream() {
            @Override public int read() { throw new AssertionError("bulk read expected"); }
            @Override public int read(byte[] buffer, int offset, int length) {
                pause(5);
                if (++reads[0] > 100) return -1;
                buffer[offset] = ' ';
                return 1;
            }
        };
        assertTimeout(stream, SystemClock.elapsedRealtime() + 30);
        assertTrue("deadline must stop the stream before the fixture ends", reads[0] < 100);
    }

    @Test public void timelyJsonAndByteLimitArePreserved() throws Exception {
        byte[] json = "{}".getBytes(StandardCharsets.UTF_8);
        assertArrayEquals(json, read(new ByteArrayInputStream(json), 2, SystemClock.elapsedRealtime() + 5_000));
        try { read(new ByteArrayInputStream(json), 1, SystemClock.elapsedRealtime() + 5_000); fail(); }
        catch (IOException expected) { assertEquals(prefix + "_RESPONSE_TOO_LARGE", expected.getMessage()); }
    }

    private void assertTimeout(InputStream input, long deadline) throws Exception {
        try { read(input, 64_000, deadline); fail("expired response accepted"); }
        catch (IOException expected) { assertEquals(prefix + "_RESPONSE_TIMEOUT", expected.getMessage()); }
    }

    private byte[] read(InputStream input, int maximum, long deadline) throws Exception {
        try { return (byte[]) reader.invoke(null, input, maximum, deadline); }
        catch (InvocationTargetException wrapped) {
            Throwable failure = wrapped.getCause();
            if (failure instanceof Exception) throw (Exception) failure;
            if (failure instanceof Error) throw (Error) failure;
            throw new AssertionError(failure);
        }
    }

    private static void pause(long milliseconds) {
        try { Thread.sleep(milliseconds); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new AssertionError(interrupted);
        }
    }
}
