package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.OpenOption;
import java.security.MessageDigest;
import java.util.Set;
import java.util.Objects;

/** Broker-owned bounded, resumable, hash-verified staging for one signed model weight artifact. */
public final class ResumableModelArtifactStager implements TrustedModelArtifactPipeline.StagedArtifactVerifier {
    public static final long MAX_ARTIFACT_BYTES = 4_294_967_296L;
    public static final long DEFAULT_FREE_SPACE_RESERVE_BYTES = 64L * 1024 * 1024;
    private static final int CHUNK_BYTES = 64 * 1024;

    /** Provider adapter must implement exact HTTP full-response and Range-response semantics. */
    public interface ArtifactSource {
        Download open(ModelProfileManifest profile, long offset) throws IOException;
    }

    public interface Download extends AutoCloseable {
        int statusCode();
        long rangeStart();
        long contentLength();
        InputStream body();
        @Override void close() throws IOException;
    }

    @FunctionalInterface
    public interface UsableSpaceProbe {
        long bytesAvailable(Path directory) throws IOException;
    }

    private final Path root;
    private final ArtifactSource source;
    private final UsableSpaceProbe spaceProbe;
    private final long reserveBytes;
    private final long maxArtifactBytes;

    public ResumableModelArtifactStager(Path brokerPrivateRoot, ArtifactSource source) {
        this(brokerPrivateRoot, source,
            directory -> directory.toFile().getUsableSpace(),
            DEFAULT_FREE_SPACE_RESERVE_BYTES, MAX_ARTIFACT_BYTES);
    }

    public ResumableModelArtifactStager(Path brokerPrivateRoot, ArtifactSource source,
        UsableSpaceProbe spaceProbe, long reserveBytes, long maxArtifactBytes) {
        if (brokerPrivateRoot == null || !brokerPrivateRoot.isAbsolute())
            throw new IllegalArgumentException("ABSOLUTE_BROKER_MODEL_ROOT_REQUIRED");
        if (reserveBytes < 0 || maxArtifactBytes < 1 || maxArtifactBytes > MAX_ARTIFACT_BYTES)
            throw new IllegalArgumentException("INVALID_MODEL_STAGING_LIMIT");
        this.root = brokerPrivateRoot.normalize();
        this.source = Objects.requireNonNull(source, "MODEL_ARTIFACT_SOURCE_REQUIRED");
        this.spaceProbe = Objects.requireNonNull(spaceProbe, "MODEL_SPACE_PROBE_REQUIRED");
        this.reserveBytes = reserveBytes;
        this.maxArtifactBytes = maxArtifactBytes;
    }

    /** Returns a receipt only after exact length and SHA-256 verification plus atomic promotion. */
    @Override public String verifyAndStage(ModelProfileManifest profile) {
        Objects.requireNonNull(profile, "MODEL_PROFILE_REQUIRED");
        try {
            Path staged = stage(profile);
            return Engine.digest("rockstaros-staged-model-weight/1\n" + profile.digest() + "\n"
                + profile.weightsSha256 + "\n" + profile.artifactBytes + "\n" + staged.getFileName());
        } catch (IOException failure) {
            throw new IllegalStateException("MODEL_ARTIFACT_STAGING_FAILED", failure);
        }
    }

    /** Stable Broker-private path for a fully verified staged file; callers must not expose it to Tools. */
    public Path stagedPath(ModelProfileManifest profile) throws IOException {
        Objects.requireNonNull(profile, "MODEL_PROFILE_REQUIRED");
        ensureRoot();
        Path directory = root.resolve(directoryName(profile)).normalize();
        requireDirectChild(directory);
        ensureSafeDirectory(directory);
        Path ready = directory.resolve(fileName(profile));
        requireDirectChild(ready);
        if (Files.exists(ready, LinkOption.NOFOLLOW_LINKS)) {
            requireRegularFile(ready);
            if (Files.size(ready) != profile.artifactBytes || !profile.weightsSha256.equals(sha256(ready)))
                throw new SecurityException("STAGED_MODEL_FILE_CHANGED");
            return ready;
        }
        return stage(profile);
    }

