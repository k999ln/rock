package dev.rock.automation;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import dev.rock.core.Engine;
import dev.rock.core.platform.EncryptedBackup;
import dev.rock.core.platform.EsimGatewayEnrollmentChallenge;
import dev.rock.core.platform.PlatformApi;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.A2AUsageReceiptVerifier;
import dev.rock.core.platform.A2ABrokerAuthorization;
import dev.rock.core.platform.A2ARecoveryBinding;
import dev.rock.core.platform.RecoveryPhrase;
import dev.rock.core.platform.RockstarDeviceAuthorizationFlow;
import dev.rock.sdk.ArticlePayload;
import dev.rock.shellapi.IShellApi;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Exact-package UI bridge. The shell never opens the Broker database or Keystore directly. */
public final class RockShellService extends Service {
    static final String SHELL_PACKAGE = "dev.rock.shell";
    private static final int MAX_SNAPSHOT_WORKS = 25;
    private static final long RECOVERY_SETUP_MS = 10 * 60 * 1000L;
    private final Object zemaLock = new Object();
    private final Object deviceLinkLock = new Object();
    private final Object a2aBrokerDeviceLock = new Object();
    private static final Object recoveryLock = new Object();
    /** Survives short bind/unbind cycles but never survives a Broker process restart. */
    private static PendingRecoverySetup pendingRecovery;
    private RockstarDeviceAuthorizationFlow deviceAuthorizationFlow;
    private RockstarDeviceAuthorizationFlow.DeviceAuthorization pendingDeviceAuthorization;
    private String pendingDeviceLinkId;
    private long pendingDeviceLinkNextPollAt;
    private int pendingDeviceLinkIntervalSeconds;

