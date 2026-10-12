package dev.rock.automation;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.os.RemoteException;
import dev.rock.core.Engine;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.localai.ILocalAiCallback;
import dev.rock.localai.ILocalAiService;
import java.io.File;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Fail-closed client for the separately packaged, locally executing LLM service. */
final class LocalAiConnection {
    static final String PACKAGE = "com.localactionassistant";
    static final String SERVICE = PACKAGE + ".RockLocalAiService";
    static final String RUNTIME_COMPONENT_ID = "org.rockstar.runtime.localai";
    static final int PACKAGE_VERSION_CODE = 3;
    static final int API_VERSION = 4;
    private static final Set<String> TERMINAL_EVENTS = Set.of("proposal", "completed", "failed");
    private final Context context;
    private volatile ILocalAiService service;

    static final class Result {
        final String event;
        final String payload;
        Result(String event, String payload) { this.event = event; this.payload = payload; }
    }

    LocalAiConnection(Context context) { this.context = context; }

    String status() throws Exception {
        return withService((remote, ignoredUid) -> {
            return validatedStatus(remote).getString("state");
        });
    }

    /** Broker-validated status from the pinned, same-signer local runtime; it is not model attestation. */
    JSONObject statusEvidence() throws Exception {
        return withService((remote, ignoredUid) -> {
            JSONObject status = validatedStatus(remote);
            return new JSONObject().put("state", status.getString("state"))
                .put("modelLoaded", status.getBoolean("modelLoaded"))
                .put("runtime", status.getString("runtime"))
                .put("apiVersion", status.getInt("apiVersion"))
                .put("trustBasis", "approved_package_signature_and_binder_api")
                .put("modelProfileIdentity", "not_reported");
        });
    }

    /** Match the signed runtime's freshly hashed loaded GGUF to the exact pre-inference job pin. */
    void requireReadyForPlanning(Engine.ModelProfilePin pin) throws Exception {
        if (pin == null) throw new SecurityException("MODEL_PROFILE_PIN_REQUIRED");
        JSONObject status = withService((remote, ignoredUid) -> validatedStatus(remote));
        if (!"ready".equals(status.optString("state")) || !status.optBoolean("modelLoaded"))
            throw new SecurityException("LOCAL_AI_NOT_READY");
        if (!RUNTIME_COMPONENT_ID.equals(pin.runtimeComponentId)
                || pin.runtimeVersionCode != PACKAGE_VERSION_CODE
                || pin.runtimeSigningDigest == null
                || !pin.profileId.equals(status.optString("modelProfileId"))
                || !pin.weightsSha256.equals(status.optString("weightsSha256"))
                || pin.artifactBytes != status.optLong("modelBytes", -1)
                || API_VERSION < pin.runtimeApiMin || API_VERSION > pin.runtimeApiMax
                || API_VERSION < pin.runtimeManifestApiMin || API_VERSION > pin.runtimeManifestApiMax)
            throw new SecurityException("MODEL_PROFILE_RUNTIME_MISMATCH");
        String installedSigner = installedSigningDigest();
        if (!pin.runtimeSigningDigest.equals(installedSigner))
            throw new SecurityException("MODEL_PROFILE_RUNTIME_MISMATCH");
    }

    private JSONObject validatedStatus(ILocalAiService remote) throws Exception {
        String value = remote.getStatus();
        Engine.bounded(value);
        JSONObject status = new JSONObject(value);
        Set<String> keys = Set.of("state", "modelLoaded", "runtime", "apiVersion", "modelProfileId", "weightsSha256", "modelBytes");
        if (status.length() != keys.size()) throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
        java.util.Iterator<String> names = status.keys();
        while (names.hasNext()) if (!keys.contains(names.next()))
            throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
        String state = status.getString("state");
        if (!Set.of("ready", "no_model", "loading", "busy", "error").contains(state)
                || !(status.get("modelLoaded") instanceof Boolean)
                || !"llama.rn".equals(status.getString("runtime"))
                || status.getInt("apiVersion") != API_VERSION
                || !(status.isNull("modelProfileId") || status.optString("modelProfileId").matches("[a-z0-9]+(?:[._-][a-z0-9]+){2,}"))
                || !(status.isNull("weightsSha256") || status.optString("weightsSha256").matches("[a-f0-9]{64}"))
                || status.getLong("modelBytes") < 0 || status.getLong("modelBytes") > 4_294_967_296L
                || ("ready".equals(state) && !status.getBoolean("modelLoaded"))
                || ("no_model".equals(state) && status.getBoolean("modelLoaded"))
                || (status.getBoolean("modelLoaded") && (status.isNull("weightsSha256") || status.getLong("modelBytes") < 1))
                || (!status.getBoolean("modelLoaded") && (!status.isNull("modelProfileId") || !status.isNull("weightsSha256") || status.getLong("modelBytes") != 0))
                || (status.getBoolean("modelLoaded") && status.isNull("modelProfileId")))
            throw new IllegalArgumentException("INVALID_LOCAL_AI_STATUS");
        return status;
    }

