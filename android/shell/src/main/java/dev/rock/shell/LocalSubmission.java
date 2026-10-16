package dev.rock.shell;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

/** One unresolved local Binder submission. Stores identity and a digest, never the draft. */
final class LocalSubmission {
    interface Store {
        String read() throws IOException;
        void write(String pending) throws IOException;
    }
    static final class Attempt {
        final String owner, requestId, fingerprint;
        final boolean recovery;
        Attempt(String owner, String requestId, String fingerprint, boolean recovery) {
            this.owner = owner; this.requestId = requestId; this.fingerprint = fingerprint;
            this.recovery = recovery;
        }
        String encoded() { return "1\n" + owner + "\n" + requestId + "\n" + fingerprint; }
    }
    private static final Object STORAGE_LOCK = new Object();
    private final Store store;
    private Attempt active;

    LocalSubmission(Store store) { this.store = store; }

    /** Called before queuing any work, while the exact input and consent are still on the UI thread. */
    Attempt begin(String owner, String fingerprint) throws IOException {
        synchronized (STORAGE_LOCK) {
            requireOwner(owner);
            if (fingerprint == null || !fingerprint.matches("[a-f0-9]{64}"))
                throw new IllegalArgumentException("INVALID_SUBMISSION_FINGERPRINT");
            if (active != null) return null;
            String pending = store.read();
            Attempt next;
            if (pending == null) {
                next = new Attempt(owner, UUID.randomUUID().toString(), fingerprint, false);
            } else {
                next = decode(pending);
                if (!owner.equals(next.owner)) throw new SecurityException("SUBMISSION_OWNER_CHANGED");
                if (!fingerprint.equals(next.fingerprint)) throw new IllegalStateException("SUBMISSION_INPUT_CHANGED");
            }
            // SharedPreferences may publish memory even when its disk commit fails.
            // Reconfirm durability on retries too; reading an ID alone cannot authorize a send.
            store.write(next.encoded());
            active = next;
            return next;
        }
    }

    /** Only the matching live attempt may clear a known result. Uncertain sends keep the same key. */
    boolean finish(Attempt attempt, String owner, boolean knownResult) throws IOException {
        synchronized (STORAGE_LOCK) {
            requireOwner(owner);
            if (active != attempt || !attempt.owner.equals(owner)) return false;
            active = null;
            if (!attempt.encoded().equals(store.read())) return false;
            if (knownResult) store.write(null);
            return true;
        }
    }

    boolean inFlight() {
        synchronized (STORAGE_LOCK) { return active != null; }
    }

    Attempt pending(String owner) throws IOException {
        synchronized (STORAGE_LOCK) {
            requireOwner(owner);
            String stored = store.read();
            if (stored == null) return null;
            Attempt pending = decode(stored);
            if (!owner.equals(pending.owner)) throw new SecurityException("SUBMISSION_OWNER_CHANGED");
            return pending;
        }
    }

    /** Explicit owner abandonment after reviewing history; never cancels or replays Broker work. */
    boolean retire(String owner, String requestId) throws IOException {
        synchronized (STORAGE_LOCK) {
            Attempt pending = pending(owner);
            if (active != null || pending == null || !pending.requestId.equals(requestId)) return false;
            store.write(null);
            return true;
        }
    }

    static boolean knownZemaRefusal(Attempt attempt, String code) {
        // A refusal now cannot disprove a previous attempt that may have committed.
        return !attempt.recovery && java.util.Set.of("DENIED", "SKY_SELECTION_REQUIRED", "LOCAL_AI_NOT_READY",
            "MODEL_PROFILE_NOT_ACTIVE", "MODEL_PROFILE_RUNTIME_MISMATCH", "LOCAL_EXECUTION_PAUSED").contains(code == null ? "" : code);
    }

    static String fingerprint(String... fields) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String field : fields) {
                byte[] bytes = field.getBytes(StandardCharsets.UTF_8);
                digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
                digest.update(bytes);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte value : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static Attempt decode(String encoded) throws IOException {
        String[] fields = encoded.split("\n", -1);
        if (fields.length != 4 || !"1".equals(fields[0]) ||
            !fields[1].matches("[A-Za-z0-9:_-]{3,128}") ||
            !fields[2].matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}") ||
            !fields[3].matches("[a-f0-9]{64}")) throw new IOException("SUBMISSION_RECOVERY_INVALID");
        return new Attempt(fields[1], fields[2], fields[3], true);
    }
    private static void requireOwner(String owner) {
        if (owner == null || !owner.matches("[A-Za-z0-9:_-]{3,128}"))
            throw new SecurityException("SUBMISSION_OWNER_UNAVAILABLE");
    }
}
