package dev.rock.shell;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** Reconciles SharedPreferences' memory-before-disk failures across Activity recreation. */
final class DurableSubmissionStore implements LocalSubmission.Store {
    private static final Map<String, String> REPAIR = new HashMap<>();
    private final String identity;
    private final LocalSubmission.Store delegate;

    DurableSubmissionStore(String identity, LocalSubmission.Store delegate) {
        this.identity = identity;
        this.delegate = delegate;
    }

    private void repair() throws IOException {
        if (!REPAIR.containsKey(identity)) return;
        // Do not trust the preferences cache again until the retained identity is durable.
        delegate.write(REPAIR.get(identity));
        REPAIR.remove(identity);
    }

    @Override public String read() throws IOException {
        synchronized (REPAIR) {
            repair();
            return delegate.read();
        }
    }

    @Override public void write(String value) throws IOException {
        synchronized (REPAIR) {
            repair();
            String previous = delegate.read();
            try { delegate.write(value); }
            catch (IOException failure) {
                // A failed clear must never turn a later read into "no prior intent".
                // On the first write there is no old intent, so retain the new identity.
                REPAIR.put(identity, previous == null ? value : previous);
                throw failure;
            }
        }
    }
}
