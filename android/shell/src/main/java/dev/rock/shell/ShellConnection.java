package dev.rock.shell;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import dev.rock.shellapi.IShellApi;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Exact-package, same-signer client for the separately packaged Platform Broker. */
final class ShellConnection {
    static final String BROKER_PACKAGE = "dev.rock.automation";
    static final String BROKER_SERVICE = BROKER_PACKAGE + ".RockShellService";
    static final int API_VERSION = 18;
    private final Context context;

    ShellConnection(Context context) { this.context = context; }

    String snapshot() throws Exception { return withService(IShellApi::snapshot); }
    String submit(String requestId, String input, boolean sample, boolean consent) throws Exception {
        return withService(api -> api.submit(requestId, input, sample, consent));
    }
    void setPaused(boolean paused) throws Exception { withService(api -> { api.setPaused(paused); return null; }); }
    String result(String workId) throws Exception { return withService(api -> api.result(workId)); }
    void complete(String workId, String note) throws Exception { withService(api -> { api.complete(workId, note); return null; }); }
    void retry(String workId) throws Exception { withService(api -> { api.retry(workId); return null; }); }
    void cancel(String workId) throws Exception { withService(api -> { api.cancel(workId); return null; }); }
    String localAiStatus() throws Exception { return withService(IShellApi::localAiStatus); }
    String submitZema(String requestId, String selectionToken, String prompt, String contextJson,
                      boolean consent) throws Exception {
        return withService(api -> api.submitZema(requestId, selectionToken, prompt, contextJson, consent));
    }
    String skySelection() throws Exception { return withService(IShellApi::skySelection); }
    String selectSkyTool(String toolId) throws Exception {
        return withService(api -> api.selectSkyTool(toolId));
    }
    String recoveryStatus() throws Exception { return withService(IShellApi::recoveryStatus); }
    String beginRecoverySetup() throws Exception { return withService(IShellApi::beginRecoverySetup); }
    String confirmRecoverySetup(String setupToken, String confirmationsJson) throws Exception {
        return withService(api -> api.confirmRecoverySetup(setupToken, confirmationsJson));
    }
    String createRecoverableBackup(String requestId, ParcelFileDescriptor destination) throws Exception {
        return withService(api -> api.createRecoverableBackup(requestId, destination));
    }
    String restoreRecoverableBackup(ParcelFileDescriptor source, String phrase) throws Exception {
        return withService(api -> api.restoreRecoverableBackup(source, phrase));
    }
    String provisionEsimGatewayKey(String challengeJson, boolean requireStrongBox) throws Exception {
        return withService(api -> api.provisionEsimGatewayKey(challengeJson, requireStrongBox));
    }
    String beginRockstarDeviceLink() throws Exception { return withService(IShellApi::beginRockstarDeviceLink); }
    String pollRockstarDeviceLink(String flowId) throws Exception {
        return withService(api -> api.pollRockstarDeviceLink(flowId));
    }
    String rockstarDeviceLinkStatus() throws Exception { return withService(IShellApi::rockstarDeviceLinkStatus); }
    String cloudServiceHome() throws Exception { return withService(IShellApi::cloudServiceHome); }
    String claimRockstarServiceEntitlement(String packageJson) throws Exception {
        return withService(api -> api.claimRockstarServiceEntitlement(packageJson));
    }
    String cloudTaskDetail(String kind, String taskId) throws Exception {
        return withService(api -> api.cloudTaskDetail(kind, taskId));
    }
    String prepareCloudLlmQuote(String requestId, String prompt, long maximumBudgetMinor,
            String currency, boolean saveResult) throws Exception {
        return withService(api -> api.prepareCloudLlmQuote(requestId, prompt, maximumBudgetMinor, currency, saveResult));
    }
    String executeCloudLlmQuote(String prompt, String quoteId, String approvalDigest,
            String model, int outputTokenLimit) throws Exception {
        return withService(api -> api.executeCloudLlmQuote(prompt, quoteId, approvalDigest, model, outputTokenLimit));
    }
    String enrollA2ABrokerDevice(boolean requireStrongBox) throws Exception {
        return withService(api -> api.enrollA2ABrokerDevice(requireStrongBox));
    }
    String revokeA2ABrokerDevice(String keyId) throws Exception {
        return withService(api -> api.revokeA2ABrokerDevice(keyId));
    }
    String syncA2AWalletSettlement(String delegationId) throws Exception {
        return withService(api -> api.syncA2AWalletSettlement(delegationId));
    }
    String cloudA2AAgents() throws Exception { return withService(IShellApi::cloudA2AAgents); }
    String requestCloudA2APriceQuote(String agentId, String quoteRequestId, String message,
            String currency, long maximumBudgetMinor, long expiresAt, boolean consent) throws Exception {
        return withService(api -> api.requestCloudA2APriceQuote(agentId, quoteRequestId,
            message, currency, maximumBudgetMinor, expiresAt, consent));
    }
    String prepareCloudA2ADelegation(String draftJson) throws Exception {
        return withService(api -> api.prepareCloudA2ADelegation(draftJson));
    }
    String recoverCloudA2ADelegation(String parentJobId, String idempotencyKey, String inputSha256) throws Exception {
        return withService(api -> api.recoverCloudA2ADelegation(parentJobId, idempotencyKey, inputSha256));
    }
    String requestCloudA2AWalletReservation(String draftJson) throws Exception {
        return withService(api -> api.requestCloudA2AWalletReservation(draftJson));
    }
    String confirmCloudA2AWalletReservation(String draftJson, String approvalId) throws Exception {
        return withService(api -> api.confirmCloudA2AWalletReservation(draftJson, approvalId));
    }
    String releaseCloudA2AWalletReservation(String delegationId) throws Exception {
        return withService(api -> api.releaseCloudA2AWalletReservation(delegationId));
    }
    String registerCloudA2ABrokerAuthorization(String draftJson) throws Exception {
        return withService(api -> api.registerCloudA2ABrokerAuthorization(draftJson));
    }
    String approveCloudA2ADelegation(String draftJson) throws Exception {
        return withService(api -> api.approveCloudA2ADelegation(draftJson));
    }
    String recoverCloudA2AExecution(String draftJson) throws Exception {
        return withService(api -> api.recoverCloudA2AExecution(draftJson));
    }
    String cancelCloudA2ADelegation(String delegationId) throws Exception {
        return withService(api -> api.cancelCloudA2ADelegation(delegationId));
    }

