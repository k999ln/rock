package dev.rock.localai;

// Events: token, proposal, completed or failed. Payloads are bounded UTF-8 text/JSON.
oneway interface ILocalAiCallback {
    void onEvent(String requestToken, String event, String payload) = 0;
}
