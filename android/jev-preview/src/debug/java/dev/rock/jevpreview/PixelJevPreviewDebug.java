package dev.rock.jevpreview;

import android.app.Activity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Debug-only, fixed-fixture client for the Mac loopback relay. */
public final class PixelJevPreviewDebug {
    private static final String ENDPOINT = "http://127.0.0.1:49211/v1/pixel-jev-preview";
    private static final String REQUEST_BODY = "{\"fixture\":\"public-choice-v1\"}";
    private static final String MODEL_PREFIX = "jev-";
    private static final int CONNECT_TIMEOUT_MS = 2_000;
    private static final int READ_TIMEOUT_MS = 12_000;
    private static final int MAX_RESPONSE_BYTES = 4_096;
    private static final Set<String> ERROR_STATUSES = Set.of(
        "already_used", "invalid_request", "provider_unavailable", "timeout",
        "rate_limited", "budget_blocked", "provider_error", "invalid_response");

    private PixelJevPreviewDebug() {}

    /** Called reflectively by MainActivity only in a debug build. */
    public static void attach(Activity activity, LinearLayout form, TextView message) {
        TextView status = label(form, "Jev physical preview: 未実行", 16);
        label(form, "固定公開fixtureをMacのlocalhost relayへ一回だけ送信します。入力、Tool、外部作用、APIキーは端末から渡しません。", 16);
        Button action = new Button(activity);
        action.setText("Jev公開fixtureを確認（debug only）");
        form.addView(action);
        AtomicBoolean requested = new AtomicBoolean(false);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        action.setOnClickListener(view -> {
            if (!requested.compareAndSet(false, true)) return;
            action.setEnabled(false);
            status.setText("Jev physical preview: relayへ接続中…");
            message.setText("Jev previewは固定公開fixtureだけを送信します。");
            worker.execute(() -> {
                final String resultText;
                try {
                    resultText = format(request());
                } catch (PreviewException error) {
                    resultText = "Jev physical preview: " + error.status;
                } finally {
                    worker.shutdown();
                }
                activity.runOnUiThread(() -> {
                    if (!activity.isDestroyed()) status.setText(resultText);
                });
            });
        });
    }

    private static TextView label(LinearLayout container, String text, int size) {
        TextView value = new TextView(container.getContext());
        value.setText(text);
        value.setTextSize(size);
        value.setPadding(0, 12, 0, 8);
        container.addView(value);
        return value;
    }

    private static String format(PreviewResult result) {
        if (!"ok".equals(result.status)) return "Jev physical preview: " + result.status;
        return "Jev physical preview: ok · answer " + result.answer
            + " · model " + result.model + " · tokens " + result.inputTokens + "/"
            + result.outputTokens;
    }

    private static PreviewResult request() throws PreviewException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setDoInput(true);
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            connection.setFixedLengthStreamingMode(REQUEST_BODY.getBytes(StandardCharsets.UTF_8).length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(REQUEST_BODY.getBytes(StandardCharsets.UTF_8));
            }
            int responseCode = connection.getResponseCode();
            String contentType = connection.getHeaderField("Content-Type");
            if (contentType == null || !contentType.toLowerCase().startsWith("application/json"))
                throw new PreviewException("RELAY_INVALID_RESPONSE");
            InputStream source = responseCode >= 400
                ? connection.getErrorStream() : connection.getInputStream();
            if (source == null) throw new PreviewException("RELAY_INVALID_RESPONSE");
            String body = readBounded(source);
            PreviewResult result = parse(body);
            if (responseCode >= 400 && "ok".equals(result.status))
                throw new PreviewException("RELAY_INVALID_RESPONSE");
            return result;
        } catch (PreviewException error) {
            throw error;
        } catch (IOException error) {
            throw new PreviewException("RELAY_UNAVAILABLE");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readBounded(InputStream source) throws IOException, PreviewException {
        try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[512];
            int total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > MAX_RESPONSE_BYTES) throw new PreviewException("RELAY_RESPONSE_TOO_LARGE");
                output.write(buffer, 0, count);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    static PreviewResult parse(String body) throws PreviewException {
        try {
            JSONObject root = new JSONObject(body);
            exactKeys(root, Set.of("status", "answer", "token", "model"));
            String status = requiredString(root, "status");
            String answer = requiredString(root, "answer");
            String model = requiredString(root, "model");
            JSONObject token = root.optJSONObject("token");
            if (token == null) throw new PreviewException("RELAY_INVALID_RESPONSE");
            exactKeys(token, Set.of("input", "output"));
            int input = nonNegativeInt(token, "input");
            int output = nonNegativeInt(token, "output");
            if ("ok".equals(status)) {
                if (!answer.equals("local") || !model.startsWith(MODEL_PREFIX))
                    throw new PreviewException("RELAY_INVALID_RESPONSE");
            } else {
                if (!ERROR_STATUSES.contains(status) || !answer.isEmpty() || !model.isEmpty()
                    || input != 0 || output != 0)
                    throw new PreviewException("RELAY_INVALID_RESPONSE");
            }
            return new PreviewResult(status, answer, input, output, model);
        } catch (PreviewException error) {
            throw error;
        } catch (Exception error) {
            throw new PreviewException("RELAY_INVALID_RESPONSE");
        }
    }

    private static String requiredString(JSONObject object, String key) throws PreviewException {
        Object value = object.get(key);
        if (!(value instanceof String)) throw new PreviewException("RELAY_INVALID_RESPONSE");
        return (String) value;
    }

    private static int nonNegativeInt(JSONObject object, String key) throws PreviewException {
        Object value = object.get(key);
        if (!(value instanceof Number)) throw new PreviewException("RELAY_INVALID_RESPONSE");
        double numeric = ((Number) value).doubleValue();
        if (!Double.isFinite(numeric) || numeric < 0 || numeric > Integer.MAX_VALUE || numeric != Math.rint(numeric))
            throw new PreviewException("RELAY_INVALID_RESPONSE");
        return (int) numeric;
    }

    private static void exactKeys(JSONObject object, Set<String> expected) throws PreviewException {
        Set<String> actual = new HashSet<>();
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) actual.add(keys.next());
        if (!actual.equals(expected)) throw new PreviewException("RELAY_INVALID_RESPONSE");
    }

    static final class PreviewResult {
        final String status;
        final String answer;
        final int inputTokens;
        final int outputTokens;
        final String model;

        PreviewResult(String status, String answer, int inputTokens, int outputTokens, String model) {
            this.status = status;
            this.answer = answer;
            this.inputTokens = inputTokens;
            this.outputTokens = outputTokens;
            this.model = model;
        }
    }

    static final class PreviewException extends Exception {
        final String status;

        PreviewException(String status) {
            this.status = status;
        }
    }
}
