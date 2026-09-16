package dev.rock.shellapi;

import android.os.ParcelFileDescriptor;

/** Private UI-to-broker API. Payload content never crosses this API except explicit owner input/output. */
interface IShellApi {
    const int API_VERSION = 4;

    int getApiVersion() = 0;
    String snapshot() = 1;
    String submit(String requestId, String inputJson, boolean sample, boolean consent) = 2;
    void setPaused(boolean paused) = 3;
    String result(String workId) = 4;
    void complete(String workId, String reviewNote) = 5;
    void retry(String workId) = 6;
    void cancel(String workId) = 7;
    String localAiStatus() = 8;
    String submitZema(String requestId, String selectionToken, String prompt, String contextJson, boolean consent) = 9;
    String skySelection() = 10;
    String selectSkyTool(String toolId) = 11;
    String recoveryStatus() = 12;
    String beginRecoverySetup() = 13;
    String confirmRecoverySetup(String setupToken, String confirmationsJson) = 14;
    String createRecoverableBackup(String requestId, in ParcelFileDescriptor destination) = 15;
    String restoreRecoverableBackup(in ParcelFileDescriptor source, String recoveryPhrase) = 16;
}
