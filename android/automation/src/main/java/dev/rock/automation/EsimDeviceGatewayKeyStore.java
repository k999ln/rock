package dev.rock.automation;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import dev.rock.core.platform.EsimDeviceEntitlement;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Locale;
import java.util.Enumeration;
import java.util.ArrayList;
import java.util.List;
import java.util.Base64;

/**
 * Broker-private AndroidKeyStore adapter for the eSIM entitlement receipt signer.
 * The provider trust inventory remains server-authoritative; local retirement only removes
 * this alias and cannot reactivate a server-revoked key.
 */
final class EsimDeviceGatewayKeyStore implements EsimDeviceEntitlement.Es256DeviceKey {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS_PREFIX = "rock_esim_gateway_v1_";
    private static final String AUTHORITY_ID = "android-key-attestation-google";

    private final KeyStore keyStore;
    private final String alias;
    private final String authorityId;
    private final String keyId;
    private final boolean resumed;
    private boolean retired;

    private EsimDeviceGatewayKeyStore(KeyStore keyStore, String alias,
            String authorityId, String keyId, boolean resumed) {
        this.keyStore = keyStore;
        this.alias = alias;
        this.authorityId = authorityId;
        this.keyId = keyId;
        this.resumed = resumed;
    }

    /**
     * Create or reopen a non-exportable P-256 signing key using the already authenticated
     * enrollment challenge bytes supplied by the caller. This method does not authenticate
     * that challenge. Hardware-backed TEE is required; StrongBox can be required for OEM
     * SKUs that advertise it. The returned attestation chain must be verified by server/OEM.
     */
    static synchronized EsimDeviceGatewayKeyStore provision(Context context,
            byte[] attestationChallenge,
            boolean requireStrongBox) throws Exception {
        if (context == null || attestationChallenge == null || attestationChallenge.length != 32
                || isAllZero(attestationChallenge))
            throw new IllegalArgumentException("ESIM_GATEWAY_PROVISIONING_INPUT_INVALID");
        String alias = ALIAS_PREFIX + hex(sha256(attestationChallenge));
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        // The server challenge may have been accepted by AndroidKeyStore just before the
        // caller lost its response. Reuse only the alias derived from the same nonce; the
        // server still verifies the attestation challenge and enrolled key before activation.
        boolean resumed = store.containsAlias(alias);
        if (!resumed) generate(alias, attestationChallenge, requireStrongBox);
        byte[] rawPublicKey;
        try {
            Certificate certificate = store.getCertificate(alias);
            if (certificate == null || !(certificate.getPublicKey() instanceof ECPublicKey))
                throw new SecurityException("ESIM_GATEWAY_PUBLIC_KEY_UNAVAILABLE");
            ECPublicKey ec = (ECPublicKey) certificate.getPublicKey();
            rawPublicKey = rawPoint(ec);
        } catch (Exception failure) {
            store.deleteEntry(alias);
            throw failure;
        }
        String keyId = hex(sha256(rawPublicKey));
        EsimDeviceGatewayKeyStore result = new EsimDeviceGatewayKeyStore(
            store, alias, AUTHORITY_ID, keyId, resumed);
        if (!result.hardwareBacked()) {
            result.retire();
            throw new SecurityException("ESIM_GATEWAY_KEY_NOT_HARDWARE_BACKED");
        }
        if (requireStrongBox && !result.strongBoxBacked()) {
            if (!resumed) result.retire();
            throw new SecurityException("ESIM_GATEWAY_KEY_NOT_STRONGBOX_BACKED");
        }
        return result;
    }

    synchronized boolean resumedFromExistingAlias() { return resumed; }

    /** Open an existing alias without pretending that a new enrollment challenge was applied. */
    static synchronized EsimDeviceGatewayKeyStore open(Context context,
            String authorityId, String keyId) throws Exception {
        if (context == null || !safeId(authorityId) || !safeId(keyId))
            throw new IllegalArgumentException("ESIM_GATEWAY_IDENTITY_INVALID");
        String alias = ALIAS_PREFIX + hex(sha256((authorityId + "\0" + keyId)
            .getBytes(StandardCharsets.UTF_8)));
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        if (!store.containsAlias(alias)) {
            Enumeration<String> aliases = store.aliases();
            alias = null;
            while (aliases.hasMoreElements()) {
                String candidate = aliases.nextElement();
                if (!candidate.startsWith(ALIAS_PREFIX)) continue;
                Certificate candidateCertificate = store.getCertificate(candidate);
                if (candidateCertificate == null || !(candidateCertificate.getPublicKey() instanceof ECPublicKey)) continue;
                if (keyId.equals(hex(sha256(rawPoint((ECPublicKey) candidateCertificate.getPublicKey()))))) {
                    alias = candidate;
                    break;
                }
            }
        }
        if (alias == null || !store.containsAlias(alias))
            throw new IllegalStateException("ESIM_GATEWAY_KEY_NOT_PROVISIONED");
        EsimDeviceGatewayKeyStore result = new EsimDeviceGatewayKeyStore(
            store, alias, authorityId, keyId, true);
        if (!result.hardwareBacked())
            throw new SecurityException("ESIM_GATEWAY_KEY_NOT_HARDWARE_BACKED");
        return result;
    }

