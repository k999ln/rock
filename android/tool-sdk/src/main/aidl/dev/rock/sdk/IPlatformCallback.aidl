package dev.rock.sdk;

/** Callback payloads contain IDs, states and digests only; never secrets or raw artifacts. */
oneway interface IPlatformCallback {
    void onResult(String requestId, String status, String resultId, String resultDigest) = 0;
}