    private <T> T withService(Call<T> call) throws Exception {
        PackageManager pm = context.getPackageManager();
        if (pm.getPackageInfo(BROKER_PACKAGE, 0).getLongVersionCode() != 1)
            throw new SecurityException("UNAPPROVED_BROKER_VERSION");
        if (pm.checkSignatures(context.getPackageName(), BROKER_PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_BROKER_SIGNER");
        CountDownLatch connected = new CountDownLatch(1);
        IShellApi[] remote = new IShellApi[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                remote[0] = IShellApi.Stub.asInterface(service); connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { remote[0] = null; }
            @Override public void onBindingDied(ComponentName name) { remote[0] = null; connected.countDown(); }
            @Override public void onNullBinding(ComponentName name) { connected.countDown(); }
        };
        Intent intent = new Intent().setComponent(new ComponentName(BROKER_PACKAGE, BROKER_SERVICE));
        if (!context.bindService(intent, connection, Context.BIND_AUTO_CREATE))
            throw new IllegalStateException("BROKER_UNAVAILABLE");
        try {
            if (!connected.await(5, TimeUnit.SECONDS) || remote[0] == null)
                throw new IllegalStateException("BROKER_BIND_INTERRUPTED");
            if (remote[0].getApiVersion() != API_VERSION)
                throw new IllegalStateException("INCOMPATIBLE_SHELL_API");
            return call.run(remote[0]);
        } finally {
            context.unbindService(connection);
        }
    }

    private interface Call<T> { T run(IShellApi api) throws Exception; }
}
