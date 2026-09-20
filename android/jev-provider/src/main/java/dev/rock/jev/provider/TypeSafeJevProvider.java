package dev.rock.jev.provider;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Public-only, typed adapter for the official TypeSafe System One API.
 *
 * <p>This class is deliberately a pure advisory boundary. It cannot call a Tool,
 * change Broker/Shell/Local AI permissions, or grant any capability. The Android
 * package containing it is disabled until a reviewed runtime key provisioning path
 * exists. Tests inject a fake key source and transport; production must never put a
 * key in source, resources, logs, backups, or an APK.</p>
 */
public final class TypeSafeJevProvider {
    public static final String OFFICIAL_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
    public static final String MODEL = "jev-1.13.0";
    public static final int MAX_REQUEST_BYTES = 32 * 1024;
    public static final int MAX_RESPONSE_BYTES = 16 * 1024;
    private static final int MAX_QUESTIONS = 8;
    private static final int MAX_STATE_DEPTH = 12;
    private static final int MAX_TIMEOUT_MS = 30_000;
    private static final int CONNECT_TIMEOUT_MS = 3_000;
    private static final int READ_TIMEOUT_MS = 10_000;
    private static final Set<String> ALLOWED_PURPOSES = setOf(
        "route", "classify", "score", "detect", "retrieve", "verify");
    private static final Set<String> ALLOWED_EFFECTS = setOf("none", "local-pure", "remote-read");
    private static final Set<String> SECRET_NAMES = setOf(
        "password", "passcode", "privatekey", "recovery", "recoveryphrase", "mnemonic",
        "seed", "seedphrase", "sessioncookie", "accesstoken", "refreshtoken", "apitoken",
        "apikey", "authorization", "credential", "cookie", "otp", "secret");

    /** Runtime source for a bearer key. It must return a copy that the caller may wipe. */
    public interface ApiKeySource { char[] read(); }

    /** HTTP seam used by direct tests; production uses the fixed endpoint transport below. */
    public interface Transport {
        HttpResponse post(String endpoint, String authorization, String body, int timeoutMs)
            throws IOException;
    }

    public static final class HttpResponse {
        public final int statusCode;
        public final String contentType;
        public final String body;

        public HttpResponse(int statusCode, String contentType, String body) {
            this.statusCode = statusCode;
            this.contentType = contentType;
            this.body = body;
        }
    }

    public interface Question {
        String id();
        JSONObject toTypeSafeJson() throws Exception;
        void validate() throws ProviderException;
    }

    public static final class ChoiceQuestion implements Question {
        private final String id;
        private final String instructions;
        private final Map<String, String> options;

        public ChoiceQuestion(String id, String instructions, Map<String, String> options) {
            this.id = id;
            this.instructions = instructions;
            this.options = options == null
                ? Collections.emptyMap()
                : Collections.unmodifiableMap(new LinkedHashMap<>(options));
        }

        @Override public String id() { return id; }

        @Override public JSONObject toTypeSafeJson() throws Exception {
            JSONObject criteria = new JSONObject();
            for (Map.Entry<String, String> option : options.entrySet()) criteria.put(option.getKey(), option.getValue());
            return new JSONObject().put("type", "choice").put("instructions", instructions).put("criteria", criteria);
        }

        @Override public void validate() throws ProviderException {
            validateId(id);
            requireText(instructions, 1_000, "QUESTION_INVALID");
            if (options.size() < 2 || options.size() > 32) throw new ProviderException("QUESTION_INVALID");
            for (Map.Entry<String, String> option : options.entrySet()) {
                validateIdentifier(option.getKey());
                requireText(option.getValue(), 500, "QUESTION_INVALID");
            }
        }

        Map<String, String> options() { return options; }
    }

    public static final class ScoreQuestion implements Question {
        private final String id;
        private final String instructions;
        private final List<String> levels;

        public ScoreQuestion(String id, String instructions, List<String> levels) {
            this.id = id;
            this.instructions = instructions;
            this.levels = levels == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(levels));
        }

        @Override public String id() { return id; }

        @Override public JSONObject toTypeSafeJson() throws Exception {
            JSONArray criteria = new JSONArray();
            for (String level : levels) criteria.put(level);
            return new JSONObject().put("type", "score").put("instructions", instructions).put("criteria", criteria);
        }