    Result complete(String requestToken, String prompt, String contextJson) throws Exception {
        validToken(requestToken); Engine.bounded(prompt); Engine.bounded(contextJson);
        return exchange(requestToken, (remote, callback) ->
            remote.complete(requestToken, prompt, contextJson, callback));
    }

    Result plan(String requestToken, Engine.ModelProfilePin pin, String schemaId,
                String prompt, String contextJson) throws Exception {
        validToken(requestToken);
        if (pin == null) throw new SecurityException("MODEL_PROFILE_PIN_REQUIRED");
        if (!dev.rock.sdk.ZemaToolPlan.ARTICLE_PLAN_SCHEMA.equals(schemaId))
            throw new IllegalArgumentException("UNSUPPORTED_PLAN_SCHEMA");
        Engine.bounded(prompt); Engine.bounded(contextJson);
        return exchange(requestToken, (remote, callback) ->
            remote.completePlanForModel(requestToken, schemaId, pin.weightsSha256, prompt, contextJson, callback));
    }

    /** Transfers a verified staged artifact through a read-only descriptor, never a broker path or URL. */
    Result installAndLoad(String requestToken, Engine.ModelProfilePin pin, File brokerStagedArtifact) throws Exception {
        if (pin == null) throw new SecurityException("MODEL_PROFILE_PIN_REQUIRED");
        Result result = installAndLoad(requestToken, pin.profileId, pin.weightsSha256,
            pin.artifactBytes, brokerStagedArtifact);
        if ("completed".equals(result.event)) requireReadyForPlanning(pin);
        return result;
    }

    /** Candidate profile loader used before PlatformStore activates it. */
    Result installAndLoad(String requestToken, ModelProfileManifest profile,
                          String expectedRuntimeSignerDigest, File brokerStagedArtifact) throws Exception {
        validToken(requestToken);
        if (profile == null || expectedRuntimeSignerDigest == null
                || !expectedRuntimeSignerDigest.matches("[a-f0-9]{64}")
                || !RUNTIME_COMPONENT_ID.equals(profile.runtimeComponentId)
                || profile.runtimeVersionCode != PACKAGE_VERSION_CODE
                || API_VERSION < profile.runtimeApiMin || API_VERSION > profile.runtimeApiMax)
            throw new SecurityException("MODEL_PROFILE_RUNTIME_MISMATCH");
        if (!expectedRuntimeSignerDigest.equals(installedSigningDigest()))
            throw new SecurityException("MODEL_PROFILE_RUNTIME_MISMATCH");
        Result result = installAndLoad(requestToken, profile.profileId, profile.weightsSha256,
            profile.artifactBytes, brokerStagedArtifact);
        if ("completed".equals(result.event)) requireReadyForProfile(profile, expectedRuntimeSignerDigest);
        return result;
    }

