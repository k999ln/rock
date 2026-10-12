package dev.rock.sdk;

import dev.rock.sdk.IPlatformCallback;

/**
 * RockstarOS Platform API v1. Management calls are restricted to the OS broker.
 * Tool/MCP/Provider implementations receive only scoped execution tokens.
 */
interface IPlatformApi {
    const int API_VERSION = 1;
    const int MIN_SUPPORTED_API = 1;
    const int MAX_SUPPORTED_API = 1;

    int getApiVersion() = 0;
    oneway void registerComponent(String requestId, String installedManifestJson, IPlatformCallback callback) = 1;
    oneway void requestApproval(String requestId, String componentId, String action,
        String payloadDigest, long maxCostMinor, long expiresAtEpochMs, IPlatformCallback callback) = 2;
    oneway void stopComponent(String requestId, String componentId, IPlatformCallback callback) = 3;
    oneway void revokeComponent(String requestId, String componentId, IPlatformCallback callback) = 4;
    oneway void recordLedgerReceipt(String requestId, String approvalId, String componentId,
        String action, String payloadDigest, long actualCostMinor, long amountMinor,
        String currency, IPlatformCallback callback) = 5;
    oneway void recordProviderReceipt(String requestId, String providerId, long amountMinor,
        String currency, String providerReference, String receiptDigest,
        IPlatformCallback callback) = 6;
    oneway void createEncryptedBackup(String requestId, IPlatformCallback callback) = 7;
}