        @Override public void validate() throws ProviderException {
            validateId(id);
            requireText(instructions, 1_000, "QUESTION_INVALID");
            if (levels.size() < 2 || levels.size() > 10 || new HashSet<>(levels).size() != levels.size())
                throw new ProviderException("QUESTION_INVALID");
            for (String level : levels) requireText(level, 500, "QUESTION_INVALID");
        }

        List<String> levels() { return levels; }
    }

    public static final class BooleanProbabilityQuestion implements Question {
        private final String id;
        private final String instructions;
        private final String yesMeans;
        private final String noMeans;

        public BooleanProbabilityQuestion(String id, String instructions, String yesMeans, String noMeans) {
            this.id = id;
            this.instructions = instructions;
            this.yesMeans = yesMeans;
            this.noMeans = noMeans;
        }

        @Override public String id() { return id; }

        @Override public JSONObject toTypeSafeJson() throws Exception {
            return new JSONObject().put("type", "noul").put("instructions", instructions)
                .put("criteria", new JSONObject().put("true", yesMeans).put("false", noMeans));
        }

        @Override public void validate() throws ProviderException {
            validateId(id);
            requireText(instructions, 1_000, "QUESTION_INVALID");
            requireText(yesMeans, 500, "QUESTION_INVALID");
            requireText(noMeans, 500, "QUESTION_INVALID");
        }
    }

    public static final class DecisionRequest {
        public final String requestId;
        public final JSONObject publicState;
        public final String purpose;
        public final String effect;
        public final int maxLatencyMs;
        public final long maxCostMicros;
        private final List<Question> questions;

        public DecisionRequest(String requestId, JSONObject publicState, String purpose, String effect,
            List<Question> questions, int maxLatencyMs, long maxCostMicros) {
            this.requestId = requestId;
            this.publicState = publicState;
            this.purpose = purpose;
            this.effect = effect;
            this.questions = questions == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(questions));
            this.maxLatencyMs = maxLatencyMs;
            this.maxCostMicros = maxCostMicros;
        }

        List<Question> questions() { return questions; }

        void validate() throws ProviderException {
            validateIdentifier(requestId);
            if (publicState == null) throw new ProviderException("PUBLIC_DATA_REQUIRED");
            if (!ALLOWED_PURPOSES.contains(purpose) || !ALLOWED_EFFECTS.contains(effect))
                throw new ProviderException("REQUEST_SCOPE_BLOCKED");
            if (maxLatencyMs < 1 || maxLatencyMs > MAX_TIMEOUT_MS) throw new ProviderException("TIMEOUT_INVALID");
            if (maxCostMicros < 1 || maxCostMicros > 100_000_000L) throw new ProviderException("COST_INVALID");
            if (questions.isEmpty() || questions.size() > MAX_QUESTIONS) throw new ProviderException("QUESTION_INVALID");
            PublicDataGuard.validate(publicState);
            Set<String> ids = new HashSet<>();
            for (Question question : questions) {
                if (question == null || !ids.add(question.id())) throw new ProviderException("QUESTION_INVALID");
                question.validate();
                try {
                    // Instructions and criteria are sent to the remote provider too.
                    PublicDataGuard.validate(question.toTypeSafeJson());
                } catch (ProviderException error) {
                    throw error;
                } catch (Exception error) {
                    throw new ProviderException("QUESTION_INVALID");
                }
            }
        }

        String payload() throws ProviderException {
            validate();
            try {
                JSONObject questionsObject = new JSONObject();
                for (Question question : questions) questionsObject.put(question.id(), question.toTypeSafeJson());
                JSONObject body = new JSONObject()
                    .put("state", new JSONObject(publicState.toString()))
                    .put("model", MODEL)
                    .put("questions", questionsObject);
                String encoded = body.toString();
                if (encoded.getBytes(StandardCharsets.UTF_8).length > MAX_REQUEST_BYTES)
                    throw new ProviderException("REQUEST_TOO_LARGE");
                return encoded;
            } catch (ProviderException error) {
                throw error;
            } catch (Exception error) {
                throw new ProviderException("REQUEST_INVALID");
            }
        }
    }

    public static final class Answer {
        public final String kind;
        public final Object value;
        public final Map<String, Double> probabilities;
        public final Double confidence;

        private Answer(String kind, Object value, Map<String, Double> probabilities, Double confidence) {
            this.kind = kind;
            this.value = value;
            this.probabilities = probabilities == null ? Collections.emptyMap() : Collections.unmodifiableMap(probabilities);
            this.confidence = confidence;
        }
    }

    public static final class AdvisoryResult {
        public final String requestId;
        public final String status;
        public final String reasonCode;
        public final String model;
        public final Map<String, Answer> answers;
        public final int inputTokens;
        public final int outputTokens;
        public final boolean externalActionAllowed = false;
        public final String authority = "advisory-only";

        private AdvisoryResult(String requestId, String status, String reasonCode, String model,
            Map<String, Answer> answers, int inputTokens, int outputTokens) {
            this.requestId = requestId;
            this.status = status;
            this.reasonCode = reasonCode;
            this.model = model;
            this.answers = Collections.unmodifiableMap(new LinkedHashMap<>(answers));
            this.inputTokens = inputTokens;
            this.outputTokens = outputTokens;
        }

        static AdvisoryResult abstain(String requestId, String reasonCode) {
            return new AdvisoryResult(requestId, "abstained", reasonCode, "", Collections.emptyMap(), 0, 0);
        }
    }

    public static final class Health {
        public final boolean available;
        public final String reasonCode;

        private Health(boolean available, String reasonCode) {
            this.available = available;
            this.reasonCode = reasonCode;
        }
    }

    public static final class ProviderException extends Exception {
        public final String reasonCode;
        ProviderException(String reasonCode) { super(reasonCode); this.reasonCode = reasonCode; }
    }

    private final ApiKeySource keySource;
    private final Transport transport;
    private final long estimatedCostMicros;

    public TypeSafeJevProvider(ApiKeySource keySource, Transport transport, long estimatedCostMicros) {
        this.keySource = keySource;
        this.transport = transport == null ? new UrlConnectionTransport() : transport;
        this.estimatedCostMicros = estimatedCostMicros;
    }

    /** Disabled configuration used by the optional APK until key provisioning is reviewed. */
    public static TypeSafeJevProvider disabled() {
        return new TypeSafeJevProvider(() -> null, null, 0);
    }

    public Health health() {
        char[] key = readKey();
        if (key == null) return new Health(false, "TYPESAFE_API_KEY_UNAVAILABLE");
        Arrays.fill(key, '\0');
        return new Health(true, "CONFIGURED_NO_NETWORK_PROBE");
    }

    /** Returns a typed advisory or an abstention; it never throws provider data to callers. */
    public AdvisoryResult decide(DecisionRequest request) {
        String requestId = request == null || request.requestId == null ? "" : request.requestId;
        if (request == null) return AdvisoryResult.abstain(requestId, "REQUEST_INVALID");
        try {
            String payload = request.payload();
            if (estimatedCostMicros < 1 || estimatedCostMicros > request.maxCostMicros)
                return AdvisoryResult.abstain(requestId, "MAX_COST_EXCEEDED");
            char[] key = readKey();
            if (key == null) return AdvisoryResult.abstain(requestId, "PROVIDER_DISABLED");
            String bearer = new String(key);
            Arrays.fill(key, '\0');
            if (bearer.isEmpty()) return AdvisoryResult.abstain(requestId, "PROVIDER_DISABLED");
            long started = System.nanoTime();
            HttpResponse response;
            try {
                response = transport.post(OFFICIAL_ENDPOINT, "Bearer " + bearer, payload,
                    Math.min(request.maxLatencyMs, Math.max(1, Math.min(CONNECT_TIMEOUT_MS, READ_TIMEOUT_MS))));
            } finally {
                // The transport owns the connection lifetime. No caller-visible key or response is retained here.
                bearer = "";
            }
            if (elapsedMs(started) > request.maxLatencyMs) return AdvisoryResult.abstain(requestId, "PROVIDER_TIMEOUT");
            if (response == null || response.statusCode < 200 || response.statusCode >= 300)
                return AdvisoryResult.abstain(requestId, "PROVIDER_HTTP_ERROR");
            if (response.contentType == null || !response.contentType.toLowerCase(Locale.ROOT).startsWith("application/json"))
                return AdvisoryResult.abstain(requestId, "PROVIDER_MALFORMED_RESPONSE");
            if (response.body == null || response.body.getBytes(StandardCharsets.UTF_8).length > MAX_RESPONSE_BYTES)
                return AdvisoryResult.abstain(requestId, "PROVIDER_RESPONSE_TOO_LARGE");
            return parse(response.body, request);
        } catch (ProviderException error) {
            return AdvisoryResult.abstain(requestId, error.reasonCode);
        } catch (IOException error) {
            return AdvisoryResult.abstain(requestId, "PROVIDER_UNAVAILABLE");
        } catch (Exception error) {
            return AdvisoryResult.abstain(requestId, "PROVIDER_MALFORMED_RESPONSE");
        }
    }

    static AdvisoryResult parse(String body, DecisionRequest request) throws ProviderException {
        try {
            JSONObject root = new JSONObject(body);
            exactKeys(root, setOf("model", "answers", "usage"));
            String model = requiredText(root, "model", 128);
            if (!MODEL.equals(model)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            JSONObject rawAnswers = requiredObject(root, "answers");
            JSONObject usage = requiredObject(root, "usage");
            exactKeys(usage, setOf("input_tokens", "output_tokens"));
            int input = nonNegativeInt(usage, "input_tokens");
            int output = nonNegativeInt(usage, "output_tokens");
            Set<String> expected = new HashSet<>();
            for (Question question : request.questions()) expected.add(question.id());
            Set<String> actual = keys(rawAnswers);
            if (!actual.equals(expected)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            Map<String, Answer> answers = new LinkedHashMap<>();
            for (Question question : request.questions()) answers.put(question.id(), parseAnswer(rawAnswers.getJSONObject(question.id()), question));
            return new AdvisoryResult(request.requestId, "answered", "TYPESAFE_SYSTEMONE", model, answers, input, output);
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        }
    }

    private static Answer parseAnswer(JSONObject item, Question question) throws Exception {
        if (question instanceof ChoiceQuestion) {
            exactKeys(item, setOf("type", "choice", "probabilities", "confidence"));
            if (!"choice".equals(item.optString("type"))) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            String choice = requiredText(item, "choice", 128);
            ChoiceQuestion typed = (ChoiceQuestion) question;
            if (!typed.options().containsKey(choice)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            Map<String, Double> probabilities = probabilities(item.getJSONObject("probabilities"), typed.options().keySet());
            return new Answer("choice", choice, probabilities, finite(item, "confidence", 0, 1));
        }
        if (question instanceof ScoreQuestion) {
            exactKeys(item, setOf("type", "score", "legend", "probabilities", "confidence"));
            if (!"score".equals(item.optString("type"))) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            JSONObject legend = item.getJSONObject("legend");
            Set<String> indices = new HashSet<>();
            ScoreQuestion typed = (ScoreQuestion) question;
            for (int i = 0; i < typed.levels().size(); i++) indices.add(Integer.toString(i));
            exactKeys(legend, indices);
            for (int i = 0; i < typed.levels().size(); i++) if (!typed.levels().get(i).equals(legend.getString(Integer.toString(i))))
                throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
            Map<String, Double> raw = probabilities(item.getJSONObject("probabilities"), indices);
            double score = finite(item, "score", 0, typed.levels().size() - 1);
            Map<String, Double> named = new LinkedHashMap<>();
            for (int i = 0; i < typed.levels().size(); i++) named.put(typed.levels().get(i), raw.get(Integer.toString(i)));
            return new Answer("score", score, named, finite(item, "confidence", 0, 1));
        }
        exactKeys(item, setOf("type", "noul"));
        if (!"noul".equals(item.optString("type"))) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return new Answer("boolean_probability", finite(item, "noul", 0, 1), Collections.emptyMap(), null);
    }

    private char[] readKey() {
        try {
            char[] key = keySource == null ? null : keySource.read();
            return key == null || key.length == 0 ? null : key;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static long elapsedMs(long started) { return (System.nanoTime() - started) / 1_000_000L; }

    private static Map<String, Double> probabilities(JSONObject value, Set<String> expected) throws Exception {
        exactKeys(value, expected);
        Map<String, Double> result = new LinkedHashMap<>();
        double sum = 0;
        for (String key : expected) {
            double probability = finite(value, key, 0, 1);
            result.put(key, probability);
            sum += probability;
        }
        if (Math.abs(sum - 1.0) > 0.00001) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return result;
    }

    private static double finite(JSONObject value, String key, double min, double max) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof Number)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        double number = ((Number) raw).doubleValue();
        if (!Double.isFinite(number) || number < min || number > max) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return number;
    }

    private static int nonNegativeInt(JSONObject value, String key) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof Number)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        double number = ((Number) raw).doubleValue();
        if (!Double.isFinite(number) || number < 0 || number > Integer.MAX_VALUE || number != Math.rint(number))
            throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return (int) number;
    }

    private static String requiredText(JSONObject value, String key, int max) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof String) || ((String) raw).isEmpty() || ((String) raw).length() > max)
            throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return (String) raw;
    }

    private static JSONObject requiredObject(JSONObject value, String key) throws Exception {
        Object raw = value.get(key);
        if (!(raw instanceof JSONObject)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
        return (JSONObject) raw;
    }

    private static Set<String> keys(JSONObject value) {
        Set<String> result = new HashSet<>();
        for (java.util.Iterator<String> iterator = value.keys(); iterator.hasNext();) result.add(iterator.next());
        return result;
    }

    private static void exactKeys(JSONObject value, Set<String> expected) throws ProviderException {
        if (!keys(value).equals(expected)) throw new ProviderException("PROVIDER_MALFORMED_RESPONSE");
    }

    private static Set<String> setOf(String... values) { return new HashSet<>(Arrays.asList(values)); }

    private static void validateId(String value) throws ProviderException {
        if (value == null || !value.matches("[a-z][a-z0-9_]{0,63}")) throw new ProviderException("QUESTION_INVALID");
    }

    private static void validateIdentifier(String value) throws ProviderException {
        if (value == null || !value.matches("[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}")) throw new ProviderException("REQUEST_INVALID");
    }

    private static void requireText(String value, int max, String reason) throws ProviderException {
        if (value == null || value.isEmpty() || value.length() > max) throw new ProviderException(reason);
    }

    private static final class PublicDataGuard {
        private PublicDataGuard() {}

        static void validate(JSONObject value) throws ProviderException {
            try {
                walk(value, 0);
            } catch (ProviderException error) {
                throw error;
            } catch (Exception error) {
                throw new ProviderException("PUBLIC_DATA_INVALID");
            }
        }

        private static void walk(Object value, int depth) throws Exception {
            if (depth > MAX_STATE_DEPTH) throw new ProviderException("PUBLIC_DATA_TOO_DEEP");
            if (value instanceof JSONObject) {
                JSONObject object = (JSONObject) value;
                for (java.util.Iterator<String> iterator = object.keys(); iterator.hasNext();) {
                    String key = iterator.next();
                    String normalized = key.replace("_", "").replace("-", "").toLowerCase(Locale.ROOT);
                    for (String secret : SECRET_NAMES) if (normalized.equals(secret) || normalized.startsWith(secret) || normalized.endsWith(secret))
                        throw new ProviderException("SECRET_DATA_PROHIBITED");
                    walk(object.get(key), depth + 1);
                }
            } else if (value instanceof JSONArray) {
                JSONArray array = (JSONArray) value;
                for (int index = 0; index < array.length(); index++) walk(array.get(index), depth + 1);
            } else if (value instanceof String) {
                String text = (String) value;
                if (text.matches("(?is).*\\b(?:bearer\\s+|api[ _-]?key\\s*[:=]|password\\s*[:=]|private[ _-]?key\\s*[:=]).*"))
                    throw new ProviderException("SECRET_DATA_PROHIBITED");
            }
        }
    }

    private static final class UrlConnectionTransport implements Transport {
        @Override public HttpResponse post(String endpoint, String authorization, String body, int timeoutMs) throws IOException {
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
            try {
                byte[] encoded = body.getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(Math.min(timeoutMs, CONNECT_TIMEOUT_MS));
                connection.setReadTimeout(Math.min(timeoutMs, READ_TIMEOUT_MS));
                connection.setInstanceFollowRedirects(false);
                connection.setDoInput(true);
                connection.setDoOutput(true);
                connection.setUseCaches(false);
                connection.setFixedLengthStreamingMode(encoded.length);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cache-Control", "no-store");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Authorization", authorization);
                try (OutputStream output = connection.getOutputStream()) { output.write(encoded); }
                int status = connection.getResponseCode();
                InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String responseBody = source == null ? "" : readBounded(source);
                return new HttpResponse(status, connection.getHeaderField("Content-Type"), responseBody);
            } finally {
                connection.disconnect();
            }
        }

        private static String readBounded(InputStream source) throws IOException {
            try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_RESPONSE_BYTES) throw new IOException("response bound");
                    output.write(buffer, 0, count);
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
        }
    }
}
