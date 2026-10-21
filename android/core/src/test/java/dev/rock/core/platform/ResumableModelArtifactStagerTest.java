package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public final class ResumableModelArtifactStagerTest {
    private interface ResponseFactory {
        ResumableModelArtifactStager.Download open(ModelProfileManifest profile, long offset) throws IOException;
    }

    private static final class Source implements ResumableModelArtifactStager.ArtifactSource {
        private final ResponseFactory factory;
        Source(ResponseFactory factory) { this.factory = factory; }
        @Override public ResumableModelArtifactStager.Download open(ModelProfileManifest profile, long offset)
            throws IOException { return factory.open(profile, offset); }
    }

    private static ModelProfileManifest profile(byte[] weights, String digestOverride) throws Exception {
        String hash = digestOverride == null ? hex(MessageDigest.getInstance("SHA-256").digest(weights)) : digestOverride;
        return new ModelProfileManifest("profile.lifeline.qwen", 1, hash,
            Engine.digest("tokenizer"), Engine.digest("template"), "Apache-2.0", "publisher.qwen",
            "qwen.release.1", "A".repeat(86), "org.rockstar.runtime.localai", 2, 1, 1,
            "GGUF", "Q4_K_M", 8192, "article-preparation@1/input-v1", weights.length, 4096);
    }

    private static ResumableModelArtifactStager.Download response(int status, long start, long length,
        byte[] body) {
        return new ResumableModelArtifactStager.Download() {
            private final InputStream input = new ByteArrayInputStream(body);
            @Override public int statusCode() { return status; }
            @Override public long rangeStart() { return start; }
            @Override public long contentLength() { return length; }
            @Override public InputStream body() { return input; }
            @Override public void close() throws IOException { input.close(); }
        };
    }

    private static ResumableModelArtifactStager stager(Path root,
        ResumableModelArtifactStager.ArtifactSource source) {
        return new ResumableModelArtifactStager(root, source, path -> Long.MAX_VALUE, 0, 1024 * 1024);
    }

    private static Path partial(Path root, ModelProfileManifest profile) {
        return root.resolve(profile.profileId + "-" + profile.version + "-" + profile.digest())
            .resolve("weights.partial");
    }

    private static String hex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] value = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int b = bytes[i] & 0xff;
            value[i * 2] = digits[b >>> 4]; value[i * 2 + 1] = digits[b & 0xf];
        }
        return new String(value);
    }

    @Test public void interruptedDownloadResumesAtExactOffsetAndPromotesOnlyVerifiedBytes() throws Exception {
        Path root = Files.createTempDirectory("rock-model-stage-resume");
        byte[] weights = "verified local model bytes".getBytes(StandardCharsets.UTF_8);
        int cutoff = 9;
        ModelProfileManifest profile = profile(weights, null);
        List<Long> offsets = new ArrayList<>();
        ResumableModelArtifactStager stager = stager(root, (selected, offset) -> {
            assertEquals(profile.digest(), selected.digest());
            offsets.add(offset);
            if (offset == 0) return response(200, 0, weights.length,
                Arrays.copyOfRange(weights, 0, cutoff));
            return response(206, cutoff, weights.length - cutoff,
                Arrays.copyOfRange(weights, cutoff, weights.length));
        });

        assertThrows(IllegalStateException.class, () -> stager.verifyAndStage(profile));
        assertEquals(cutoff, Files.size(partial(root, profile)));
        String receipt = stager.verifyAndStage(profile);
        assertTrue(receipt.matches("[a-f0-9]{64}"));
        Path staged = stager.stagedPath(profile);
        assertArrayEquals(weights, Files.readAllBytes(staged));
        assertFalse(Files.exists(partial(root, profile)));
        assertEquals(Arrays.asList(0L, (long) cutoff), offsets);
        assertEquals(receipt, stager.verifyAndStage(profile));
        assertEquals("cached verified file must not download again", 2, offsets.size());
    }

    @Test public void rejectsBadHashAndRemovesTheUntrustedPartial() throws Exception {
        Path root = Files.createTempDirectory("rock-model-stage-hash");
        byte[] weights = "untrusted bytes".getBytes(StandardCharsets.UTF_8);
        ModelProfileManifest profile = profile(weights, "0".repeat(64));
        ResumableModelArtifactStager stager = stager(root,
            (selected, offset) -> response(200, 0, weights.length, weights));

        assertThrows(SecurityException.class, () -> stager.verifyAndStage(profile));
        assertFalse(Files.exists(partial(root, profile)));
        assertThrows(SecurityException.class, () -> stager.stagedPath(profile));
    }

    @Test public void rejectsWrongRangeLengthBodyOverflowInsufficientSpaceAndSymlinkFiles() throws Exception {
        byte[] weights = "eight888".getBytes(StandardCharsets.UTF_8);
        ModelProfileManifest profile = profile(weights, null);

        Path wrongRangeRoot = Files.createTempDirectory("rock-model-stage-range");
        ResumableModelArtifactStager wrongRange = stager(wrongRangeRoot,
            (selected, offset) -> response(206, 1, weights.length, weights));
        assertThrows(SecurityException.class, () -> wrongRange.verifyAndStage(profile));

        Path overflowRoot = Files.createTempDirectory("rock-model-stage-overflow");
        ResumableModelArtifactStager overflow = stager(overflowRoot,
            (selected, offset) -> response(200, 0, weights.length,
                Arrays.copyOf(weights, weights.length + 1)));
        assertThrows(SecurityException.class, () -> overflow.verifyAndStage(profile));
        assertEquals(0, Files.size(partial(overflowRoot, profile)));

        Path spaceRoot = Files.createTempDirectory("rock-model-stage-space");
        final int[] sourceCalls = {0};
        ResumableModelArtifactStager noSpace = new ResumableModelArtifactStager(spaceRoot,
            (selected, offset) -> { sourceCalls[0]++; return response(200, 0, weights.length, weights); },
            directory -> weights.length - 1, 0, 1024);
        assertThrows(IllegalStateException.class, () -> noSpace.verifyAndStage(profile));
        assertEquals("space is checked before network access", 0, sourceCalls[0]);

        Path symlinkRoot = Files.createTempDirectory("rock-model-stage-symlink");
        Path profileDir = symlinkRoot.resolve(profile.profileId + "-" + profile.version + "-" + profile.digest());
        Files.createDirectory(profileDir);
        Path victim = Files.createTempFile("rock-model-stage-victim", ".bin");
        Files.write(victim, weights);
        Files.createSymbolicLink(partial(symlinkRoot, profile), victim);
        ResumableModelArtifactStager linkSafe = stager(symlinkRoot,
            (selected, offset) -> response(200, 0, weights.length, weights));
        assertThrows(SecurityException.class, () -> linkSafe.verifyAndStage(profile));
        assertArrayEquals(weights, Files.readAllBytes(victim));
    }
}
