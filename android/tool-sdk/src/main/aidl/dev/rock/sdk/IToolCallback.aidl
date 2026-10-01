package dev.rock.sdk;

oneway interface IToolCallback {
    void onResult(String token, String outcome, String output) = 0;
}
