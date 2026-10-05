package dev.rock.localai;
import dev.rock.localai.ILocalAiCallback;
import android.os.ParcelFileDescriptor;

// Local-only v4 API. Model bytes cross the UID boundary only as a read-only file descriptor.
interface ILocalAiService {
    int getApiVersion() = 0;
    String getStatus() = 1;
    oneway void complete(String requestToken, String prompt, String contextJson, ILocalAiCallback callback) = 2;
    oneway void confirm(String requestToken, String proposalId, boolean approved, ILocalAiCallback callback) = 3;
    oneway void cancel(String requestToken) = 4;
    oneway void completePlanForModel(String requestToken, String schemaId, String expectedWeightsSha256,
                                     String prompt, String contextJson, ILocalAiCallback callback) = 6;
    oneway void installAndLoadModel(String requestToken, String profileId, String expectedWeightsSha256,
                                    long expectedBytes, in ParcelFileDescriptor model,
                                    ILocalAiCallback callback) = 7;
}
