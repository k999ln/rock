package dev.rock.sdk;
import dev.rock.sdk.IToolCallback;

// P1 contract: bounded UTF-8 text, fixed own tools only. No file paths or network requests.
interface ITool {
    int getApiVersion() = 0;
    oneway void start(String token, String operation, String input, IToolCallback callback) = 1;
    oneway void cancel(String token) = 2;
}
