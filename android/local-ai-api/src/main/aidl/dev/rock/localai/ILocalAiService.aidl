package dev.rock.localai;
import dev.rock.localai.ILocalAiCallback;

// Local-only v1 API. It accepts text, never file paths, model paths, URLs or credentials.
interface ILocalAiService {
    int getApiVersion() = 0;
    String getStatus() = 1;
    oneway void complete(String requestToken, String prompt, String contextJson, ILocalAiCallback callback) = 2;
    oneway void confirm(String requestToken, String proposalId, boolean approved, ILocalAiCallback callback) = 3;
    oneway void cancel(String requestToken) = 4;
}