    private Path stage(ModelProfileManifest profile) throws IOException {
        if (profile.artifactBytes < 1 || profile.artifactBytes > maxArtifactBytes)
            throw new SecurityException("MODEL_ARTIFACT_SIZE_OUT_OF_RANGE");
        ensureRoot();
        Path directory = root.resolve(directoryName(profile)).normalize();
        requireDirectChild(directory);
        ensureSafeDirectory(directory);
        Path lockPath = directory.resolve(".stage.lock");
        Path partial = directory.resolve("weights.partial");
        Path ready = directory.resolve(fileName(profile));
        requireDirectChild(lockPath); requireDirectChild(partial); requireDirectChild(ready);
        rejectSymlinkIfPresent(lockPath); rejectSymlinkIfPresent(partial); rejectSymlinkIfPresent(ready);

        try (FileChannel lockChannel = FileChannel.open(lockPath,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
            FileLock lock;
            try { lock = lockChannel.tryLock(); }
            catch (OverlappingFileLockException busy) { throw new IllegalStateException("MODEL_STAGING_BUSY", busy); }
            if (lock == null) throw new IllegalStateException("MODEL_STAGING_BUSY");
            try (FileLock ignored = lock) {
                if (Files.exists(ready, LinkOption.NOFOLLOW_LINKS)) {
                    requireRegularFile(ready);
                    verifyComplete(ready, profile);
                    return ready;
                }
                long offset = 0;
                if (Files.exists(partial, LinkOption.NOFOLLOW_LINKS)) {
                    requireRegularFile(partial);
                    offset = Files.size(partial);
                    if (offset > profile.artifactBytes) {
                        Files.delete(partial);
                        throw new SecurityException("MODEL_PARTIAL_EXCEEDS_MANIFEST_SIZE");
                    }
                }
                ensureSpace(directory, profile.artifactBytes - offset);
                if (offset < profile.artifactBytes) download(profile, directory, partial, offset);
                verifyComplete(partial, profile);
                try {
                    Files.move(partial, ready, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException unsupported) {
                    throw new IOException("ATOMIC_MODEL_PROMOTION_UNAVAILABLE", unsupported);
                }
                verifyComplete(ready, profile);
                return ready;
            }
        }
    }

    private void download(ModelProfileManifest profile, Path directory, Path partial, long offset) throws IOException {
        try (Download download = source.open(profile, offset)) {
            if (download == null) throw new IOException("MODEL_SOURCE_BODY_REQUIRED");
            InputStream input = download.body();
            if (input == null) throw new IOException("MODEL_SOURCE_BODY_REQUIRED");
            int expectedStatus = offset == 0 ? 200 : 206;
            if (download.statusCode() != expectedStatus || download.rangeStart() != offset)
                throw new SecurityException("MODEL_DOWNLOAD_RANGE_MISMATCH");
            long expectedLength = profile.artifactBytes - offset;
            if (download.contentLength() != expectedLength)
                throw new SecurityException("MODEL_DOWNLOAD_LENGTH_MISMATCH");

            Set<OpenOption> options = Set.of(StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS);
            try (FileChannel output = FileChannel.open(partial, options)) {
                if (output.size() != offset) throw new SecurityException("MODEL_PARTIAL_CHANGED_DURING_RESUME");
                output.position(offset);
                byte[] bytes = new byte[CHUNK_BYTES];
                long written = 0;
                while (written < expectedLength) {
                    int count = input.read(bytes, 0, (int) Math.min(bytes.length, expectedLength - written));
                    if (count < 0) {
                        output.force(true);
                        throw new IOException("MODEL_DOWNLOAD_INTERRUPTED");
                    }
                    if (count == 0) continue;
                    ensureSpace(directory, count);
                    ByteBuffer buffer = ByteBuffer.wrap(bytes, 0, count);
                    while (buffer.hasRemaining()) output.write(buffer);
                    written += count;
                }
                if (input.read() != -1) {
                    output.truncate(0); output.force(true);
                    throw new SecurityException("MODEL_DOWNLOAD_BODY_OVERRUN");
                }
                output.force(true);
            }
        }
    }

    private void verifyComplete(Path file, ModelProfileManifest profile) throws IOException {
        requireRegularFile(file);
        if (Files.size(file) != profile.artifactBytes) throw new SecurityException("MODEL_ARTIFACT_LENGTH_MISMATCH");
        if (!profile.weightsSha256.equals(sha256(file))) {
            Files.delete(file);
            throw new SecurityException("MODEL_ARTIFACT_HASH_MISMATCH");
        }
    }

    private void ensureSpace(Path directory, long additionalBytes) throws IOException {
        long available = spaceProbe.bytesAvailable(directory);
        if (available < 0 || additionalBytes < 0 || additionalBytes > Long.MAX_VALUE - reserveBytes ||
            available < additionalBytes + reserveBytes)
            throw new IllegalStateException("INSUFFICIENT_MODEL_STORAGE");
    }

    private void ensureRoot() throws IOException {
        if (Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            if (Files.isSymbolicLink(root) || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS))
                throw new SecurityException("UNSAFE_MODEL_STAGING_ROOT");
        } else {
            Files.createDirectories(root);
            if (Files.isSymbolicLink(root) || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS))
                throw new SecurityException("UNSAFE_MODEL_STAGING_ROOT");
        }
    }

    private void ensureSafeDirectory(Path directory) throws IOException {
        if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            if (Files.isSymbolicLink(directory) || !Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS))
                throw new SecurityException("UNSAFE_MODEL_PROFILE_DIRECTORY");
        } else {
            Files.createDirectory(directory);
            if (Files.isSymbolicLink(directory) || !Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS))
                throw new SecurityException("UNSAFE_MODEL_PROFILE_DIRECTORY");
        }
    }

    private void requireRegularFile(Path path) throws IOException {
        if (Files.isSymbolicLink(path) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS))
            throw new SecurityException("UNSAFE_MODEL_STAGING_FILE");
    }

    private void rejectSymlinkIfPresent(Path path) {
        if (Files.isSymbolicLink(path)) throw new SecurityException("UNSAFE_MODEL_STAGING_FILE");
    }

    private void requireDirectChild(Path path) {
        if (!path.normalize().startsWith(root) || root.equals(path.normalize()))
            throw new SecurityException("MODEL_STAGING_PATH_ESCAPE");
    }

    private static String directoryName(ModelProfileManifest profile) {
        return profile.profileId + "-" + profile.version + "-" + profile.digest();
    }

    private static String fileName(ModelProfileManifest profile) {
        return profile.weightsSha256 + ("GGUF".equals(profile.format) ? ".gguf" : ".model");
    }

    private static String sha256(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileChannel input = FileChannel.open(file, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
                ByteBuffer buffer = ByteBuffer.allocate(CHUNK_BYTES);
                while (input.read(buffer) >= 0) {
                    if (buffer.position() == 0) continue;
                    buffer.flip(); digest.update(buffer); buffer.clear();
                }
            }
            return hex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA256_UNAVAILABLE", impossible);
        }
    }

    private static String hex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] value = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int b = bytes[i] & 0xff;
            value[i * 2] = digits[b >>> 4]; value[i * 2 + 1] = digits[b & 0x0f];
        }
        return new String(value);
    }
}