    private static void generate(String alias, byte[] challenge, boolean requireStrongBox)
            throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC, STORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
            .setUnlockedDeviceRequired(false)
            .setAttestationChallenge(challenge.clone());
        if (requireStrongBox) builder.setIsStrongBoxBacked(true);
        generator.initialize(builder.build());
        generator.generateKeyPair();
    }

    @Override public String authorityId() { return authorityId; }
    @Override public String keyId() { return keyId; }

    @Override public synchronized boolean hardwareBacked() {
        try { return securityLevel() == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT
                || securityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX; }
        catch (Exception unavailable) { return false; }
    }

    synchronized boolean strongBoxBacked() {
        try { return securityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX; }
        catch (Exception unavailable) { return false; }
    }

    private int securityLevel() throws Exception {
        PrivateKey privateKey = privateKey();
        KeyInfo info = java.security.KeyFactory.getInstance(privateKey.getAlgorithm(), STORE)
            .getKeySpec(privateKey, KeyInfo.class);
        return info.getSecurityLevel();
    }

    @Override public synchronized boolean revoked() { return retired; }

    @Override public synchronized PublicKey publicKey() {
        try {
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate == null || !(certificate.getPublicKey() instanceof ECPublicKey))
                throw new SecurityException("ESIM_GATEWAY_PUBLIC_KEY_UNAVAILABLE");
            return certificate.getPublicKey();
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SecurityException("ESIM_GATEWAY_PUBLIC_KEY_UNAVAILABLE", failure);
        }
    }

    /** Return copies for an out-of-band server/OEM attestation verifier. */
    synchronized byte[][] attestationChainDer() throws Exception {
        ensureActive();
        Certificate[] chain = keyStore.getCertificateChain(alias);
        if (chain == null || chain.length < 2)
            throw new SecurityException("ESIM_GATEWAY_ATTESTATION_CHAIN_UNAVAILABLE");
        byte[][] encoded = new byte[chain.length][];
        for (int index = 0; index < chain.length; index++) encoded[index] = chain[index].getEncoded();
        return encoded;
    }

    /** Raw uncompressed P-256 point, matching ESIM_DEVICE_GATEWAY_KEYS.publicKeyHex. */
    synchronized byte[] rawPublicKey() {
        PublicKey key = publicKey();
        ECPublicKey ec = (ECPublicKey) key;
        return rawPoint(ec);
    }

    /** Base64url DER chain for the authenticated server verifier request. */
    synchronized List<String> attestationChainDerBase64Url() throws Exception {
        byte[][] chain = attestationChainDer();
        List<String> encoded = new ArrayList<>(chain.length);
        int total = 0;
        for (byte[] certificate : chain) {
            total += certificate.length;
            if (total > 192 * 1024) throw new SecurityException("ESIM_GATEWAY_ATTESTATION_CHAIN_TOO_LARGE");
            encoded.add(Base64.getUrlEncoder().withoutPadding().encodeToString(certificate));
        }
        return encoded;
    }

    @Override public synchronized byte[] signDer(byte[] message) throws Exception {
        ensureActive();
        if (message == null || message.length < 1 || message.length > 16_384)
            throw new IllegalArgumentException("ESIM_GATEWAY_MESSAGE_INVALID");
        if (!hardwareBacked()) throw new SecurityException("ESIM_GATEWAY_KEY_NOT_HARDWARE_BACKED");
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(privateKey());
        signer.update(message);
        return signer.sign();
    }

    /** Remove the non-exportable private key. Server-side revocation remains authoritative. */
    synchronized void retire() {
        if (retired) return;
        try { if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias); }
        catch (Exception failure) { throw new SecurityException("ESIM_GATEWAY_KEY_RETIRE_FAILED", failure); }
        retired = true;
    }

    private PrivateKey privateKey() throws Exception {
        ensureActive();
        return (PrivateKey) keyStore.getKey(alias, null);
    }

    private void ensureActive() {
        if (retired) throw new SecurityException("ESIM_GATEWAY_KEY_RETIRED");
    }

    private static byte[] fixed32(byte[] integer) {
        int offset = integer.length == 33 && integer[0] == 0 ? 1 : 0;
        int length = integer.length - offset;
        if (length > 32) throw new SecurityException("ESIM_GATEWAY_KEY_NOT_P256");
        byte[] result = new byte[32];
        System.arraycopy(integer, offset, result, 32 - length, length);
        return result;
    }

    private static byte[] rawPoint(ECPublicKey ec) {
        if (ec.getParams().getCurve().getField().getFieldSize() != 256
                || ec.getParams().getOrder().bitLength() != 256)
            throw new SecurityException("ESIM_GATEWAY_KEY_NOT_P256");
        byte[] x = fixed32(ec.getW().getAffineX().toByteArray());
        byte[] y = fixed32(ec.getW().getAffineY().toByteArray());
        byte[] raw = new byte[65];
        raw[0] = 4;
        System.arraycopy(x, 0, raw, 1, 32);
        System.arraycopy(y, 0, raw, 33, 32);
        return raw;
    }

    private static byte[] sha256(byte[] value) throws Exception {
        return java.security.MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return result.toString();
    }

    private static boolean isAllZero(byte[] value) {
        int combined = 0;
        for (byte item : value) combined |= item;
        return combined == 0;
    }

}
