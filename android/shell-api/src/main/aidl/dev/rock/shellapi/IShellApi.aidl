package dev.rock.shellapi;

/** Private UI-to-broker API. Payload content never crosses this API except explicit owner input/output. */
interface IShellApi {
    const int API_VERSION = 1;

    int getApiVersion() = 0;
    String snapshot() = 1;
    String submit(String requestId, String inputJson, boolean sample, boolean consent) = 2;
    void setPaused(boolean paused) = 3;
    String result(String workId) = 4;
    void complete(String workId, String reviewNote) = 5;
    void retry(String workId) = 6;
    void cancel(String workId) = 7;
    String localAiStatus() = 8;
}
