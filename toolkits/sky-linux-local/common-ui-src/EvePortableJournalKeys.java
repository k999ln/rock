package dev.rock.shell;

import android.content.Context;
import java.io.File;
import java.io.IOException;

/** Opens only the existing account key. Grant/device checks remain the controller's job. */
final class EvePortableJournalKeys {
    static EvePortableClaimJournal open(Context context, String origin, String owner, String device) throws Exception {
        Context app = context.getApplicationContext();
        if (!origin.equals(EveAccountSync.endpoint(app)) || !owner.equals(EveAccountSync.sessions(app).ownerUserId()))
            throw new IOException("PORTABLE_JOURNAL_ACCOUNT_CHANGED");
        return new EvePortableClaimJournal(new File(app.getNoBackupFilesDir(), "portable-claims").toPath(),
            app.getPackageName(), origin, owner, device, () -> {
                if (!origin.equals(EveAccountSync.endpoint(app)) || !owner.equals(EveAccountSync.sessions(app).ownerUserId()))
                    throw new IOException("PORTABLE_JOURNAL_ACCOUNT_CHANGED");
                return EveAccountSessionStore.existingJournalKey();
            });
    }
}
