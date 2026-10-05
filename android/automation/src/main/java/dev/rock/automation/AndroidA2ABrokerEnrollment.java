package dev.rock.automation;

import android.content.Context;
import dev.rock.core.platform.A2AWalletSettlementSync;
import dev.rock.core.platform.A2ABrokerAuthorization;
import dev.rock.core.platform.PlatformStore;
import java.io.IOException;
import java.util.Base64;
import java.util.Map;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Owner-bound Android Keystore enrollment and read-only settled-receipt recovery. */
final class AndroidA2ABrokerEnrollment {
    static final String AUTHORITY_ID = "android-key-attestation-google";
    private static final String PACKAGE_NAME = "dev.rock.automation";
    private static final Pattern UUID = Pattern.compile(
        "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    private static final Pattern KEY_ID = Pattern.compile("[a-f0-9]{64}");

    private AndroidA2ABrokerEnrollment() { }

    static String enroll(Context context, String origin, AndroidRockstarDeviceSessionStore sessions,
            boolean requireStrongBox) throws Exception {
        String authorization = requireAuthorization(sessions);
        String owner = requireOwner(sessions);
        String deviceRef = new AndroidA2ABrokerDeviceRefStore(context).getOrCreate();
        AndroidA2ABrokerDeviceTransport transport = new AndroidA2ABrokerDeviceTransport(origin);
        JSONObject active = activeDevice(transport.devices(authorization), deviceRef);
        if (active != null) {
            String keyId = active.getString("keyId");
            A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.open(context, keyId);
            if (requireStrongBox && !key.strongBoxBacked())
                throw new SecurityException("A2A_BROKER_STRONGBOX_REQUIRED");
            return enrollmentResponse("already_registered", deviceRef, keyId,
                key.hardwareBacked(), key.strongBoxBacked(), true);
        }

        JSONObject challenge = transport.challenge(authorization, deviceRef);
        String challengeId = challenge.optString("challengeId");
        String nonce = challenge.optString("challengeNonce");
        long expiresAt = challenge.optLong("expiresAt", 0);
        String returnedDeviceRef = challenge.optString("deviceRef");
        if (!UUID.matcher(challengeId).matches() || !UUID.matcher(returnedDeviceRef).matches() ||
                !deviceRef.equals(returnedDeviceRef) || !nonce.matches("[A-Za-z0-9_-]{43}") ||
                expiresAt <= System.currentTimeMillis() ||
                expiresAt > System.currentTimeMillis() + 5 * 60_000L)
            throw new IOException("A2A_BROKER_CHALLENGE_RESPONSE_INVALID");

        byte[] challengeBytes = null;
        try {
            challengeBytes = Base64.getUrlDecoder().decode(nonce);
            if (challengeBytes.length != 32) throw new IOException("A2A_BROKER_CHALLENGE_INVALID");
            A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.provision(
                context, challengeBytes, requireStrongBox);
            JSONArray chain = new JSONArray();
            int chainBytes = 0;
            for (String certificate : key.attestationChainDerBase64Url()) {
                chainBytes += certificate.length();
                if (chainBytes > 240 * 1024) throw new IOException("A2A_BROKER_ATTESTATION_TOO_LARGE");
                chain.put(certificate);
            }
            try {
                JSONObject result = transport.register(authorization, challengeId, nonce, chain);
                String state = result.optString("state");
                if (!("registered".equals(state) || "already_registered".equals(state)) ||
                        !AUTHORITY_ID.equals(result.optString("authorityId")) ||
                        !deviceRef.equals(result.optString("deviceRef")) ||
                        !key.keyId().equals(result.optString("keyId")) ||
                        !"ES256".equals(result.optString("algorithm")))
                    throw new IOException("A2A_BROKER_REGISTRATION_RESPONSE_INVALID");
                return enrollmentResponse(state, deviceRef, key.keyId(), key.hardwareBacked(),
                    key.strongBoxBacked(), false);
            } catch (IOException uncertain) {
                // A lost response must be reconciled against the server before this key is retired.
                try {
                    JSONObject committed = findActiveDevice(transport.devices(authorization), deviceRef, key.keyId());
                    if (committed != null)
                        return enrollmentResponse("registered", deviceRef, key.keyId(),
                            key.hardwareBacked(), key.strongBoxBacked(), false);
                    key.retire();
                } catch (Exception reconciliationFailed) {
                    uncertain.addSuppressed(reconciliationFailed);
                    throw new IOException("A2A_BROKER_REGISTRATION_OUTCOME_UNKNOWN", uncertain);
                }
                throw uncertain;
            }
        } catch (IllegalArgumentException | JSONException invalid) {
            throw new IOException("A2A_BROKER_ENROLLMENT_INVALID", invalid);
        } finally {
            if (challengeBytes != null) java.util.Arrays.fill(challengeBytes, (byte) 0);
        }
    }

    static String revoke(Context context, String origin, AndroidRockstarDeviceSessionStore sessions,
            String requestedKeyId) throws Exception {
        if (requestedKeyId == null || !KEY_ID.matcher(requestedKeyId).matches())
            throw new IllegalArgumentException("A2A_BROKER_KEY_ID_INVALID");
        String authorization = requireAuthorization(sessions);
        String deviceRef = new AndroidA2ABrokerDeviceRefStore(context).getOrCreate();
        AndroidA2ABrokerDeviceTransport transport = new AndroidA2ABrokerDeviceTransport(origin);
        JSONObject recorded = deviceByIdentity(transport.devices(authorization), deviceRef, requestedKeyId);
        if (recorded == null)
            throw new SecurityException("A2A_BROKER_ACTIVE_KEY_NOT_FOUND");
        if ("active".equals(recorded.optString("status"))) {
            JSONObject response = transport.revoke(authorization, deviceRef, requestedKeyId);
            if (!response.optBoolean("revoked") || !requestedKeyId.equals(response.optString("keyId")) ||
                    !deviceRef.equals(response.optString("deviceRef")))
                throw new IOException("A2A_BROKER_REVOCATION_UNCONFIRMED");
        } else if (!"revoked".equals(recorded.optString("status"))) {
            throw new SecurityException("A2A_BROKER_ACTIVE_KEY_NOT_FOUND");
        }
        try {
            A2ABrokerDeviceKeyStore.retire(context, requestedKeyId);
        } catch (Exception cleanupFailed) {
            return new JSONObject().put("state", "server_revoked_local_cleanup_pending")
                .put("deviceRef", deviceRef).put("keyId", requestedKeyId).toString();
        }
        JSONObject safe = new JSONObject().put("state", "revoked")
            .put("deviceRef", deviceRef).put("keyId", requestedKeyId);
        return safe.toString();
    }

    static String synchronizeWallet(Context context, String origin,
            AndroidRockstarDeviceSessionStore sessions, String delegationId,
            dev.rock.core.platform.PlatformStore platform) throws Exception {
        String authorization = requireAuthorization(sessions);
        String owner = requireOwner(sessions);
        Map<String,String> reservation = platform.a2aWalletReservation(owner, delegationId);
        String state = reservation.get("state");
        if ("HELD".equals(state)) {
            AndroidRockstarDeviceHomeTransport cloud = new AndroidRockstarDeviceHomeTransport(origin);
            JSONObject detail = new JSONObject(cloud.get(cloud.taskDetailPath("agent-status", delegationId), authorization));
            JSONObject delegation = detail.optJSONObject("delegation");
            if (delegation == null || !delegationId.equals(delegation.optString("id")) ||
                    !owner.equals(delegation.optString("ownerUserId")))
                throw new SecurityException("A2A_CLOUD_STATE_NOT_OWNER_VERIFIED");
            String cloudState = delegation.optString("state");
            if (!"awaiting_approval".equals(cloudState) && !"expired".equals(cloudState) &&
                    !"cancelled_before_dispatch".equals(cloudState)) {
                reservation = platform.reconcileA2ABudgetDispatched(owner, delegationId,
                    cloudState, System.currentTimeMillis());
                state = reservation.get("state");
            }
        }
        if (!("DISPATCHED".equals(state) || "INDETERMINATE".equals(state) ||
                "RECOVERY_REQUIRED".equals(state) || "SETTLED".equals(state)))
            throw new SecurityException("A2A_WALLET_HANDOFF_RESERVATION_NOT_SETTLEABLE");
        String deviceRef = new AndroidA2ABrokerDeviceRefStore(context).getOrCreate();
        JSONObject active = activeDevice(new AndroidA2ABrokerDeviceTransport(origin)
            .devices(authorization), deviceRef);
        if (active == null) throw new SecurityException("A2A_BROKER_DEVICE_NOT_ENROLLED");
        String keyId = active.getString("keyId");
        A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.open(context, keyId);
        AndroidA2AWalletHandoffSource source = new AndroidA2AWalletHandoffSource(origin,
            AUTHORITY_ID, owner, deviceRef, keyId, key);
        String receiptId = new A2AWalletSettlementSync(platform, source)
            .synchronize(owner, delegationId, System.currentTimeMillis());
        return new JSONObject().put("state", "settled")
            .put("delegationId", delegationId).put("receiptId", receiptId).toString();
    }

    /** Create a Cloud-compatible execution proof only from an exact, quote-bound HELD Wallet row. */
    static JSONObject authorizeHeldDelegation(Context context, String origin,
            AndroidRockstarDeviceSessionStore sessions, PlatformStore platform,
            A2ABrokerAuthorization.Intent intent) throws Exception {
        String authorization = requireAuthorization(sessions);
        String owner = requireOwner(sessions);
        if (intent == null || !owner.equals(intent.ownerUserId))
            throw new SecurityException("A2A_BROKER_OWNER_MISMATCH");
        String deviceRef = new AndroidA2ABrokerDeviceRefStore(context).getOrCreate();
        JSONObject active = activeDevice(new AndroidA2ABrokerDeviceTransport(origin)
            .devices(authorization), deviceRef);
        if (active == null) throw new SecurityException("A2A_BROKER_DEVICE_NOT_ENROLLED");
        String keyId = active.getString("keyId");
        A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.open(context, keyId);
        Map<String,Object> signed = platform.authorizeHeldA2ADelegation(intent, AUTHORITY_ID,
            deviceRef, keyId, System.currentTimeMillis(), key);
        JSONObject proof = new JSONObject();
        for (Map.Entry<String,Object> field : signed.entrySet()) proof.put(field.getKey(), field.getValue());
        return proof;
    }

    private static JSONObject activeDevice(JSONArray devices, String deviceRef) throws JSONException, IOException {
        JSONObject match = null;
        for (int index = 0; index < devices.length(); index++) {
            JSONObject item = devices.optJSONObject(index);
            if (item == null) throw new IOException("A2A_BROKER_DEVICE_LIST_INVALID");
            if (!deviceRef.equals(item.optString("deviceRef")) || !"active".equals(item.optString("status")))
                continue;
            String keyId = item.optString("keyId");
            if (!KEY_ID.matcher(keyId).matches() || !"ES256".equals(item.optString("algorithm")) ||
                    !PACKAGE_NAME.equals(item.optString("applicationPackage")))
                throw new IOException("A2A_BROKER_DEVICE_RECORD_INVALID");
            if (match != null) throw new IOException("A2A_BROKER_MULTIPLE_ACTIVE_KEYS");
            match = item;
        }
        return match;
    }

    private static JSONObject findActiveDevice(JSONArray devices, String deviceRef, String keyId)
            throws IOException {
        for (int index = 0; index < devices.length(); index++) {
            JSONObject item = devices.optJSONObject(index);
            if (item == null) throw new IOException("A2A_BROKER_DEVICE_LIST_INVALID");
            if (deviceRef.equals(item.optString("deviceRef")) && keyId.equals(item.optString("keyId")) &&
                    "active".equals(item.optString("status"))) return item;
        }
        return null;
    }

    private static JSONObject deviceByIdentity(JSONArray devices, String deviceRef, String keyId)
            throws IOException {
        for (int index = 0; index < devices.length(); index++) {
            JSONObject item = devices.optJSONObject(index);
            if (item == null) throw new IOException("A2A_BROKER_DEVICE_LIST_INVALID");
            if (deviceRef.equals(item.optString("deviceRef")) && keyId.equals(item.optString("keyId")) &&
                    PACKAGE_NAME.equals(item.optString("applicationPackage"))) return item;
        }
        return null;
    }

    private static String requireAuthorization(AndroidRockstarDeviceSessionStore sessions) throws IOException {
        String authorization = sessions.authorizationHeader();
        if (authorization == null) throw new IOException("A2A_BROKER_ACCOUNT_NOT_LINKED");
        return authorization;
    }

    private static String requireOwner(AndroidRockstarDeviceSessionStore sessions) throws IOException {
        String owner = sessions.ownerUserId();
        if (owner == null || !owner.matches("[A-Za-z0-9._:-]{1,128}"))
            throw new IOException("A2A_BROKER_OWNER_INVALID");
        return owner;
    }

    private static String enrollmentResponse(String state, String deviceRef, String keyId,
            boolean hardwareBacked, boolean strongBoxBacked, boolean resumed) throws JSONException {
        return new JSONObject().put("state", state).put("authorityId", AUTHORITY_ID)
            .put("deviceRef", deviceRef).put("keyId", keyId).put("algorithm", "ES256")
            .put("hardwareBacked", hardwareBacked).put("strongBoxBacked", strongBoxBacked)
            .put("resumed", resumed).toString();
    }
}
