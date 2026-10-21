package dev.rock.shell;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public final class LocalSubmissionTest {
    private static final String OWNER = "android-user:0";
    private static final String BINDING = LocalSubmission.fingerprint("zema", "tool-selection", "private draft", "[]", "true");
    private static final class MemoryStore implements LocalSubmission.Store {
        String pending;
        boolean writeFails;
        public String read() { return pending; }
        public void write(String value) throws IOException {
            if (writeFails) throw new IOException("fixture storage unavailable");
            pending = value;
        }
    }

    @Test public void sameFrameAndDelayedRepeatQueueOnlyOneCallUntilResolved() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        assertNotNull(first);
        assertNull(guard.begin(OWNER, BINDING));
        assertNull(guard.begin(OWNER, LocalSubmission.fingerprint("changed draft")));
        assertTrue(guard.finish(first, OWNER, true));
        assertNull(store.pending);
        assertNotEquals(first.requestId, guard.begin(OWNER, BINDING).requestId);
    }

    @Test public void lostResponseAndRestartReuseTheOriginalRequestWithoutPersistingDraft() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        Map<String,String> broker = new HashMap<>();
        broker.put(first.requestId, "saved-work"); // Binder committed, then its response was lost.
        assertTrue(guard.finish(first, OWNER, false));
        assertFalse(store.pending.contains("private draft"));
        LocalSubmission restarted = new LocalSubmission(store);
        LocalSubmission.Attempt retry = restarted.begin(OWNER, BINDING);
        assertEquals(first.requestId, retry.requestId);
        assertEquals("saved-work", broker.computeIfAbsent(retry.requestId, ignored -> "duplicate-work"));
        assertEquals(1, broker.size());
        assertTrue(restarted.finish(retry, OWNER, true));
        assertNull(store.pending);
    }

    @Test public void processLossWhileInFlightAlsoRetainsTheRequest() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission.Attempt first = new LocalSubmission(store).begin(OWNER, BINDING);
        LocalSubmission.Attempt resumed = new LocalSubmission(store).begin(OWNER, BINDING);
        assertEquals(first.requestId, resumed.requestId);
    }

    @Test public void changedOwnerOrInputCannotReuseOrDiscardAnUncertainAttempt() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        String pending = store.pending;
        assertFalse(guard.finish(first, "android-user:1", true));
        assertEquals(pending, store.pending);
        LocalSubmission restarted = new LocalSubmission(store);
        assertThrows(SecurityException.class, () -> restarted.begin("android-user:1", BINDING));
        assertThrows(IllegalStateException.class, () -> restarted.begin(OWNER, LocalSubmission.fingerprint("other")));
        assertEquals(pending, store.pending);
    }

    @Test public void staleCompletionCannotClearARetryOrANewerRequest() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        assertTrue(guard.finish(first, OWNER, false));
        LocalSubmission.Attempt retry = guard.begin(OWNER, BINDING);
        assertFalse(guard.finish(first, OWNER, true));
        assertTrue(guard.inFlight());
        assertNotNull(store.pending);
        assertTrue(guard.finish(retry, OWNER, true));
        assertFalse(guard.inFlight());
        LocalSubmission.Attempt next = guard.begin(OWNER, BINDING);
        assertFalse(guard.finish(retry, OWNER, true));
        assertTrue(store.pending.contains(next.requestId));
    }

    @Test public void persistenceFailureOrMalformedRecoveryPreventsDispatch() throws Exception {
        MemoryStore store = new MemoryStore();
        store.writeFails = true;
        LocalSubmission guard = new LocalSubmission(store);
        assertThrows(IOException.class, () -> guard.begin(OWNER, BINDING));
        store.writeFails = false;
        store.pending = "corrupt";
        assertThrows(IOException.class, () -> guard.begin(OWNER, BINDING));
        assertEquals("corrupt", store.pending);
    }

    @Test public void memoryPublishedBeforeFailedDiskCommitNeverAuthorizesARetry() throws Exception {
        class PrefsLikeStore implements LocalSubmission.Store {
            String memory, disk;
            boolean fail = true;
            public String read() { return memory; }
            public void write(String value) throws IOException {
                memory = value; // SharedPreferences publishes memory before disk commit returns false.
                if (fail) throw new IOException("fixture disk commit failed after memory publication");
                disk = value;
            }
        }
        PrefsLikeStore store = new PrefsLikeStore();
        LocalSubmission guard = new LocalSubmission(store);
        assertThrows(IOException.class, () -> guard.begin(OWNER, BINDING));
        String unresolved = store.memory;
        assertNotNull(unresolved);
        assertNull(store.disk);
        assertFalse(guard.inFlight());
        assertThrows(IOException.class, () -> guard.begin(OWNER, BINDING));
        LocalSubmission recreated = new LocalSubmission(store);
        assertThrows(IOException.class, () -> recreated.begin(OWNER, BINDING));
        assertEquals(unresolved, store.memory);
        assertNull(store.disk);
        assertFalse(recreated.inFlight());
        store.fail = false;
        LocalSubmission.Attempt first = recreated.begin(OWNER, BINDING);
        assertEquals(unresolved, store.disk);
        // Binder now commits and loses its reply. A real process restart reloads only disk.
        store.memory = store.disk;
        LocalSubmission.Attempt resumed = new LocalSubmission(store).begin(OWNER, BINDING);
        assertEquals(first.requestId, resumed.requestId);
        assertEquals(first.encoded(), store.disk);
    }

    @Test public void abandoningAfterHistoryReviewRetiresOnlyExactLocalMetadata() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        assertFalse(guard.retire(OWNER, first.requestId)); // A live send cannot be forgotten.
        assertTrue(guard.finish(first, OWNER, false));
        assertEquals(first.requestId, guard.pending(OWNER).requestId); // Cancelling the dialog does nothing.
        assertThrows(SecurityException.class, () -> guard.retire("android-user:1", first.requestId));
        assertFalse(guard.retire(OWNER, java.util.UUID.randomUUID().toString()));
        assertTrue(guard.retire(OWNER, first.requestId));
        assertNull(store.pending);
        assertNotEquals(first.requestId, guard.begin(OWNER, BINDING).requestId); // Explicit NEW request.
    }

    @Test public void aNewPrecommitRefusalCannotResolveAnEarlierUncertainSend() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalSubmission guard = new LocalSubmission(store);
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        assertTrue(LocalSubmission.knownZemaRefusal(first, "SKY_SELECTION_REQUIRED"));
        assertTrue(guard.finish(first, OWNER, false)); // Earlier Binder send may already have committed.
        LocalSubmission restarted = new LocalSubmission(store);
        LocalSubmission.Attempt retry = restarted.begin(OWNER, BINDING);
        assertEquals(first.requestId, retry.requestId);
        assertFalse(LocalSubmission.knownZemaRefusal(retry, "SKY_SELECTION_REQUIRED"));
        assertFalse(LocalSubmission.knownZemaRefusal(retry, "DENIED"));
        assertFalse(LocalSubmission.knownZemaRefusal(retry, "MODEL_SELECTION_CHANGED"));
        assertFalse(LocalSubmission.knownZemaRefusal(retry, "MODEL_PROFILE_SWITCH_HAS_PINNED_WORK"));
        assertTrue(restarted.finish(retry, OWNER, false));
        assertEquals(first.requestId, restarted.pending(OWNER).requestId);
    }

    @Test public void failedClearCannotExposeANewIntentAcrossPreferenceAdapterRecreation() throws Exception {
        class PrefsLikeStore implements LocalSubmission.Store {
            String memory, disk;
            boolean fail;
            public String read() { return memory; }
            public void write(String value) throws IOException {
                memory = value;
                if (fail) throw new IOException("fixture disk failure after memory publication");
                disk = value;
            }
        }
        PrefsLikeStore prefs = new PrefsLikeStore();
        String identity = java.util.UUID.randomUUID().toString();
        LocalSubmission guard = new LocalSubmission(new DurableSubmissionStore(identity, prefs));
        LocalSubmission.Attempt first = guard.begin(OWNER, BINDING);
        prefs.fail = true;
        assertThrows(IOException.class, () -> guard.finish(first, OWNER, true));
        assertNull(prefs.memory); // A plain SharedPreferences read would lose the old request.
        LocalSubmission recreated = new LocalSubmission(new DurableSubmissionStore(identity, prefs));
        assertThrows(IOException.class, () -> recreated.begin(OWNER, BINDING));
        assertThrows(IOException.class, () -> recreated.pending(OWNER));
        assertFalse(recreated.inFlight());
        assertEquals(first.encoded(), prefs.disk);
        prefs.fail = false;
        LocalSubmission.Attempt retry = recreated.begin(OWNER, BINDING);
        assertEquals(first.requestId, retry.requestId);
        assertEquals(first.encoded(), prefs.disk);
        assertTrue(recreated.finish(retry, OWNER, false));
        prefs.fail = true;
        assertThrows(IOException.class, () -> recreated.retire(OWNER, first.requestId));
        LocalSubmission afterFailedRetirement = new LocalSubmission(new DurableSubmissionStore(identity, prefs));
        assertThrows(IOException.class, () -> afterFailedRetirement.begin(OWNER, BINDING));
        prefs.fail = false;
        assertEquals(first.requestId, afterFailedRetirement.pending(OWNER).requestId);
        assertTrue(afterFailedRetirement.retire(OWNER, first.requestId));
        assertNull(prefs.disk);
    }

    @Test public void schedulerOrTransportFailureIsNeverMistakenForAPrecommitRefusal() throws Exception {
        LocalSubmission.Attempt first = new LocalSubmission(new MemoryStore()).begin(OWNER, BINDING);
        assertFalse(LocalSubmission.knownZemaRefusal(first, "LOCAL_AI_UNAVAILABLE"));
        // The Binder also maps scheduler IllegalArgumentException to INVALID_PLAN after commit.
        assertFalse(LocalSubmission.knownZemaRefusal(first, "INVALID_PLAN"));
        assertFalse(LocalSubmission.knownZemaRefusal(first, null));
        assertTrue(LocalSubmission.knownZemaRefusal(first, "DENIED"));
        assertTrue(LocalSubmission.knownZemaRefusal(first, "MODEL_PROFILE_NOT_ACTIVE"));
        assertNotEquals(LocalSubmission.fingerprint("a", "bc"), LocalSubmission.fingerprint("ab", "c"));
    }
}