    private Result installAndLoad(String requestToken, String profileId, String weightsSha256,
                                  long artifactBytes, File brokerStagedArtifact) throws Exception {
        validToken(requestToken);
        if (brokerStagedArtifact == null || profileId == null
                || !profileId.matches("[a-z0-9]+(?:[._-][a-z0-9]+){2,}")
                || weightsSha256 == null || !weightsSha256.matches("[a-f0-9]{64}")
                || artifactBytes < 1 || artifactBytes > 4_294_967_296L)
            throw new IllegalArgumentException("INVALID_MODEL_HANDOFF");
        if (Files.isSymbolicLink(brokerStagedArtifact.toPath())
                || !Files.isRegularFile(brokerStagedArtifact.toPath(), LinkOption.NOFOLLOW_LINKS))
            throw new SecurityException("MODEL_ARTIFACT_FILE_REQUIRED");
        if (Files.size(brokerStagedArtifact.toPath()) != artifactBytes
                || !weightsSha256.equals(hashFile(brokerStagedArtifact)))
            throw new SecurityException("MODEL_ARTIFACT_STAGED_FILE_MISMATCH");
        Result result;
        try (ParcelFileDescriptor model = ParcelFileDescriptor.open(brokerStagedArtifact,
                ParcelFileDescriptor.MODE_READ_ONLY)) {
            if (model.getStatSize() != artifactBytes)
                throw new SecurityException("MODEL_DESCRIPTOR_LENGTH_MISMATCH");
            result = exchange(requestToken, (remote, callback) ->
                remote.installAndLoadModel(requestToken, profileId, weightsSha256,
                    artifactBytes, model, callback), 15 * 60, false);
        }
        if (!"completed".equals(result.event)) return result;
        JSONObject loaded = new JSONObject(result.payload);
        if (loaded.length() != 3 || !profileId.equals(loaded.optString("profileId"))
                || !weightsSha256.equals(loaded.optString("weightsSha256"))
                || artifactBytes != loaded.optLong("artifactBytes", -1))
            throw new SecurityException("MODEL_HANDOFF_RECEIPT_MISMATCH");
        JSONObject status = withService((remote, ignoredUid) -> validatedStatus(remote));
        if (!"ready".equals(status.optString("state")) || !status.optBoolean("modelLoaded")
                || !profileId.equals(status.optString("modelProfileId"))
                || !weightsSha256.equals(status.optString("weightsSha256"))
                || artifactBytes != status.optLong("modelBytes", -1))
            throw new SecurityException("MODEL_HANDOFF_STATUS_MISMATCH");
        return result;
    }

    private void requireReadyForProfile(ModelProfileManifest profile, String expectedRuntimeSignerDigest) throws Exception {
        JSONObject status = withService((remote, ignoredUid) -> validatedStatus(remote));
        if (!"ready".equals(status.optString("state")) || !status.optBoolean("modelLoaded")
                || !profile.profileId.equals(status.optString("modelProfileId"))
                || !profile.weightsSha256.equals(status.optString("weightsSha256"))
                || profile.artifactBytes != status.optLong("modelBytes", -1)
                || !expectedRuntimeSignerDigest.equals(installedSigningDigest()))
            throw new SecurityException("MODEL_PROFILE_RUNTIME_MISMATCH");
    }