    private final IShellApi.Stub binder = new IShellApi.Stub() {
        @Override public int getApiVersion() { enforceShellCaller(); return IShellApi.API_VERSION; }
        @Override public String snapshot() throws android.os.RemoteException {
            enforceShellCaller();
            try { return snapshotJson(); }
            catch (RuntimeException error) { throw new android.os.RemoteException("SNAPSHOT_FAILED"); }
        }
        @Override public String submit(String requestId, String inputJson, boolean sample, boolean consent) {
            enforceShellCaller(); ArticlePayload.parse(inputJson);
            String id = engine().submit(requestId, inputJson, sample, consent); Scheduler.schedule(RockShellService.this); return id;
        }
        @Override public void setPaused(boolean paused) {
            enforceShellCaller(); engine().setPaused(paused);
            if (paused) Scheduler.stop(RockShellService.this); else Scheduler.schedule(RockShellService.this);
        }
        @Override public String result(String workId) { enforceShellCaller(); validWorkId(workId); return engine().result(workId); }
        @Override public void complete(String workId, String note) { enforceShellCaller(); validWorkId(workId); engine().complete(workId, note); }
        @Override public void retry(String workId) { enforceShellCaller(); validWorkId(workId); engine().retry(workId); Scheduler.schedule(RockShellService.this); }
        @Override public void cancel(String workId) { enforceShellCaller(); validWorkId(workId); engine().cancel(workId); }
        @Override public String localAiStatus() throws android.os.RemoteException {
            enforceShellCaller();
            try { return new LocalAiConnection(RockShellService.this).status(); }
            catch (Exception error) { throw new android.os.RemoteException("LOCAL_AI_UNAVAILABLE"); }
        }
        @Override public String submitZema(String requestId, String selectionToken, String prompt,
                String contextJson, boolean consent) {
            enforceShellCaller();
            try {
                synchronized (zemaLock) {
                    String id = new ZemaOrchestrator(RockShellService.this, engine())
                        .submit(requestId, selectionToken, prompt, contextJson, consent);
                    Scheduler.schedule(RockShellService.this);
                    return zemaResponse("queued", null, id);
                }
            } catch (SecurityException denied) {
                String reason = denied.getMessage();
                String code;
                if ("LOCAL_ARTIFACT_CONSENT_REQUIRED".equals(reason)) code = "DENIED";
                else if ("LOCAL_AI_NOT_READY".equals(reason)) code = "LOCAL_AI_NOT_READY";
                else if ("MODEL_PROFILE_RUNTIME_MISMATCH".equals(reason)) code = "MODEL_PROFILE_RUNTIME_MISMATCH";
                else if ("SKY_SELECTION_REQUIRED".equals(reason)
                        || "SKY_SELECTION_MISMATCH".equals(reason))
                    code = "SKY_SELECTION_REQUIRED";
                else if ("ZEMA_TOOL_SUBSTITUTION".equals(reason)
                        || "LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL".equals(reason))
                    code = "INVALID_PLAN";
                else code = "LOCAL_AI_UNAVAILABLE";
                return zemaResponse("blocked", code, null);
            } catch (IllegalArgumentException invalid) {
                return zemaResponse("blocked", "INVALID_PLAN", null);
            } catch (IllegalStateException unavailable) {
                String reason = unavailable.getMessage();
                String code = "MODEL_PROFILE_NOT_ACTIVE".equals(reason)
                    ? "MODEL_PROFILE_NOT_ACTIVE" : "LOCAL_AI_UNAVAILABLE";
                return zemaResponse("blocked", code, null);
            } catch (Exception failed) {
                return zemaResponse("blocked", "LOCAL_AI_UNAVAILABLE", null);
            }
        }
        @Override public String skySelection() {
            enforceShellCaller(); return skySelectionResponse(engine().skySelection());
        }
        @Override public String selectSkyTool(String toolId) {
            enforceShellCaller(); return skySelectionResponse(engine().selectSkyTool(toolId));
        }
        @Override public String recoveryStatus() {
            enforceShellCaller(); return recoveryStatusResponse();
        }
        @Override public String beginRecoverySetup() {
            enforceShellCaller(); return beginRecoverySetupResponse();
        }
        @Override public String confirmRecoverySetup(String setupToken, String confirmationsJson) {
            enforceShellCaller(); return confirmRecoverySetupResponse(setupToken, confirmationsJson);
        }
        @Override public String createRecoverableBackup(String requestId,
                ParcelFileDescriptor destination) {
            enforceShellCaller();
            synchronized (recoveryLock) {
                try {
                    RecoverableBackupManager.ExportResult result = backupManager().exportTo(
                        requestId, AndroidOwner.current(RockShellService.this), destination);
                    JSONObject response = new JSONObject();
                    response.put("status", "exported"); response.put("requestId", result.requestId);
                    response.put("bytes", result.bytes); response.put("sha256", result.sha256);
                    response.put("hardwareBacked", result.hardwareBacked);
                    response.put("storageSyncConfirmed", result.storageSyncConfirmed);
                    return boundedJson(response);
                } catch (Exception failure) {
                    android.util.Log.e("RockstarOS.Backup", "Export failed: "
                        + failure.getClass().getSimpleName());
                    return recoveryFailure("BACKUP_EXPORT_FAILED");
                }
            }
        }
        @Override public String restoreRecoverableBackup(ParcelFileDescriptor source,
                String recoveryPhrase) {
            enforceShellCaller();
            synchronized (recoveryLock) {
                try {
                    PlatformStore.RestoreSummary result = backupManager().restoreFrom(source,
                        recoveryPhrase, AndroidOwner.current(RockShellService.this));
                    JSONObject response = new JSONObject(); response.put("status", "restored");
                    response.put("works", result.works);
                    response.put("ledgerEntries", result.ledgerEntries);
                    response.put("stoppedApprovals", result.stoppedApprovals);
                    response.put("paused", true);
                    return boundedJson(response);
                } catch (SecurityException denied) {
                    return recoveryFailure("RECOVERY_PHRASE_OR_OWNER_REJECTED");
                } catch (Exception failure) {
                    android.util.Log.e("RockstarOS.Backup", "Restore failed: "
                        + failure.getClass().getSimpleName());
                    return recoveryFailure("BACKUP_RESTORE_FAILED");
                }
            }
        }
        @Override public String provisionEsimGatewayKey(String challengeJson,
                boolean requireStrongBox) {
            enforceShellCaller();
            return provisionEsimGatewayKeyResponse(challengeJson, requireStrongBox);
        }
        @Override public String beginRockstarDeviceLink() {
            enforceShellCaller(); return beginRockstarDeviceLinkResponse();
        }
        @Override public String pollRockstarDeviceLink(String flowId) {
            enforceShellCaller(); return pollRockstarDeviceLinkResponse(flowId);
        }
        @Override public String rockstarDeviceLinkStatus() {
            enforceShellCaller(); return rockstarDeviceLinkStatusResponse();
        }
        @Override public String cloudServiceHome() {
            enforceShellCaller();
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                return new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN)
                    .get(AndroidRockstarDeviceHomeTransport.PATH, authorization);
            } catch (Exception failure) {
                return "{\"state\":\"unavailable\",\"code\":\"DEVICE_HOME_UNAVAILABLE\"}";
            }
        }
        @Override public String claimRockstarServiceEntitlement(String packageJson) {
            enforceShellCaller();
            if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                return "{\"state\":\"not_configured\"}";
            try {
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                JSONObject result = new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN)
                    .claimRockstarServiceEntitlement(authorization, packageJson);
                JSONObject entitlement = result.getJSONObject("entitlement");
                JSONObject safe = new JSONObject();
                safe.put("state", "registered");
                safe.put("alreadyClaimed", entitlement.optBoolean("alreadyClaimed"));
                safe.put("offerId", entitlement.optString("offerId", ""));
                safe.put("formFactor", entitlement.optString("formFactor", "unknown"));
                safe.put("status", entitlement.optString("status", "unknown"));
                return boundedJson(safe);
            } catch (Exception failure) {
                String reason = failure.getMessage();
                if (reason != null && (reason.equals("ENTITLEMENT_PACKAGE_INVALID") ||
                        reason.startsWith("ENTITLEMENT_PACKAGE_")))
                    return "{\"state\":\"invalid_package\"}";
                if (reason != null && (reason.endsWith("HTTP_400") || reason.endsWith("HTTP_409")))
                    return "{\"state\":\"claim_rejected\"}";
                if (reason != null && reason.endsWith("HTTP_401")) return "{\"state\":\"not_linked\"}";
                return "{\"state\":\"unavailable\"}";
            }
        }
        @Override public String cloudTaskDetail(String kind, String taskId) {
            enforceShellCaller();
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                String path = transport.taskDetailPath(kind, taskId);
                return transport.get(path, authorization);
            } catch (Exception failure) {
                return "{\"state\":\"unavailable\",\"code\":\"DEVICE_TASK_UNAVAILABLE\"}";
            }
        }
        @Override public String cloudA2AAgents() {
            enforceShellCaller();
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                return transport.get(transport.a2aAgentsPath(), authorization);
            } catch (Exception failure) {
                return a2aBrokerFailure("AGENT_DIRECTORY_UNAVAILABLE");
            }
        }
        @Override public String requestCloudA2APriceQuote(String agentId, String quoteRequestId,
                String message, String currency, long maximumBudgetMinor, long expiresAt,
                boolean consentToSharePrompt) {
            enforceShellCaller();
            if (!consentToSharePrompt) return a2aBrokerFailure("PRICE_QUOTE_CONSENT_REQUIRED");
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                String authorization = sessions.authorizationHeader();
                String owner = sessions.ownerUserId();
                if (authorization == null || owner == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                JSONObject directory = new JSONObject(transport.get(transport.a2aAgentsPath(), authorization));
                JSONArray agents = directory.optJSONArray("agents");
                JSONObject selected = null;
                if (agents != null) for (int i = 0; i < agents.length(); i++) {
                    JSONObject candidate = agents.optJSONObject(i);
                    if (candidate != null && agentId != null && agentId.equals(candidate.optString("id"))) {
                        selected = candidate;
                        break;
                    }
                }
                if (selected == null) return a2aBrokerFailure("AGENT_NOT_CONNECTED");
                String origin = selected.optString("origin", "");
                String name = selected.optString("agentName", "");
                String version = selected.optString("agentVersion", "");
                JSONObject response = transport.requestA2APriceQuote(authorization, agentId,
                    quoteRequestId, message, currency, maximumBudgetMinor, expiresAt, true);
                JSONObject quote = new JSONObject();
                for (String field : new String[] {"schema", "providerId", "keyId", "quoteId", "agentOrigin",
                        "agentName", "agentVersion", "requestSha256", "pricingVersion", "pricingSha256",
                        "currency", "estimateMinor", "maxAmountMinor", "issuedAt", "expiresAt", "usage", "signature"})
                    if (response.has(field)) quote.put(field, response.get(field));
                String quoteDigest = verifyA2AQuote(quote, origin, name, version, message,
                    currency, maximumBudgetMinor);
                response.put("verified", true);
                response.put("priceQuoteDigest", quoteDigest);
                response.put("agentId", agentId);
                return boundedJson(response);
            } catch (SecurityException denied) {
                String code = denied.getMessage();
                if (code == null || !code.matches("A2A_(?:PRICE_QUOTE|USAGE)_[A-Z0-9_]+"))
                    code = "PRICE_QUOTE_UNVERIFIED";
                return a2aBrokerFailure(code);
            } catch (Exception unavailable) {
                return a2aBrokerFailure("PRICE_QUOTE_UNAVAILABLE");
            }
        }
        @Override public String prepareCloudA2ADelegation(String draftJson) {
            enforceShellCaller();
            boolean cloudCreateAttempted = false;
            try {
                if (draftJson == null || draftJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 24_000)
                    return a2aBrokerFailure("DELEGATION_DRAFT_INVALID");
                JSONObject draft = new JSONObject(draftJson);
                Set<String> fields = new java.util.HashSet<>();
                draft.keys().forEachRemaining(fields::add);
                if (!fields.equals(Set.of("id", "parentJobId", "idempotencyKey", "messageId", "agentId",
                        "message", "budgetCurrency", "budgetLimitMinor", "parentBudgetLimitMinor", "deadlineAt", "priceQuote")))
                    return a2aBrokerFailure("DELEGATION_DRAFT_FIELDS_INVALID");
                String id = draft.getString("id");
                String parentJobId = draft.getString("parentJobId");
                String idempotencyKey = draft.getString("idempotencyKey");
                String messageId = draft.getString("messageId");
                String agentId = draft.getString("agentId");
                String message = draft.getString("message");
                String currency = draft.getString("budgetCurrency");
                long budgetLimitMinor = draft.getLong("budgetLimitMinor");
                long parentBudgetLimitMinor = draft.getLong("parentBudgetLimitMinor");
                long deadlineAt = draft.getLong("deadlineAt");
                JSONObject quote = draft.getJSONObject("priceQuote");
                if (!id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") ||
                        !messageId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") ||
                        !idempotencyKey.matches("[A-Za-z0-9._:-]{1,128}") || message.trim().isEmpty() ||
                        message.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8_000 ||
                        !currency.matches("[A-Z]{3}") || budgetLimitMinor < 1 ||
                        parentBudgetLimitMinor < budgetLimitMinor || deadlineAt <= System.currentTimeMillis() ||
                        deadlineAt > quote.optLong("expiresAt", 0) || budgetLimitMinor != quote.optLong("maxAmountMinor", -1))
                    return a2aBrokerFailure("DELEGATION_DRAFT_TERMS_INVALID");

                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                String authorization = sessions.authorizationHeader();
                String owner = sessions.ownerUserId();
                if (authorization == null || owner == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                JSONObject directory = new JSONObject(transport.get(transport.a2aAgentsPath(), authorization));
                JSONArray agents = directory.optJSONArray("agents");
                JSONObject selected = null;
                if (agents != null) for (int i = 0; i < agents.length(); i++) {
                    JSONObject candidate = agents.optJSONObject(i);
                    if (candidate != null && agentId.equals(candidate.optString("id"))) { selected = candidate; break; }
                }
                if (selected == null) return a2aBrokerFailure("AGENT_NOT_CONNECTED");
                String origin = selected.optString("origin", "");
                String name = selected.optString("agentName", "");
                String version = selected.optString("agentVersion", "");
                String quoteDigest = verifyA2AQuote(quote, origin, name, version, message, currency, budgetLimitMinor);
                A2ABrokerAuthorization.Intent intent = new A2ABrokerAuthorization.Intent(owner, id,
                    parentJobId, messageId, origin, name, version, "1.0", currency,
                    quote.getString("pricingVersion"), budgetLimitMinor, parentBudgetLimitMinor,
                    true, deadlineAt, message, quoteDigest);
                String expectedInput = intent.requestSha256;
                String expectedAuthorization = A2ABrokerAuthorization.authorizationSha256(intent);
                JSONObject payload = new JSONObject();
                payload.put("id", id); payload.put("parentJobId", parentJobId);
                payload.put("idempotencyKey", idempotencyKey); payload.put("messageId", messageId);
                payload.put("targetOrigin", origin); payload.put("targetAgentName", name);
                payload.put("targetAgentVersion", version); payload.put("message", message);
                payload.put("budgetCurrency", currency); payload.put("budgetLimitMinor", budgetLimitMinor);
                payload.put("parentBudgetLimitMinor", parentBudgetLimitMinor);
                payload.put("continueWhileDeviceOffline", true); payload.put("deadlineAt", deadlineAt);
                payload.put("priceQuote", quote);
                cloudCreateAttempted = true;
                JSONObject saved = transport.createA2ADelegation(authorization, payload);
                JSONObject delegation = saved.optJSONObject("delegation");
                JSONObject approval = saved.optJSONObject("approval");
                if (delegation == null || approval == null || !id.equals(delegation.optString("id")) ||
                        !parentJobId.equals(delegation.optString("parentJobId")) ||
                        !idempotencyKey.equals(delegation.optString("idempotencyKey")) ||
                        !messageId.equals(delegation.optString("messageId")) ||
                        !expectedInput.equals(delegation.optString("inputSha256")) ||
                        !expectedAuthorization.equals(delegation.optString("authorizationSha256")) ||
                        !quoteDigest.equals(delegation.optString("priceQuoteDigest")) ||
                        !"awaiting_approval".equals(delegation.optString("state")) ||
                        !approval.optBoolean("required") || !expectedAuthorization.equals(approval.optString("digest")))
                    return "{\"state\":\"unknown\",\"error\":\"DRAFT_RESPONSE_UNKNOWN\",\"recoveryRequired\":true}";
                saved.put("nativeTermsVerified", true);
                saved.put("executionStarted", false);
                return boundedJson(saved);
            } catch (SecurityException denied) {
                String code = denied.getMessage();
                if (code == null || !code.matches("A2A_(?:PRICE_QUOTE|USAGE)_[A-Z0-9_]+"))
                    code = "DELEGATION_DRAFT_DENIED";
                return a2aBrokerFailure(code);
            } catch (java.io.IOException uncertain) {
                return "{\"state\":\"unknown\",\"error\":\"DRAFT_RESPONSE_UNKNOWN\",\"recoveryRequired\":true}";
            } catch (Exception invalid) {
                if (cloudCreateAttempted)
                    return "{\"state\":\"unknown\",\"error\":\"DRAFT_RESPONSE_UNKNOWN\",\"recoveryRequired\":true}";
                return a2aBrokerFailure("DELEGATION_DRAFT_UNAVAILABLE");
            }
        }
        @Override public String recoverCloudA2ADelegation(String parentJobId, String idempotencyKey, String inputSha256) {
            enforceShellCaller();
            try {
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                String path = transport.recoverA2ADelegationPath(parentJobId, idempotencyKey, inputSha256);
                JSONObject response = new JSONObject(transport.get(path, authorization));
                JSONObject delegation = response.optJSONObject("delegation");
                if (delegation == null) return "{\"state\":\"not_found\"}";
                if (!parentJobId.equals(delegation.optString("parentJobId")) ||
                        !idempotencyKey.equals(delegation.optString("idempotencyKey")) ||
                        !inputSha256.equalsIgnoreCase(delegation.optString("inputSha256")))
                    return a2aBrokerFailure("DELEGATION_RECOVERY_MISMATCH");
                JSONObject recovered = new JSONObject();
                recovered.put("state", "recovered");
                recovered.put("delegation", delegation);
                recovered.put("executionStarted", !"awaiting_approval".equals(delegation.optString("state")));
                return boundedJson(recovered);
            } catch (Exception unavailable) {
                return a2aBrokerFailure("DELEGATION_RECOVERY_UNAVAILABLE");
            }
        }
        @Override public String requestCloudA2AWalletReservation(String draftJson) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                try {
                    VerifiedA2ADraft draft = verifyCloudA2ADraft(draftJson);
                    long now = System.currentTimeMillis();
                    // Anchor expiry to signed quote issuance so retries produce the same approval digest.
                    long approvalExpiry = Math.min(draft.hold.deadlineAt, draft.hold.createdAt + 5L * 60_000L);
                    String approvalId = ((RockApplication) getApplication()).platform()
                        .proposeA2AWalletApproval(draft.ownerUserId, "a2a-wallet:" + draft.delegationId,
                            draft.hold, approvalExpiry, now);
                    Map<String,String> approval = ((RockApplication) getApplication()).platform()
                        .approval(draft.ownerUserId, approvalId);
                    JSONObject response = new JSONObject();
                    response.put("approvalId", approvalId);
                    response.put("delegationId", draft.delegationId);
                    response.put("currency", draft.currency);
                    response.put("estimateMinor", draft.estimateMinor);
                    response.put("maximumMinor", draft.hold.limitMinor);
                    response.put("deadlineAt", draft.hold.deadlineAt);
                    response.put("executionStarted", false);
                    if ("ISSUED".equals(approval.get("state"))) {
                        response.put("state", "owner_confirmed");
                        return boundedJson(response);
                    }
                    if (!"PROPOSED".equals(approval.get("state")))
                        return a2aBrokerFailure("WALLET_APPROVAL_NOT_ACTIVE");
                    String context = a2aWalletApprovalContext(draft);
                    Intent confirm = new Intent(RockShellService.this, ApprovalActivity.class)
                        .putExtra(RockPlatformService.EXTRA_APPROVAL_ID, approvalId)
                        .putExtra(RockPlatformService.EXTRA_APPROVAL_OWNER, draft.ownerUserId)
                        .putExtra(RockPlatformService.EXTRA_APPROVAL_CONTEXT, context)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(confirm);
                    response.put("state", "awaiting_owner_confirmation");
                    return boundedJson(response);
                } catch (SecurityException denied) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(denied));
                } catch (Exception unavailable) {
                    return a2aBrokerFailure("WALLET_APPROVAL_UNAVAILABLE");
                }
            }
        }
        @Override public String confirmCloudA2AWalletReservation(String draftJson, String approvalId) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                try {
                    if (approvalId == null || !approvalId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
                        return a2aBrokerFailure("WALLET_APPROVAL_ID_INVALID");
                    VerifiedA2ADraft draft = verifyCloudA2ADraft(draftJson);
                    PlatformStore platform = ((RockApplication) getApplication()).platform();
                    Map<String,String> approval = platform.approval(draft.ownerUserId, approvalId);
                    String payloadDigest = PlatformStore.a2aBudgetPayloadDigest(draft.hold);
                    if (!PlatformStore.A2A_WALLET_APPROVAL_COMPONENT.equals(approval.get("component_id")) ||
                            !"wallet.a2a.reserve".equals(approval.get("action")) ||
                            !payloadDigest.equals(approval.get("payload_digest")) ||
                            Long.parseLong(approval.get("max_cost_minor")) != draft.hold.limitMinor ||
                            Long.parseLong(approval.get("expires_at")) > draft.hold.deadlineAt)
                        return a2aBrokerFailure("WALLET_APPROVAL_TERMS_MISMATCH");
                    Map<String,String> existing = platform.findA2AWalletReservation(draft.ownerUserId, draft.delegationId);
                    if (existing != null && "HELD".equals(existing.get("state")) &&
                            approvalId.equals(existing.get("approval_id")) &&
                            payloadDigest.equals(existing.get("payload_digest")) &&
                            Long.parseLong(existing.get("held_minor")) == draft.hold.limitMinor) {
                        JSONObject response = new JSONObject(); response.put("state", "reserved");
                        response.put("delegationId", draft.delegationId); response.put("walletState", "HELD");
                        response.put("currency", draft.currency); response.put("heldMinor", draft.hold.limitMinor);
                        response.put("deadlineAt", draft.hold.deadlineAt); response.put("executionStarted", false);
                        response.put("cloudApprovalRequired", true); return boundedJson(response);
                    }
                    if (!"ISSUED".equals(approval.get("state"))) {
                        JSONObject waiting = new JSONObject(); waiting.put("state", "awaiting_owner_confirmation");
                        waiting.put("approvalId", approvalId); waiting.put("delegationId", draft.delegationId);
                        waiting.put("executionStarted", false); return boundedJson(waiting);
                    }
                    Map<String,String> reservation = platform.reserveA2ABudget(approvalId,
                        PlatformStore.A2A_WALLET_APPROVAL_COMPONENT, payloadDigest, draft.hold,
                        System.currentTimeMillis());
                    JSONObject response = new JSONObject(); response.put("state", "reserved");
                    response.put("delegationId", draft.delegationId);
                    response.put("walletState", reservation.get("state"));
                    response.put("currency", draft.currency);
                    response.put("heldMinor", Long.parseLong(reservation.get("held_minor")));
                    response.put("deadlineAt", draft.hold.deadlineAt);
                    response.put("executionStarted", false);
                    response.put("cloudApprovalRequired", true);
                    return boundedJson(response);
                } catch (SecurityException denied) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(denied));
                } catch (Exception unavailable) {
                    return a2aBrokerFailure("WALLET_RESERVATION_UNAVAILABLE");
                }
            }
        }
        @Override public String releaseCloudA2AWalletReservation(String delegationId) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) { try {
                if (delegationId == null || !delegationId.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
                    return a2aBrokerFailure("WALLET_DELEGATION_ID_INVALID");
                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                String owner = sessions.ownerUserId();
                if (owner == null) return "{\"state\":\"not_linked\"}";
                String authorization = sessions.authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                JSONObject detail = new JSONObject(transport.get(
                    transport.taskDetailPath("agent-status", delegationId), authorization));
                JSONObject remote = detail.optJSONObject("delegation");
                JSONObject proof = detail.optJSONObject("brokerAuthorization");
                String cloudState = remote == null ? "" : remote.optString("state");
                boolean provablyPreDispatch = "awaiting_approval".equals(cloudState) ||
                    "expired".equals(cloudState) || "cancelled_before_dispatch".equals(cloudState);
                if (remote == null || !delegationId.equals(remote.optString("id")) ||
                        !owner.equals(remote.optString("ownerUserId")) || !provablyPreDispatch ||
                        proof == null || !proof.has("registered"))
                    return a2aBrokerFailure("WALLET_CLOUD_STATE_UNVERIFIED");
                if ("awaiting_approval".equals(cloudState) && proof.optBoolean("registered") &&
                        proof.optLong("expiresAt", 0) > System.currentTimeMillis())
                    return a2aBrokerFailure("WALLET_BROKER_PROOF_STILL_VALID");
                Map<String,String> reservation = ((RockApplication) getApplication()).platform()
                    .releaseA2ABudgetBeforeDispatch(owner, delegationId, System.currentTimeMillis());
                JSONObject response = new JSONObject(); response.put("state", "released");
                response.put("delegationId", delegationId); response.put("walletState", reservation.get("state"));
                response.put("executionStarted", false); return boundedJson(response);
            } catch (SecurityException denied) {
                return a2aBrokerFailure(a2aBrokerSafeCode(denied));
            } catch (Exception unavailable) {
                return a2aBrokerFailure("WALLET_RELEASE_UNAVAILABLE");
            }}
        }
        @Override public String registerCloudA2ABrokerAuthorization(String draftJson) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                try {
                    VerifiedA2ADraft draft = verifyCloudA2ADraft(draftJson);
                    long now = System.currentTimeMillis();
                    PlatformStore platform = ((RockApplication) getApplication()).platform();
                    platform.requireHeldQuoteBoundA2ABudget(draft.hold, now);
                    AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                    String authorization = sessions.authorizationHeader();
                    if (authorization == null) return "{\"state\":\"not_linked\"}";
                    AndroidRockstarDeviceHomeTransport transport =
                        new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                    String localDeviceRef = new AndroidA2ABrokerDeviceRefStore(RockShellService.this).getOrCreate();
                    JSONObject detail = new JSONObject(transport.get(
                        transport.taskDetailPath("agent-status", draft.delegationId), authorization));
                    JSONObject remote = detail.optJSONObject("delegation");
                    JSONObject registered = detail.optJSONObject("brokerAuthorization");
                    if (remote == null || !draft.delegationId.equals(remote.optString("id")) ||
                            !draft.ownerUserId.equals(remote.optString("ownerUserId")) ||
                            !"awaiting_approval".equals(remote.optString("state")) ||
                            registered == null || !registered.has("registered"))
                        return a2aBrokerFailure("CLOUD_DRAFT_NOT_AWAITING_APPROVAL");
                    if (registered != null && registered.optBoolean("registered")) {
                        if (registered.optLong("expiresAt", 0) <= now)
                            return a2aBrokerFailure("BROKER_PROOF_EXPIRED_NEW_DELEGATION_REQUIRED");
                        if (!localDeviceRef.equals(registered.optString("deviceRef")))
                            return a2aBrokerFailure("BROKER_PROOF_REGISTERED_ON_OTHER_DEVICE");
                        JSONObject existing = new JSONObject(); existing.put("state", "broker_proof_registered");
                        existing.put("delegationId", draft.delegationId); existing.put("deviceRef", registered.optString("deviceRef"));
                        existing.put("expiresAt", registered.optLong("expiresAt"));
                        existing.put("executionStarted", false); existing.put("cloudApprovalRequired", true);
                        return boundedJson(existing);
                    }
                    A2ABrokerAuthorization.Intent intent = a2aAuthorizationIntent(draft);
                    JSONObject proof = AndroidA2ABrokerEnrollment.authorizeHeldDelegation(
                        RockShellService.this, BuildConfig.ROCKSTAR_SERVICE_ORIGIN, sessions, platform, intent);
                    try {
                        JSONObject uploaded = transport.registerA2ABrokerAuthorization(authorization,
                            draft.delegationId, draft.message, proof);
                        if (!uploaded.optBoolean("accepted") ||
                                uploaded.optLong("expiresAt", 0) != proof.optLong("expiresAt", -1) ||
                                !proof.optString("deviceRef").equals(uploaded.optString("deviceRef")))
                            return a2aBrokerFailure("BROKER_PROOF_UPLOAD_UNCONFIRMED");
                        JSONObject response = new JSONObject(); response.put("state", "broker_proof_registered");
                        response.put("delegationId", draft.delegationId);
                        response.put("deviceRef", proof.optString("deviceRef"));
                        response.put("expiresAt", uploaded.optLong("expiresAt"));
                        response.put("executionStarted", false); response.put("cloudApprovalRequired", true);
                        return boundedJson(response);
                    } catch (java.io.IOException uncertain) {
                        try {
                            JSONObject after = new JSONObject(transport.get(
                                transport.taskDetailPath("agent-status", draft.delegationId), authorization));
                            JSONObject afterProof = after.optJSONObject("brokerAuthorization");
                            if (afterProof != null && afterProof.optBoolean("registered") &&
                                    proof.optString("deviceRef").equals(afterProof.optString("deviceRef")) &&
                                    afterProof.optLong("expiresAt", 0) > System.currentTimeMillis()) {
                                JSONObject recovered = new JSONObject(); recovered.put("state", "broker_proof_registered");
                                recovered.put("delegationId", draft.delegationId);
                                recovered.put("deviceRef", afterProof.optString("deviceRef"));
                                recovered.put("expiresAt", afterProof.optLong("expiresAt"));
                                recovered.put("executionStarted", false); recovered.put("cloudApprovalRequired", true);
                                recovered.put("recoveredByReadback", true); return boundedJson(recovered);
                            }
                        } catch (Exception readbackUnavailable) { /* Preserve the unknown result; never upload again here. */ }
                        return "{\"state\":\"unknown\",\"recoveryRequired\":true,\"executionStarted\":false}";
                    }
                } catch (SecurityException denied) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(denied));
                } catch (Exception unavailable) {
                    return a2aBrokerFailure("BROKER_PROOF_UNAVAILABLE");
                }
            }
        }
        @Override public String approveCloudA2ADelegation(String draftJson) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                VerifiedA2ADraft draft;
                boolean[] approvalRequestAttempted = { false };
                try {
                    draft = verifyCloudA2ADraft(draftJson);
                    long now = System.currentTimeMillis();
                    PlatformStore platform = ((RockApplication) getApplication()).platform();
                    platform.requireHeldQuoteBoundA2ABudget(draft.hold, now);
                    AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                    String authorization = sessions.authorizationHeader();
                    if (authorization == null) return "{\"state\":\"not_linked\"}";
                    String localDeviceRef = new AndroidA2ABrokerDeviceRefStore(RockShellService.this).getOrCreate();
                    AndroidRockstarDeviceHomeTransport transport =
                        new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                    JSONObject detail = readCloudA2ADelegation(transport, authorization, draft.ownerUserId,
                        draft.delegationId);
                    JSONObject proof = detail.optJSONObject("brokerAuthorization");
                    if (proof == null || !proof.optBoolean("registered") ||
                            !localDeviceRef.equals(proof.optString("deviceRef")) ||
                            proof.optLong("expiresAt", 0) <= now)
                        return a2aBrokerFailure("CLOUD_BROKER_PROOF_NOT_ACTIVE");
                    A2ABrokerAuthorization.Intent intent = a2aAuthorizationIntent(draft);
                    String authorizationDigest = A2ABrokerAuthorization.authorizationSha256(intent);
                    try {
                        approvalRequestAttempted[0] = true;
                        JSONObject accepted = transport.approveA2ADelegation(authorization,
                            draft.delegationId, draft.message, authorizationDigest);
                        JSONObject returned = accepted.optJSONObject("delegation");
                        if (returned == null || !draft.delegationId.equals(returned.optString("id")) ||
                                !draft.ownerUserId.equals(returned.optString("ownerUserId")) ||
                                !authorizationDigest.equalsIgnoreCase(returned.optString("authorizationSha256")))
                            return fenceUnknownCloudA2AApproval(platform, draft.ownerUserId, draft.delegationId,
                                "CLOUD_APPROVAL_RESPONSE_MISMATCH");
                    } catch (java.io.IOException uncertain) {
                        // Do not resend. The owner-scoped Cloud state decides whether it was accepted.
                    }
                    return cloudA2AExecutionReadback(transport, authorization, draft.ownerUserId,
                        draft.delegationId, platform, System.currentTimeMillis());
                } catch (SecurityException denied) {
                    if (approvalRequestAttempted[0] && draftJson != null) {
                        try {
                            JSONObject rawDraft = new JSONObject(draftJson);
                            String id = rawDraft.optString("id");
                            String owner = deviceSessionStore().ownerUserId();
                            if (owner != null && validCloudUuid(id))
                                return fenceUnknownCloudA2AApproval(((RockApplication) getApplication()).platform(), owner, id,
                                    "CLOUD_APPROVAL_RESULT_UNKNOWN");
                        } catch (Exception ignored) { }
                    }
                    return a2aBrokerFailure(a2aBrokerSafeCode(denied));
                } catch (Exception uncertain) {
                    if (approvalRequestAttempted[0] && draftJson != null) {
                        try {
                            JSONObject rawDraft = new JSONObject(draftJson);
                            String id = rawDraft.optString("id");
                            String owner = deviceSessionStore().ownerUserId();
                            if (owner != null && validCloudUuid(id))
                                return fenceUnknownCloudA2AApproval(((RockApplication) getApplication()).platform(), owner, id,
                                    "CLOUD_APPROVAL_RESULT_UNKNOWN");
                        } catch (Exception ignored) { }
                    }
                    return a2aBrokerFailure("CLOUD_APPROVAL_UNAVAILABLE");
                }
            }
        }
        @Override public String recoverCloudA2AExecution(String draftJson) {
            enforceShellCaller();
            try {
                if (draftJson == null || draftJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 24_000)
                    return a2aBrokerFailure("DELEGATION_DRAFT_INVALID");
                JSONObject draft = new JSONObject(draftJson);
                String id = draft.optString("id");
                if (!validCloudUuid(id)) return a2aBrokerFailure("DELEGATION_ID_INVALID");
                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                String owner = sessions.ownerUserId(), authorization = sessions.authorizationHeader();
                if (owner == null || authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                PlatformStore platform = ((RockApplication) getApplication()).platform();
                return cloudA2AExecutionReadback(transport, authorization, owner, id, platform,
                    System.currentTimeMillis());
            } catch (SecurityException denied) {
                return a2aBrokerFailure(a2aBrokerSafeCode(denied));
            } catch (Exception unavailable) {
                return a2aBrokerFailure("CLOUD_EXECUTION_READBACK_UNAVAILABLE");
            }
        }
        @Override public String cancelCloudA2ADelegation(String delegationId) {
            enforceShellCaller();
            if (!validCloudUuid(delegationId)) return a2aBrokerFailure("DELEGATION_ID_INVALID");
            try {
                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                String owner = sessions.ownerUserId(), authorization = sessions.authorizationHeader();
                if (owner == null || authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                JSONObject before = readCloudA2ADelegation(transport, authorization, owner, delegationId);
                JSONObject current = before.getJSONObject("delegation");
                String priorState = current.optString("state", "unknown");
                if (terminalA2ACloudState(priorState)) return cancellationReadback(delegationId, current, false);
                JSONObject response;
                try {
                    response = transport.cancelA2ADelegation(authorization, delegationId);
                } catch (java.io.IOException uncertain) {
                    // Resolve a lost response with a single owner-scoped GET; never repeat the PATCH here.
                    JSONObject after = readCloudA2ADelegation(transport, authorization, owner, delegationId);
                    JSONObject latest = after.getJSONObject("delegation");
                    return cancellationReadback(delegationId, latest, true);
                }
                JSONObject returned = response.optJSONObject("delegation");
                if (returned == null || !delegationId.equals(returned.optString("id")) ||
                        !owner.equals(returned.optString("ownerUserId"))) {
                    JSONObject after = readCloudA2ADelegation(transport, authorization, owner, delegationId);
                    return cancellationReadback(delegationId, after.getJSONObject("delegation"), true);
                }
                return cancellationReadback(delegationId, returned, true);
            } catch (Exception uncertain) {
                try {
                    AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                    String owner = sessions.ownerUserId(), authorization = sessions.authorizationHeader();
                    if (owner != null && authorization != null) {
                        AndroidRockstarDeviceHomeTransport transport =
                            new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                        JSONObject after = readCloudA2ADelegation(transport, authorization, owner, delegationId);
                        return cancellationReadback(delegationId, after.getJSONObject("delegation"), true);
                    }
                } catch (Exception readbackUnavailable) { }
                return "{\"state\":\"unknown\",\"recoveryRequired\":true,\"executionStopped\":false}";
            }
        }
        @Override public String prepareCloudLlmQuote(String requestId, String prompt,
                long maximumBudgetMinor, String currency, boolean saveResult) {
            enforceShellCaller();
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                String parentJobId = "device-cloud-llm-" + requestId;
                return transport.prepareCloudLlmQuote(authorization, requestId, parentJobId,
                    prompt, maximumBudgetMinor, currency, saveResult);
            } catch (Exception failure) {
                return "{\"state\":\"unavailable\",\"code\":\"DEVICE_LLM_QUOTE_UNAVAILABLE\"}";
            }
        }
        @Override public String executeCloudLlmQuote(String prompt, String quoteId,
                String approvalDigest, String model, int outputTokenLimit) {
            enforceShellCaller();
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return "{\"state\":\"not_configured\"}";
                String authorization = deviceSessionStore().authorizationHeader();
                if (authorization == null) return "{\"state\":\"not_linked\"}";
                AndroidRockstarDeviceHomeTransport transport =
                    new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                return transport.executeCloudLlmQuote(authorization, prompt, quoteId,
                    approvalDigest, model, outputTokenLimit);
            } catch (Exception failure) {
                return "{\"state\":\"unavailable\",\"code\":\"DEVICE_LLM_EXECUTION_UNAVAILABLE\"}";
            }
        }
        @Override public String enrollA2ABrokerDevice(boolean requireStrongBox) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return a2aBrokerFailure("SERVICE_NOT_CONFIGURED");
                try {
                    return AndroidA2ABrokerEnrollment.enroll(RockShellService.this,
                        BuildConfig.ROCKSTAR_SERVICE_ORIGIN, deviceSessionStore(), requireStrongBox);
                } catch (SecurityException denied) {
                    return a2aBrokerFailure("DEVICE_KEY_POLICY_REJECTED");
                } catch (Exception unavailable) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(unavailable));
                }
            }
        }
        @Override public String revokeA2ABrokerDevice(String keyId) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return a2aBrokerFailure("SERVICE_NOT_CONFIGURED");
                try {
                    return AndroidA2ABrokerEnrollment.revoke(RockShellService.this,
                        BuildConfig.ROCKSTAR_SERVICE_ORIGIN, deviceSessionStore(), keyId);
                } catch (SecurityException denied) {
                    return a2aBrokerFailure("DEVICE_KEY_NOT_ACTIVE");
                } catch (Exception unavailable) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(unavailable));
                }
            }
        }
        @Override public String syncA2AWalletSettlement(String delegationId) {
            enforceShellCaller();
            synchronized (a2aBrokerDeviceLock) {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return a2aBrokerFailure("SERVICE_NOT_CONFIGURED");
                RockApplication application = (RockApplication) getApplication();
                if (!application.a2aProviderUsageTrustConfigurationValid())
                    return a2aBrokerFailure("PROVIDER_USAGE_TRUST_INVALID");
                if (!application.a2aProviderUsageTrustConfigured())
                    return a2aBrokerFailure("PROVIDER_USAGE_TRUST_UNCONFIGURED");
                try {
                    return AndroidA2ABrokerEnrollment.synchronizeWallet(RockShellService.this,
                        BuildConfig.ROCKSTAR_SERVICE_ORIGIN, deviceSessionStore(), delegationId,
                        application.platform());
                } catch (SecurityException denied) {
                    return a2aBrokerFailure("WALLET_HANDOFF_NOT_AUTHORIZED");
                } catch (Exception unavailable) {
                    return a2aBrokerFailure(a2aBrokerSafeCode(unavailable));
                }
            }
        }
    };

    @Override public IBinder onBind(Intent intent) { return binder; }
    @Override public void onDestroy() {
        synchronized (deviceLinkLock) { clearPendingDeviceLink(); }
        super.onDestroy();
    }
    private Engine engine() { return ((RockApplication) getApplication()).engine(); }
    private RecoverableBackupManager backupManager() { return new RecoverableBackupManager(this); }

    private void enforceShellCaller() {
        int uid = Binder.getCallingUid();
        String[] names = getPackageManager().getPackagesForUid(uid);
        if (names == null || names.length != 1 || !SHELL_PACKAGE.equals(names[0]))
            throw new SecurityException("UNTRUSTED_SHELL_UID");
        if (getPackageManager().checkSignatures(getPackageName(), SHELL_PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_SHELL_SIGNER");
        try {
            if (getPackageManager().getPackageInfo(SHELL_PACKAGE, 0).getLongVersionCode() != 1)
                throw new SecurityException("UNAPPROVED_SHELL_VERSION");
        } catch (PackageManager.NameNotFoundException missing) {
            throw new SecurityException("SHELL_NOT_INSTALLED");
        }
    }

    private String snapshotJson() {
        try {
            JSONObject root = new JSONObject(); root.put("apiVersion", 1); root.put("paused", engine().paused());
            JSONObject localInference = localInferenceObservation();
            root.put("deviceCapabilities", DeviceCapabilitySnapshot.read(this)
                .toJson(localInference));
            List<Map<String,String>> workItems = engine().list();
            root.put("totalWorkCount", workItems.size());
            root.put("truncated", workItems.size() > MAX_SNAPSHOT_WORKS);
            JSONArray works = new JSONArray();
            for (int index = 0; index < Math.min(workItems.size(), MAX_SNAPSHOT_WORKS); index++) {
                Map<String,String> work = workItems.get(index);
                JSONObject item = new JSONObject();
                item.put("id", work.get("id")); item.put("state", work.get("state")); item.put("sample", "1".equals(work.get("sample")));
                JSONArray runs = new JSONArray();
                for (Map<String,String> run : engine().runs(work.get("id"))) {
                    JSONObject step = new JSONObject();
                    step.put("tool", run.get("tool")); step.put("state", run.get("state"));
                    step.put("attempt", Integer.parseInt(run.get("attempt")));
                    step.put("error", run.get("error") == null ? JSONObject.NULL : run.get("error"));
                    runs.put(step);
                }
                item.put("runs", runs); works.put(item);
            }
            root.put("works", works); String result = root.toString(); Engine.bounded(result); return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("SNAPSHOT_JSON", invalid);
        }
    }

    private String provisionEsimGatewayKeyResponse(String challengeJson,
            boolean requireStrongBox) {
        byte[] challengeBytes = null;
        try {
            if (challengeJson == null || challengeJson.length() > 20_000)
                throw new IllegalArgumentException("CHALLENGE_INVALID");
            JSONObject challenge = new JSONObject(challengeJson);
            if (!"challenge_issued".equals(challenge.optString("state")))
                throw new IllegalArgumentException("CHALLENGE_INVALID");
            String nonce = challenge.optString("challengeNonce");
            long expiresAt = challenge.optLong("expiresAt", -1);
            JSONObject receiptContext = challenge.optJSONObject("receiptContext");
            if (receiptContext == null) throw new IllegalArgumentException("CHALLENGE_INVALID");
            challengeBytes = EsimGatewayEnrollmentChallenge.validateAndDecodeNonce(
                challenge.optString("challengeId"), nonce, expiresAt,
                receiptContext.optString("attestedGatewayAuthorityId"),
                receiptContext.optString("attestedGatewayKeyId"),
                receiptContext.optString("attestedApplicationPackage"),
                System.currentTimeMillis());

            EsimDeviceGatewayKeyStore key = EsimDeviceGatewayKeyStore.provision(
                this, challengeBytes, requireStrongBox);
            JSONObject result = new JSONObject();
            result.put("state", "attestation_key_ready");
            result.put("challengeId", challenge.optString("challengeId"));
            result.put("challengeNonce", nonce);
            result.put("authorityId", key.authorityId());
            result.put("keyId", key.keyId());
            result.put("publicKeyBase64Url", Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(key.rawPublicKey()));
            result.put("hardwareBacked", key.hardwareBacked());
            result.put("strongBoxBacked", key.strongBoxBacked());
            result.put("resumed", key.resumedFromExistingAlias());
            JSONArray chain = new JSONArray();
            int chainBytes = 0;
            for (String certificate : key.attestationChainDerBase64Url()) {
                chainBytes += certificate.length();
                if (chainBytes > 24_000) return esimGatewayFailure("ATTESTATION_CHAIN_TOO_LARGE");
                chain.put(certificate);
            }
            result.put("certificateChainDerBase64Url", chain);
            result.put("activationState", "pending_server_and_install_proof_verification");
            return boundedJson(result);
        } catch (SecurityException denied) {
            return esimGatewayFailure("KEY_POLICY_REJECTED");
        } catch (Exception invalidOrUnavailable) {
            String message = invalidOrUnavailable.getMessage();
            if ("ESIM_ENROLLMENT_CHALLENGE_EXPIRED_OR_INVALID".equals(message))
                return esimGatewayFailure("CHALLENGE_EXPIRED_OR_INVALID");
            if ("ESIM_ENROLLMENT_AUTHORITY_INVALID".equals(message))
                return esimGatewayFailure("CHALLENGE_AUTHORITY_INVALID");
            if ("ESIM_ENROLLMENT_NONCE_INVALID".equals(message) ||
                    "ESIM_ENROLLMENT_CHALLENGE_ID_INVALID".equals(message))
                return esimGatewayFailure("CHALLENGE_INVALID");
            if (invalidOrUnavailable instanceof IllegalArgumentException)
                return esimGatewayFailure("CHALLENGE_INVALID");
            return esimGatewayFailure("ATTESTATION_KEY_UNAVAILABLE");
        } finally {
            if (challengeBytes != null) Arrays.fill(challengeBytes, (byte) 0);
        }
    }

    private static String esimGatewayFailure(String code) {
        JSONObject response = new JSONObject();
        try { response.put("state", "blocked"); response.put("error", code); }
        catch (JSONException impossible) { return "{\"state\":\"blocked\",\"error\":\"ATTESTATION_KEY_UNAVAILABLE\"}"; }
        return boundedJson(response);
    }

    private JSONObject localInferenceObservation() throws JSONException {
        try { return new LocalAiConnection(this).statusEvidence(); }
        catch (Exception unavailable) {
            return new JSONObject().put("state", "unknown").put("modelLoaded", JSONObject.NULL)
                .put("runtime", JSONObject.NULL).put("apiVersion", 0)
                .put("trustBasis", "unavailable").put("modelProfileIdentity", "not_reported");
        }
    }

    private static void validWorkId(String value) {
        if (value == null || !value.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("INVALID_WORK_ID");
    }

    private static String zemaResponse(String status, String code, String workId) {
        try {
            JSONObject response = new JSONObject();
            response.put("status", status);
            response.put("code", code == null ? JSONObject.NULL : code);
            response.put("workId", workId == null ? JSONObject.NULL : workId);
            String result = response.toString();
            Engine.bounded(result);
            return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("ZEMA_RESPONSE_JSON", invalid);
        }
    }

    private static String skySelectionResponse(Engine.SkySelection selection) {
        try {
            JSONObject response = new JSONObject();
            response.put("status", selection == null ? "none" : "selected");
            response.put("selectionToken", selection == null ? JSONObject.NULL : selection.token);
            response.put("toolId", selection == null ? JSONObject.NULL : selection.toolId);
            response.put("revision", selection == null ? JSONObject.NULL : selection.revision);
            String result = response.toString(); Engine.bounded(result); return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("SKY_SELECTION_JSON", invalid);
        }
    }

    private String recoveryStatusResponse() {
        synchronized (recoveryLock) {
            try {
                RecoverableBackupManager manager = backupManager();
                JSONObject response = new JSONObject(); response.put("status", "ok");
                response.put("configured", manager.recoverySecrets().isConfigured());
                response.put("recoverySecretHardwareBacked",
                    manager.recoverySecrets().isHardwareBacked());
                response.put("deviceWrapHardwareBacked", manager.deviceKeyHardwareBacked());
                response.put("format", PlatformApi.RECOVERABLE_BACKUP_FORMAT);
                response.put("walletSeed", false);
                return boundedJson(response);
            } catch (Exception failure) { return recoveryFailure("RECOVERY_STATUS_FAILED"); }
        }
    }

    private AndroidRockstarDeviceSessionStore deviceSessionStore() {
        return new AndroidRockstarDeviceSessionStore(this, BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
    }

    private String beginRockstarDeviceLinkResponse() {
        synchronized (deviceLinkLock) {
            try {
                if (BuildConfig.ROCKSTAR_SERVICE_ORIGIN == null || BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty())
                    return deviceLinkNotConfigured();
                AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
                long linkedExpiry = sessions.activeExpiry();
                if (linkedExpiry > 0) return linkedDeviceLinkStatus(linkedExpiry);
                if (pendingDeviceAuthorization != null && pendingDeviceAuthorization.expiresAt > System.currentTimeMillis())
                    return pendingDeviceLinkStatus();
                clearPendingDeviceLink();
                AndroidRockstarDeviceAuthorizationTransport transport =
                    new AndroidRockstarDeviceAuthorizationTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
                deviceAuthorizationFlow = new RockstarDeviceAuthorizationFlow(transport, sessions);
                String model = Build.MODEL == null ? "Android device" : Build.MODEL.trim();
                if (model.isEmpty()) model = "Android device";
                String deviceName = "RockstarOS " + model;
                if (deviceName.length() > 64) deviceName = deviceName.substring(0, 64);
                pendingDeviceAuthorization = deviceAuthorizationFlow.begin(deviceName, System.currentTimeMillis());
                pendingDeviceLinkId = UUID.randomUUID().toString();
                pendingDeviceLinkIntervalSeconds = pendingDeviceAuthorization.intervalSeconds;
                pendingDeviceLinkNextPollAt = System.currentTimeMillis();
                return pendingDeviceLinkStatus();
            } catch (IllegalArgumentException invalidConfig) {
                clearPendingDeviceLink();
                return deviceLinkFailure("SERVICE_ORIGIN_INVALID");
            } catch (Exception failure) {
                clearPendingDeviceLink();
                return deviceLinkFailure("DEVICE_LINK_START_FAILED");
            }
        }
    }

    private String pollRockstarDeviceLinkResponse(String flowId) {
        synchronized (deviceLinkLock) {
            try {
                if (flowId == null || pendingDeviceAuthorization == null || pendingDeviceLinkId == null ||
                    !MessageDigestSafe.equals(flowId, pendingDeviceLinkId))
                    return deviceLinkFailure("DEVICE_LINK_NOT_PENDING");
                RockstarDeviceAuthorizationFlow.PollResult result = deviceAuthorizationFlow.poll(
                    pendingDeviceAuthorization, System.currentTimeMillis());
                pendingDeviceLinkNextPollAt = result.nextPollAt;
                pendingDeviceLinkIntervalSeconds = result.intervalSeconds;
                if (result.state == RockstarDeviceAuthorizationFlow.PollState.AUTHORIZED) {
                    long expiry = deviceSessionStore().activeExpiry();
                    clearPendingDeviceLink();
                    return linkedDeviceLinkStatus(expiry);
                }
                if (result.state == RockstarDeviceAuthorizationFlow.PollState.DENIED ||
                    result.state == RockstarDeviceAuthorizationFlow.PollState.EXPIRED) {
                    String state = result.state == RockstarDeviceAuthorizationFlow.PollState.DENIED ? "denied" : "expired";
                    clearPendingDeviceLink();
                    JSONObject response = new JSONObject(); response.put("state", state);
                    return boundedJson(response);
                }
                return pendingDeviceLinkStatus(result.state.name().toLowerCase(java.util.Locale.ROOT));
            } catch (Exception failure) {
                return deviceLinkFailure("DEVICE_LINK_CHECK_FAILED");
            }
        }
    }

    private String rockstarDeviceLinkStatusResponse() {
        synchronized (deviceLinkLock) {
            try {
                boolean configured = BuildConfig.ROCKSTAR_SERVICE_ORIGIN != null &&
                    !BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty();
                JSONObject response = new JSONObject(); response.put("configured", configured);
                if (!configured) { response.put("state", "not_configured"); return boundedJson(response); }
                long expiry = deviceSessionStore().activeExpiry();
                if (expiry > System.currentTimeMillis()) {
                    response.put("state", "linked"); response.put("expiresAt", expiry);
                    return boundedJson(response);
                }
                if (pendingDeviceAuthorization != null && pendingDeviceAuthorization.expiresAt > System.currentTimeMillis())
                    return pendingDeviceLinkStatus();
                clearPendingDeviceLink(); response.put("state", "not_linked");
                return boundedJson(response);
            } catch (Exception failure) { return deviceLinkFailure("DEVICE_LINK_STATUS_FAILED"); }
        }
    }

    private String pendingDeviceLinkStatus() {
        return pendingDeviceLinkStatus("authorization_pending");
    }

    private String pendingDeviceLinkStatus(String state) {
        try {
            JSONObject response = new JSONObject(); response.put("configured", true); response.put("state", state);
            response.put("flowId", pendingDeviceLinkId);
            response.put("userCode", pendingDeviceAuthorization.userCode);
            response.put("verificationUri", pendingDeviceAuthorization.verificationUri);
            response.put("verificationUriComplete", pendingDeviceAuthorization.verificationUriComplete);
            response.put("expiresAt", pendingDeviceAuthorization.expiresAt);
            response.put("intervalSeconds", pendingDeviceLinkIntervalSeconds);
            response.put("nextPollAt", pendingDeviceLinkNextPollAt);
            return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String linkedDeviceLinkStatus(long expiry) {
        try {
            JSONObject response = new JSONObject(); response.put("configured", true);
            response.put("state", "linked"); response.put("expiresAt", expiry);
            return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private void clearPendingDeviceLink() {
        pendingDeviceAuthorization = null; pendingDeviceLinkId = null;
        pendingDeviceLinkNextPollAt = 0; pendingDeviceLinkIntervalSeconds = 0;
        deviceAuthorizationFlow = null;
    }

    private static String deviceLinkFailure(String code) {
        try {
            JSONObject response = new JSONObject();
            response.put("configured", BuildConfig.ROCKSTAR_SERVICE_ORIGIN != null &&
                !BuildConfig.ROCKSTAR_SERVICE_ORIGIN.isEmpty());
            response.put("state", "blocked"); response.put("code", code);
            return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String deviceLinkNotConfigured() {
        try {
            JSONObject response = new JSONObject(); response.put("configured", false);
            response.put("state", "not_configured"); return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private String beginRecoverySetupResponse() {
        synchronized (recoveryLock) {
            clearPendingRecovery();
            try {
                SecureRandom random = new SecureRandom();
                byte[] secret = EncryptedBackup.generateRecoverySecret(random);
                String phrase = RecoveryPhrase.encode(secret);
                Set<Integer> chosen = new LinkedHashSet<>();
                while (chosen.size() < 4) chosen.add(random.nextInt(RecoveryPhrase.WORD_COUNT));
                int[] challenge = chosen.stream().mapToInt(Integer::intValue).sorted().toArray();
                String token = UUID.randomUUID().toString();
                pendingRecovery = new PendingRecoverySetup(token, secret, challenge,
                    android.os.SystemClock.elapsedRealtime() + RECOVERY_SETUP_MS);
                new android.os.Handler(getMainLooper()).postDelayed(() -> {
                    synchronized (recoveryLock) {
                        if (pendingRecovery != null &&
                            MessageDigestSafe.equals(token, pendingRecovery.token)) {
                            clearPendingRecovery();
                        }
                    }
                }, RECOVERY_SETUP_MS);
                JSONArray requested = new JSONArray();
                for (int index : challenge) requested.put(index + 1);
                JSONObject response = new JSONObject(); response.put("status", "confirmation_required");
                response.put("setupToken", token); response.put("phrase", phrase);
                response.put("confirmWordNumbers", requested); response.put("walletSeed", false);
                response.put("expiresInSeconds", RECOVERY_SETUP_MS / 1000);
                return boundedJson(response);
            } catch (Exception failure) {
                clearPendingRecovery();
                return recoveryFailure("RECOVERY_SETUP_FAILED");
            }
        }
    }

    private String confirmRecoverySetupResponse(String token, String confirmationsJson) {
        synchronized (recoveryLock) {
            try {
                if (pendingRecovery == null || token == null ||
                    !MessageDigestSafe.equals(token, pendingRecovery.token) ||
                    android.os.SystemClock.elapsedRealtime() >= pendingRecovery.expiresAtElapsed) {
                    clearPendingRecovery();
                    return recoveryFailure("RECOVERY_SETUP_EXPIRED");
                }
                JSONArray confirmations = new JSONArray(confirmationsJson);
                if (confirmations.length() != pendingRecovery.challenge.length) {
                    return recoveryFailure("RECOVERY_CONFIRMATION_MISMATCH");
                }
                String phrase = RecoveryPhrase.encode(pendingRecovery.secret);
                for (int index = 0; index < pendingRecovery.challenge.length; index++) {
                    String expected = RecoveryPhrase.wordAt(phrase, pendingRecovery.challenge[index]);
                    String actual = confirmations.optString(index, "").trim().toLowerCase(java.util.Locale.ROOT);
                    if (!MessageDigestSafe.equals(expected, actual)) {
                        return recoveryFailure("RECOVERY_CONFIRMATION_MISMATCH");
                    }
                }
                RecoverableBackupManager manager = backupManager();
                manager.recoverySecrets().bind(pendingRecovery.secret,
                    AndroidOwner.current(RockShellService.this));
                boolean hardware = manager.recoverySecrets().isHardwareBacked();
                clearPendingRecovery();
                JSONObject response = new JSONObject(); response.put("status", "configured");
                response.put("recoverySecretHardwareBacked", hardware);
                response.put("walletSeed", false);
                return boundedJson(response);
            } catch (Exception failure) {
                return recoveryFailure("RECOVERY_SETUP_FAILED");
            }
        }
    }

    private void clearPendingRecovery() {
        if (pendingRecovery != null) {
            Arrays.fill(pendingRecovery.secret, (byte) 0);
            pendingRecovery = null;
        }
    }

    private static String verifyA2AQuote(JSONObject quote, String origin, String name,
            String version, String message, String currency, long maximumBudgetMinor) throws Exception {
        A2AUsageReceiptVerifier verifier = AndroidA2AUsageTrustConfig.verifier(
            BuildConfig.A2A_PROVIDER_USAGE_KEYS_JSON);
        return verifier.verifyPriceQuote(AndroidA2AJson.object(quote),
            new A2AUsageReceiptVerifier.PriceQuoteIntent(origin, name, version,
                Engine.digest(message), currency, maximumBudgetMinor), System.currentTimeMillis());
    }

    private VerifiedA2ADraft verifyCloudA2ADraft(String draftJson) throws Exception {
        if (draftJson == null || draftJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 24_000)
            throw new IllegalArgumentException("DELEGATION_DRAFT_INVALID");
        JSONObject input = new JSONObject(draftJson);
        Set<String> fields = new java.util.HashSet<>(); input.keys().forEachRemaining(fields::add);
        if (!fields.equals(Set.of("id", "parentJobId", "idempotencyKey", "messageId", "agentId",
                "message", "budgetCurrency", "budgetLimitMinor", "parentBudgetLimitMinor", "deadlineAt", "priceQuote")))
            throw new IllegalArgumentException("DELEGATION_DRAFT_FIELDS_INVALID");
        String id = input.getString("id"), parentJobId = input.getString("parentJobId");
        String messageId = input.getString("messageId"), idempotencyKey = input.getString("idempotencyKey");
        String agentId = input.getString("agentId"), message = input.getString("message");
        String currency = input.getString("budgetCurrency");
        long cap = input.getLong("budgetLimitMinor"), parentCap = input.getLong("parentBudgetLimitMinor");
        long deadlineAt = input.getLong("deadlineAt"); JSONObject quote = input.getJSONObject("priceQuote");
        if (!validCloudUuid(id) || !validCloudUuid(parentJobId) || !validCloudUuid(messageId) ||
                !validCloudUuid(agentId) || !idempotencyKey.matches("[A-Za-z0-9._:-]{1,128}") ||
                message.trim().isEmpty() || message.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8_000 ||
                !currency.matches("[A-Z]{3}") || cap < 1 || parentCap < cap ||
                deadlineAt <= System.currentTimeMillis() || deadlineAt > quote.optLong("expiresAt", 0) ||
                cap != quote.optLong("maxAmountMinor", -1))
            throw new IllegalArgumentException("DELEGATION_DRAFT_TERMS_INVALID");
        AndroidRockstarDeviceSessionStore sessions = deviceSessionStore();
        String authorization = sessions.authorizationHeader(), owner = sessions.ownerUserId();
        if (authorization == null || owner == null) throw new SecurityException("DEVICE_SESSION_REQUIRED");
        AndroidRockstarDeviceHomeTransport transport =
            new AndroidRockstarDeviceHomeTransport(BuildConfig.ROCKSTAR_SERVICE_ORIGIN);
        JSONObject directory = new JSONObject(transport.get(transport.a2aAgentsPath(), authorization));
        JSONArray agents = directory.optJSONArray("agents"); JSONObject selected = null;
        if (agents != null) for (int i = 0; i < agents.length(); i++) {
            JSONObject candidate = agents.optJSONObject(i);
            if (candidate != null && agentId.equals(candidate.optString("id"))) { selected = candidate; break; }
        }
        if (selected == null) throw new SecurityException("AGENT_NOT_CONNECTED");
        String origin = selected.optString("origin", ""), name = selected.optString("agentName", "");
        String version = selected.optString("agentVersion", "");
        String quoteDigest = verifyA2AQuote(quote, origin, name, version, message, currency, cap);
        A2ABrokerAuthorization.Intent intent = new A2ABrokerAuthorization.Intent(owner, id, parentJobId,
            messageId, origin, name, version, "1.0", currency, quote.getString("pricingVersion"),
            cap, parentCap, true, deadlineAt, message, quoteDigest);
        JSONObject cloudRoot = new JSONObject(transport.get(transport.taskDetailPath("agent-status", id), authorization));
        JSONObject remote = cloudRoot.optJSONObject("delegation");
        if (remote == null || !owner.equals(remote.optString("ownerUserId")) ||
                !id.equals(remote.optString("id")) || !parentJobId.equals(remote.optString("parentJobId")) ||
                !idempotencyKey.equals(remote.optString("idempotencyKey")) || !messageId.equals(remote.optString("messageId")) ||
                !intent.requestSha256.equalsIgnoreCase(remote.optString("inputSha256")) ||
                !A2ABrokerAuthorization.authorizationSha256(intent).equalsIgnoreCase(remote.optString("authorizationSha256")) ||
                !quoteDigest.equalsIgnoreCase(remote.optString("priceQuoteDigest")) ||
                !origin.equals(remote.optString("targetOrigin")) || !name.equals(remote.optString("targetAgentName")) ||
                !version.equals(remote.optString("targetAgentVersion")) || !"1.0".equals(remote.optString("protocolVersion")) ||
                !currency.equals(remote.optString("budgetCurrency")) || remote.optLong("budgetLimitMinor", -1) != cap ||
                remote.optLong("parentBudgetLimitMinor", -1) != parentCap ||
                remote.optLong("deadlineAt", -1) != deadlineAt || !remote.optBoolean("continueWhileDeviceOffline") ||
                !"awaiting_approval".equals(remote.optString("state")))
            throw new SecurityException("CLOUD_DRAFT_TERMS_MISMATCH");
        JSONObject remoteQuote = remote.optJSONObject("priceQuote");
        if (remoteQuote == null || !quoteDigest.equalsIgnoreCase(
                verifyA2AQuote(remoteQuote, origin, name, version, message, currency, cap)))
            throw new SecurityException("CLOUD_PRICE_QUOTE_MISMATCH");
        A2AUsageReceiptVerifier.Hold hold = new A2AUsageReceiptVerifier.Hold(owner, parentJobId,
            id, id, origin, name, version, currency, quote.getString("pricingVersion"),
            intent.requestSha256, quoteDigest, cap, parentCap, quote.getLong("issuedAt"), deadlineAt);
        return new VerifiedA2ADraft(owner, id, remote.optString("messageId"), message, name, origin, version, currency,
            quote.optLong("estimateMinor", -1), parentCap, quoteDigest, hold);
    }

    private static String a2aWalletApprovalContext(VerifiedA2ADraft draft) {
        return "A2A 有料実行の前段階 — 端末内Wallet上限の予約\n" +
            "Agent: " + draft.agentName + " v" + draft.agentVersion + "\n" + draft.agentOrigin +
            "\n\n依頼内容（この内容のhashを見積・予約へ固定）:\n" + draft.message +
            "\n\n署名済み見積額: " + formatMinorAmount(draft.estimateMinor, draft.currency) +
            "\n予約する最大額: " + formatMinorAmount(draft.hold.limitMinor, draft.currency) +
            "\n親job上限: " + formatMinorAmount(draft.parentBudgetLimitMinor, draft.currency) +
            "\n価格版: " + draft.hold.pricingVersion + "\n見積hash: " + draft.quoteDigest +
            "\n期限: " + draft.hold.deadlineAt +
            "\n\nこれは端末内Walletに上限を予約する承認です。Cloud Agentへの実行指示や請求はまだ行いません。";
    }

    private static String formatMinorAmount(long amountMinor, String currencyCode) {
        if (amountMinor < 0) return "確認できません";
        int digits;
        try { digits = java.util.Currency.getInstance(currencyCode).getDefaultFractionDigits(); }
        catch (IllegalArgumentException invalid) { return currencyCode + " " + amountMinor + " minor units"; }
        if (digits < 0 || digits > 6) return currencyCode + " " + amountMinor + " minor units";
        return currencyCode + " " + java.math.BigDecimal.valueOf(amountMinor).movePointLeft(digits)
            .setScale(digits, java.math.RoundingMode.UNNECESSARY).toPlainString();
    }

    private static A2ABrokerAuthorization.Intent a2aAuthorizationIntent(VerifiedA2ADraft draft) {
        return new A2ABrokerAuthorization.Intent(draft.ownerUserId, draft.delegationId,
            draft.hold.parentJobId, draft.messageId, draft.agentOrigin, draft.agentName,
            draft.agentVersion, "1.0", draft.currency, draft.hold.pricingVersion,
            draft.hold.limitMinor, draft.parentBudgetLimitMinor, true,
            draft.hold.deadlineAt, draft.message, draft.quoteDigest);
    }

    private static JSONObject readCloudA2ADelegation(AndroidRockstarDeviceHomeTransport transport,
            String authorization, String owner, String id) throws Exception {
        JSONObject detail = new JSONObject(transport.get(
            transport.taskDetailPath("agent-status", id), authorization));
        JSONObject delegation = detail.optJSONObject("delegation");
        if (delegation == null || !id.equals(delegation.optString("id")) ||
                !owner.equals(delegation.optString("ownerUserId")))
            throw new SecurityException("A2A_CLOUD_STATE_NOT_OWNER_VERIFIED");
        return detail;
    }

    private String cloudA2AExecutionReadback(AndroidRockstarDeviceHomeTransport transport,
            String authorization, String owner, String id, PlatformStore platform, long now) throws Exception {
        JSONObject detail = readCloudA2ADelegation(transport, authorization, owner, id);
        JSONObject delegation = detail.getJSONObject("delegation");
        String cloudState = delegation.optString("state", "unknown");
        JSONObject response = new JSONObject();
        response.put("delegationId", id);
        response.put("cloudState", cloudState);
        Map<String,String> local = platform.findA2AWalletReservation(owner, id);
        JSONObject quote = delegation.optJSONObject("priceQuote");
        if (!A2ARecoveryBinding.matches(cloudA2ARecoveryTerms(delegation, quote), local)) {
            response.put("state", "unknown");
            response.put("walletState", local == null ? "NOT_FOUND" : local.get("state"));
            response.put("recoveryRequired", true);
            if ("awaiting_approval".equals(cloudState) || "expired".equals(cloudState) ||
                    "cancelled_before_dispatch".equals(cloudState)) response.put("executionStarted", false);
            return boundedJson(response);
        }
        if ("awaiting_approval".equals(cloudState)) {
            response.put("state", "awaiting_cloud_approval");
            response.put("executionStarted", false);
            response.put("walletState", local.get("state"));
            return boundedJson(response);
        }
        if ("expired".equals(cloudState) || "cancelled_before_dispatch".equals(cloudState)) {
            response.put("state", "cloud_not_dispatched");
            response.put("executionStarted", false);
            response.put("walletState", local.get("state"));
            return boundedJson(response);
        }
        try {
            Map<String,String> reservation = platform.reconcileA2ABudgetDispatched(owner, id, cloudState, now);
            response.put("state", "cloud_accepted");
            response.put("walletState", reservation.get("state"));
            response.put("executionStarted", !"prepared".equals(cloudState));
            response.put("recoveredByReadback", true);
            return boundedJson(response);
        } catch (SecurityException | IllegalStateException unknownState) {
            return fenceUnknownCloudA2AApproval(platform, owner, id, "CLOUD_STATE_REQUIRES_RECOVERY");
        }
    }

    private static Map<String,String> cloudA2ARecoveryTerms(JSONObject delegation, JSONObject quote) {
        if (delegation == null || quote == null) return null;
        String owner = delegation.optString("ownerUserId"), id = delegation.optString("id");
        String parentJobId = delegation.optString("parentJobId"), origin = delegation.optString("targetOrigin");
        String agentName = delegation.optString("targetAgentName"), agentVersion = delegation.optString("targetAgentVersion");
        String currency = delegation.optString("budgetCurrency"), pricingVersion = quote.optString("pricingVersion");
        String inputSha256 = delegation.optString("inputSha256"), quoteDigest = delegation.optString("priceQuoteDigest");
        long cap = delegation.optLong("budgetLimitMinor", -1), parentCap = delegation.optLong("parentBudgetLimitMinor", -1);
        long issuedAt = quote.optLong("issuedAt", -1), deadlineAt = delegation.optLong("deadlineAt", -1);
        final String walletApprovalDigest;
        try {
            A2AUsageReceiptVerifier.Hold hold = new A2AUsageReceiptVerifier.Hold(owner, parentJobId, id, id,
                origin, agentName, agentVersion, currency, pricingVersion, inputSha256, quoteDigest,
                cap, parentCap, issuedAt, deadlineAt);
            walletApprovalDigest = PlatformStore.a2aBudgetPayloadDigest(hold);
        } catch (RuntimeException malformedCloudTerms) { return null; }
        Map<String,String> cloud = new HashMap<>();
        cloud.put("owner", owner);
        cloud.put("delegationId", id);
        cloud.put("parentJobId", parentJobId);
        cloud.put("agentOrigin", origin);
        cloud.put("agentName", agentName);
        cloud.put("agentVersion", agentVersion);
        cloud.put("currency", currency);
        cloud.put("pricingVersion", pricingVersion);
        cloud.put("walletApprovalDigest", walletApprovalDigest);
        cloud.put("budgetLimitMinor", Long.toString(cap));
        cloud.put("deadlineAt", Long.toString(deadlineAt));
        cloud.put("quoteIssuedAt", Long.toString(issuedAt));
        return cloud;
    }

    private static boolean terminalA2ACloudState(String state) {
        return Set.of("cancelled_before_dispatch", "expired", "remote_cancelled",
            "remote_completed", "remote_failed", "remote_rejected").contains(state);
    }

    private static String cancellationReadback(String id, JSONObject delegation, boolean requestAttempted) {
        try {
            String cloudState = delegation.optString("state", "unknown");
            String result;
            boolean stopped;
            if ("cancelled_before_dispatch".equals(cloudState) || "remote_cancelled".equals(cloudState)) {
                result = "stop_confirmed"; stopped = true;
            } else if (Set.of("cancel_requested", "cancel_submitting").contains(cloudState)) {
                result = "cancellation_requested"; stopped = false;
            } else if ("cancel_unconfirmed".equals(cloudState)) {
                result = "cancellation_unconfirmed"; stopped = false;
            } else if (Set.of("remote_completed", "remote_failed", "remote_rejected", "expired").contains(cloudState)) {
                result = "already_terminal"; stopped = false;
            } else {
                result = requestAttempted ? "cancel_not_accepted" : "active"; stopped = false;
            }
            JSONObject response = new JSONObject(); response.put("state", result);
            response.put("delegationId", id); response.put("cloudState", cloudState);
            response.put("executionStopped", stopped);
            response.put("cancelRequestAttempted", requestAttempted);
            response.put("recoveryRequired", "cancel_unconfirmed".equals(cloudState));
            return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String fenceUnknownCloudA2AApproval(PlatformStore platform, String owner,
            String id, String code) {
        try {
            Map<String,String> reservation = platform.fenceA2ABudgetForUnknownDispatch(
                owner, id, System.currentTimeMillis());
            JSONObject response = new JSONObject();
            response.put("state", "unknown");
            response.put("error", code);
            response.put("delegationId", id);
            response.put("walletState", reservation.get("state"));
            response.put("recoveryRequired", true);
            response.put("executionStatus", "unknown");
            return boundedJson(response);
        } catch (Exception unavailable) {
            return a2aBrokerFailure(code);
        }
    }

    private static boolean validCloudUuid(String value) {
        return value != null && value.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    private static final class VerifiedA2ADraft {
        final String ownerUserId, delegationId, messageId, message, agentName, agentOrigin, agentVersion, currency, quoteDigest;
        final long estimateMinor, parentBudgetLimitMinor;
        final A2AUsageReceiptVerifier.Hold hold;
        VerifiedA2ADraft(String ownerUserId, String delegationId, String messageId, String message, String agentName,
            String agentOrigin, String agentVersion, String currency, long estimateMinor,
            long parentBudgetLimitMinor, String quoteDigest, A2AUsageReceiptVerifier.Hold hold) {
            this.ownerUserId = ownerUserId; this.delegationId = delegationId; this.messageId = messageId; this.message = message;
            this.agentName = agentName; this.agentOrigin = agentOrigin; this.agentVersion = agentVersion;
            this.currency = currency; this.estimateMinor = estimateMinor;
            this.parentBudgetLimitMinor = parentBudgetLimitMinor; this.quoteDigest = quoteDigest; this.hold = hold;
        }
    }

    private static String recoveryFailure(String code) {
        try {
            JSONObject response = new JSONObject(); response.put("status", "blocked");
            response.put("code", code); return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String a2aBrokerFailure(String code) {
        try {
            JSONObject response = new JSONObject(); response.put("state", "blocked");
            response.put("error", code); return boundedJson(response);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
    }

    private static String a2aBrokerSafeCode(Exception failure) {
        String message = failure.getMessage();
        if (message != null && message.matches("A2A_(?:BROKER|WALLET)_[A-Z0-9_]+"))
            return message;
        return "BROKER_OPERATION_UNAVAILABLE";
    }

    private static String boundedJson(JSONObject value) {
        String result = value.toString(); Engine.bounded(result); return result;
    }

    private static final class PendingRecoverySetup {
        final String token; final byte[] secret; final int[] challenge;
        final long expiresAtElapsed;
        PendingRecoverySetup(String token, byte[] secret, int[] challenge, long expiresAtElapsed) {
            this.token = token; this.secret = secret; this.challenge = challenge;
            this.expiresAtElapsed = expiresAtElapsed;
        }
    }

    /** Avoids data-dependent early exit for setup token and recovery word comparisons. */
    private static final class MessageDigestSafe {
        static boolean equals(String left, String right) {
            if (left == null || right == null) return false;
            return java.security.MessageDigest.isEqual(
                left.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                right.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }
}
