package dev.rock.shellapi;

import android.os.ParcelFileDescriptor;

/** Private UI-to-broker API. Payload content never crosses this API except explicit owner input/output. */
interface IShellApi {
    const int API_VERSION = 25;

    int getApiVersion() = 0;
    String snapshot() = 1;
    String submit(String requestId, String inputJson, boolean sample, boolean consent) = 2;
    void setPaused(boolean paused) = 3;
    String result(String workId) = 4;
    void complete(String workId, String reviewNote) = 5;
    void retry(String workId) = 6;
    void cancel(String workId) = 7;
    String localAiStatus() = 8;
    String submitZema(String requestId, String selectionToken, String prompt, String contextJson, boolean consent) = 9;
    String skySelection() = 10;
    String selectSkyTool(String toolId) = 11;
    String recoveryStatus() = 12;
    String beginRecoverySetup() = 13;
    String confirmRecoverySetup(String setupToken, String confirmationsJson) = 14;
    String createRecoverableBackup(String requestId, in ParcelFileDescriptor destination) = 15;
    String restoreRecoverableBackup(in ParcelFileDescriptor source, String recoveryPhrase) = 16;
    /** Provision or resume a nonce-bound AndroidKeyStore key from a server-issued challenge. */
    String provisionEsimGatewayKey(String challengeJson, boolean requireStrongBox) = 17;
    /** Start or resume the browser-approved Rockstar account link; never returns a bearer token. */
    String beginRockstarDeviceLink() = 18;
    /** Poll the in-memory, one-time authorization using its opaque flow handle. */
    String pollRockstarDeviceLink(String flowId) = 19;
    /** Return linked/pending state and non-secret approval instructions. */
    String rockstarDeviceLinkStatus() = 20;
    /** Fetches the authenticated read-only cloud service home; session material never leaves Broker. */
    String cloudServiceHome() = 21;
    /** Fetches only an owner-selected LLM detail or A2A status/result by validated type and ID. */
    String cloudTaskDetail(String kind, String taskId) = 22;
    /** Creates a persisted estimate-only cloud LLM quote; never submits to an LLM provider. */
    String prepareCloudLlmQuote(String requestId, String prompt, long maximumBudgetMinor, String currency, boolean saveResult) = 23;
    /** Reserves the displayed quote cap, then submits the exact same prompt for paid execution. */
    String executeCloudLlmQuote(String prompt, String quoteId, String approvalDigest, String model, int outputTokenLimit) = 24;
    /** Enroll the Broker P-256 Keystore key with the linked owner's attested server challenge. */
    String enrollA2ABrokerDevice(boolean requireStrongBox) = 25;
    /** Revoke the selected active server key before deleting its local Keystore alias. */
    String revokeA2ABrokerDevice(String keyId) = 26;
    /** Reconcile one existing local A2A Wallet reservation from its signed Cloud handoff. */
    String syncA2AWalletSettlement(String delegationId) = 27;
    /** Lists this owner's connected A2A agents; cards remain untrusted capability claims. */
    String cloudA2AAgents() = 28;
    /** Requests a quote only after explicit prompt-disclosure consent; verifies Provider signature locally. */
    String requestCloudA2APriceQuote(String agentId, String quoteRequestId, String message,
            String currency, long maximumBudgetMinor, long expiresAt, boolean consentToSharePrompt) = 29;
    /** Saves an owner-approved quote as an awaiting_approval Cloud draft; this cannot dispatch it. */
    String prepareCloudA2ADelegation(String draftJson) = 30;
    /** Read-only idempotency recovery for one exact delegation draft. */
    String recoverCloudA2ADelegation(String parentJobId, String idempotencyKey, String inputSha256) = 31;
    /** Request a distinct, device-credential-gated native Wallet cap approval for this Cloud draft. */
    String requestCloudA2AWalletReservation(String draftJson) = 32;
    /** Create the exact HELD reservation after the owner confirms the native approval. */
    String confirmCloudA2AWalletReservation(String draftJson, String approvalId) = 33;
    /** Release a pre-dispatch hold; dispatched or indeterminate work can never be released here. */
    String releaseCloudA2AWalletReservation(String delegationId) = 34;
    /** Sign only from an exact HELD row and upload the proof; this still does not approve Cloud execution. */
    String registerCloudA2ABrokerAuthorization(String draftJson) = 35;
    /** Final explicit Cloud approval; retries are never automatic and uncertain results fence the Wallet cap. */
    String approveCloudA2ADelegation(String draftJson) = 36;
    /** Read-only same-delegation status recovery after a Cloud approval result was uncertain. */
    String recoverCloudA2AExecution(String draftJson) = 37;
    /** Send one owner-authorized remote cancellation request; status readback distinguishes acceptance from stop confirmation. */
    String cancelCloudA2ADelegation(String delegationId) = 38;
    /** Registers a seller-signed physical-SIM/eSIM service claim for the linked device-session owner. */
    String claimRockstarServiceEntitlement(String packageJson) = 39;
    /** Reads only APK-authenticated model definitions; never downloads or activates weights. */
    String localModelCatalog() = 40;
    /** Explicit consent, fixed catalog profile and read-only file; all verification/activation stays in Broker. */
    String importLocalModel(String profileId, in ParcelFileDescriptor source, boolean consent) = 41;
    /** Explicitly reload one previously verified cached catalog model; no auto-load on boot. */
    String reloadLocalModel(String profileId, boolean consent) = 42;
    /** Read-only task-aware selection from signed, cached, owner-consented local profiles. */
    String prepareLocalModelChoice(String choice, String prompt) = 43;
    /** Executes only the displayed exact model digest; no implicit substitute or cloud fallback. */
    String submitZemaSelected(String requestId, String selectionToken, String prompt, String contextJson,
        String expectedModelDigest, boolean consent) = 44;
    /** Explicit public-keyword search only; returned metadata never becomes a trusted executable profile. */
    String searchPublicModels(String query) = 45;
    String preparePublicModelInstall(String profileId) = 46;
    String beginPublicModelDownload(String profileId, boolean consent) = 47;
    String publicModelInstallStatus() = 48;
    String finishPublicModelInstall(String operationId, boolean consent) = 49;
    String cancelPublicModelDownload(String operationId) = 50;
    /** Owner consent and exact checkpoint CAS; one compact recovery of pure local ideation only. */
    void compactReplanIdeas(String workId, String expectedCheckpointDigest, boolean consent) = 51;
    /** Public immutable metadata only; may return file choices or an owner-bound proposal. */
    String inspectSkyAddon(String source) = 52;
    String addSkyAddon(String proposalId, String expectedDigest, boolean consent) = 53;
    String skyAddons() = 54;
    /** Disable new use; model revocation is fenced by existing active-work pins. */
    String revokeSkyAddon(String digest, boolean consent) = 55;
    String prepareSkyAgent(String digest, String modelChoice, String request) = 56;
    String submitSkyAgent(String digest, String requestId, String request, String expectedModelDigest, boolean consent) = 57;
    String configureSkyModelAutomaticTasks(String digest, long expectedRevision, String tasksJson, boolean consent) = 58;
}