    private static String hashFile(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) if (count > 0) digest.update(buffer, 0, count);
        }
        StringBuilder value = new StringBuilder(64);
        for (byte item : digest.digest()) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return value.toString();
    }

    Result confirm(String requestToken, String proposalId, boolean approved) throws Exception {
        validToken(requestToken);
        if (proposalId == null || !proposalId.matches("[A-Za-z0-9_-]{1,80}"))
            throw new IllegalArgumentException("INVALID_PROPOSAL_ID");
        return exchange(requestToken, (remote, callback) ->
            remote.confirm(requestToken, proposalId, approved, callback));
    }

    void cancel(String requestToken) {
        try { validToken(requestToken); if (service != null) service.cancel(requestToken); }
        catch (IllegalArgumentException | RemoteException ignored) { }
    }

    private Result exchange(String requestToken, Request request) throws Exception {
        return exchange(requestToken, request, 90, true);
    }

    private Result exchange(String requestToken, Request request, long timeoutSeconds,
                            boolean cancelOnTimeout) throws Exception {
        return withService((remote, expectedUid) -> {
            CountDownLatch finished = new CountDownLatch(1);
            AtomicReference<Result> result = new AtomicReference<>();
            StringBuilder text = new StringBuilder();
            ILocalAiCallback callback = new ILocalAiCallback.Stub() {
                @Override public void onEvent(String receivedToken, String event, String payload) {
                    if (Binder.getCallingUid() != expectedUid || !requestToken.equals(receivedToken)) return;
                    try {
                        if (event == null || payload == null) throw new IllegalArgumentException();
                        if ("token".equals(event)) {
                            if (result.get() != null) return;
                            appendBounded(text, payload);
                        } else if (TERMINAL_EVENTS.contains(event)) {
                            String body = payload;
                            if ("completed".equals(event)) {
                                body = payload.isEmpty() ? text.toString() : payload;
                                Engine.bounded(body);
                            } else Engine.bounded(body);
                            result.compareAndSet(null, new Result(event, body));
                            finished.countDown();
                        } else {
                            result.compareAndSet(null, new Result("failed", "INVALID_EVENT"));
                            finished.countDown();
                        }
                    } catch (RuntimeException error) {
                        result.compareAndSet(null, new Result("failed", "INVALID_RESPONSE"));
                        finished.countDown();
                    }
                }
            };
            request.start(remote, callback);
            if (!finished.await(timeoutSeconds, TimeUnit.SECONDS) || result.get() == null) {
                if (cancelOnTimeout) remote.cancel(requestToken);
                throw new IllegalStateException("LOCAL_AI_INTERRUPTED");
            }
            return result.get();
        });
    }

    private synchronized <T> T withService(BoundCall<T> call) throws Exception {
        PackageManager pm = context.getPackageManager();
        int expectedUid = pm.getPackageUid(PACKAGE, 0);
        if (pm.getPackageInfo(PACKAGE, 0).getLongVersionCode() != PACKAGE_VERSION_CODE)
            throw new SecurityException("UNAPPROVED_LOCAL_AI_VERSION");
        if (pm.checkSignatures(context.getPackageName(), PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_LOCAL_AI_SIGNER");
        CountDownLatch connected = new CountDownLatch(1);
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                service = ILocalAiService.Stub.asInterface(binder); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { service = null; }
            @Override public void onBindingDied(ComponentName name) { service = null; connected.countDown(); }
            @Override public void onNullBinding(ComponentName name) { connected.countDown(); }
        };
        boolean bound = context.bindService(new Intent().setComponent(new ComponentName(PACKAGE, SERVICE)),
                                            connection, Context.BIND_AUTO_CREATE);
        if (!bound) throw new IllegalStateException("LOCAL_AI_UNAVAILABLE");
        try {
            if (!connected.await(5, TimeUnit.SECONDS) || service == null)
                throw new IllegalStateException("LOCAL_AI_BIND_INTERRUPTED");
            if (service.getApiVersion() != API_VERSION)
                throw new IllegalStateException("INCOMPATIBLE_LOCAL_AI_API");
            return call.run(service, expectedUid);
        } finally {
            context.unbindService(connection); service = null;
        }
    }

    private static void validToken(String token) {
        if (token == null || !token.matches("[a-f0-9-]{36}"))
            throw new IllegalArgumentException("INVALID_REQUEST_TOKEN");
    }

    private String installedSigningDigest() throws Exception {
        PackageManager pm = context.getPackageManager();
        android.content.pm.PackageInfo info = pm.getPackageInfo(PACKAGE, PackageManager.GET_SIGNING_CERTIFICATES);
        android.content.pm.Signature[] signers = info.signingInfo.getApkContentsSigners();
        if (signers == null || signers.length != 1) throw new SecurityException("UNTRUSTED_LOCAL_AI_SIGNER");
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(signers[0].toByteArray());
        StringBuilder hex = new StringBuilder(64);
        for (byte value : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return hex.toString();
    }

    private static void appendBounded(StringBuilder output, String value) {
        if (value.getBytes(StandardCharsets.UTF_8).length > Engine.MAX_BYTES
                || output.toString().getBytes(StandardCharsets.UTF_8).length
                   + value.getBytes(StandardCharsets.UTF_8).length > Engine.MAX_BYTES)
            throw new IllegalArgumentException("INVALID_RESPONSE_SIZE");
        output.append(value);
    }

    private interface BoundCall<T> { T run(ILocalAiService remote, int expectedUid) throws Exception; }
    private interface Request { void start(ILocalAiService remote, ILocalAiCallback callback) throws RemoteException; }
}
