package dev.rock.automation;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import dev.rock.core.platform.A2AWalletHandoffRequest;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Enumeration;
import java.util.List;

/**
 * Broker-private P-256 signer for A2A authorization and read-only Wallet handoff requests.
 * The challenge must come from an authenticated server enrollment flow; this adapter only
 * binds it into Android Keystore attestation and never treats possession as server trust.
 */
final class A2ABrokerDeviceKeyStore implements A2AWalletHandoffRequest.Signer {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS_PREFIX = "rock_a2a_broker_p256_attested_v1_";
    private final KeyStore keyStore;
    private final String alias;
    private final String keyId;
    private final boolean resumed;
    private boolean retired;

    private A2ABrokerDeviceKeyStore(KeyStore keyStore, String alias, String keyId, boolean resumed) {
        this.keyStore = keyStore;
        this.alias = alias;
        this.keyId = keyId;
        this.resumed = resumed;
    }

    /** Create/reopen the exact challenge-bound alias. Hardware-backed signing is mandatory. */
    static synchronized A2ABrokerDeviceKeyStore provision(Context context,
            byte[] serverAttestationChallenge, boolean requireStrongBox) throws Exception {
        if (context == null || serverAttestationChallenge == null ||
            serverAttestationChallenge.length != 32 || allZero(serverAttestationChallenge))
            throw new IllegalArgumentException("A2A_BROKER_CHALLENGE_INVALID");
        String alias = ALIAS_PREFIX + hex(sha256(serverAttestationChallenge));
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        boolean resumed = store.containsAlias(alias);
        if (!resumed) generate(alias, serverAttestationChallenge, requireStrongBox);
        A2ABrokerDeviceKeyStore result;
        try {
            result = new A2ABrokerDeviceKeyStore(store, alias,
                hex(sha256(rawPublicKey(store, alias))), resumed);
            if (!result.hardwareBacked()) throw new SecurityException("A2A_BROKER_KEY_NOT_HARDWARE_BACKED");
            if (requireStrongBox && !result.strongBoxBacked())
                throw new SecurityException("A2A_BROKER_KEY_NOT_STRONGBOX_BACKED");
            if (result.attestationChainDer().size() < 2)
                throw new SecurityException("A2A_BROKER_ATTESTATION_CHAIN_UNAVAILABLE");
            return result;
        } catch (Exception failure) {
            if (!resumed) try { store.deleteEntry(alias); } catch (Exception ignored) { }
            throw failure;
        }
    }

    /** Open only an existing hardware-backed key whose raw public-key digest is keyId. */
    static synchronized A2ABrokerDeviceKeyStore open(Context context, String keyId) throws Exception {
        if (context == null || keyId == null || !keyId.matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("A2A_BROKER_KEY_ID_INVALID");
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        Enumeration<String> aliases = store.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (!alias.startsWith(ALIAS_PREFIX) || !store.containsAlias(alias)) continue;
            byte[] raw = rawPublicKey(store, alias);
            if (!keyId.equals(hex(sha256(raw)))) continue;
            A2ABrokerDeviceKeyStore result = new A2ABrokerDeviceKeyStore(store, alias, keyId, true);
            if (!result.hardwareBacked()) throw new SecurityException("A2A_BROKER_KEY_NOT_HARDWARE_BACKED");
            return result;
        }
        throw new IllegalStateException("A2A_BROKER_KEY_NOT_PROVISIONED");
    }

    /** Idempotently delete only the local alias whose attested public-key digest matches keyId. */
    static synchronized void retire(Context context, String keyId) throws Exception {
        if (context == null || keyId == null || !keyId.matches("[a-f0-9]{64}"))
            throw new IllegalArgumentException("A2A_BROKER_KEY_ID_INVALID");
        KeyStore store = KeyStore.getInstance(STORE);
        store.load(null);
        Enumeration<String> aliases = store.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (!alias.startsWith(ALIAS_PREFIX) || !store.containsAlias(alias)) continue;
            byte[] raw = rawPublicKey(store, alias);
            try {
                if (keyId.equals(hex(sha256(raw)))) {
                    store.deleteEntry(alias);
                    return;
                }
            } finally { java.util.Arrays.fill(raw, (byte) 0); }
        }
    }

    private static void generate(String alias, byte[] challenge, boolean requireStrongBox) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC", STORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
            .setUnlockedDeviceRequired(false)
            .setAttestationChallenge(challenge.clone());
        if (requireStrongBox) builder.setIsStrongBoxBacked(true);
        generator.initialize(builder.build());
        generator.generateKeyPair();
    }

    String keyId() { return keyId; }
    boolean resumedFromExistingAlias() { return resumed; }

    synchronized byte[] rawPublicKey() { return rawPublicKey(keyStore, alias); }

    synchronized byte[] subjectPublicKeyInfo() {
        try {
            Certificate certificate = keyStore.getCertificate(alias);
            if (certificate == null) throw new SecurityException("A2A_BROKER_PUBLIC_KEY_MISSING");
            return certificate.getPublicKey().getEncoded().clone();
        } catch (SecurityException failure) { throw failure; }
        catch (Exception failure) { throw new SecurityException("A2A_BROKER_PUBLIC_KEY_MISSING", failure); }
    }

    synchronized List<String> attestationChainDerBase64Url() throws Exception {
        List<String> output = new ArrayList<>();
        int total = 0;
        for (byte[] der : attestationChainDer()) {
            total += der.length;
            if (total > 192 * 1024) throw new SecurityException("A2A_BROKER_ATTESTATION_CHAIN_TOO_LARGE");
            output.add(Base64.getUrlEncoder().withoutPadding().encodeToString(der));
        }
        return output;
    }

    synchronized List<byte[]> attestationChainDer() throws Exception {
        ensureActive();
        Certificate[] chain = keyStore.getCertificateChain(alias);
        if (chain == null || chain.length < 2)
            throw new SecurityException("A2A_BROKER_ATTESTATION_CHAIN_UNAVAILABLE");
        List<byte[]> result = new ArrayList<>(chain.length);
        for (Certificate certificate : chain) result.add(certificate.getEncoded());
        return result;
    }

    synchronized boolean hardwareBacked() {
        int level = securityLevel();
        return level == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
            level == KeyProperties.SECURITY_LEVEL_STRONGBOX;
    }

    synchronized boolean strongBoxBacked() { return securityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX; }

    private int securityLevel() {
        try {
            PrivateKey key = privateKey();
            KeyInfo info = KeyFactory.getInstance(key.getAlgorithm(), STORE).getKeySpec(key, KeyInfo.class);
            return info.getSecurityLevel();
        } catch (Exception unavailable) {
            return KeyProperties.SECURITY_LEVEL_UNKNOWN;
        }
    }

    @Override public synchronized byte[] sign(byte[] message) throws Exception {
        ensureActive();
        if (message == null || message.length < 1 || message.length > 16_384)
            throw new IllegalArgumentException("A2A_BROKER_SIGNING_INPUT_INVALID");
        if (!hardwareBacked()) throw new SecurityException("A2A_BROKER_KEY_NOT_HARDWARE_BACKED");
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(privateKey());
        signer.update(message);
        byte[] der = signer.sign();
        try { return ecdsaDerToP1363(der); }
        finally { java.util.Arrays.fill(der, (byte) 0); }
    }

    /** Local deletion cannot revoke server trust; use only after the server key is revoked. */
    synchronized void retire() {
        if (retired) return;
        try { if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias); }
        catch (Exception failure) { throw new SecurityException("A2A_BROKER_KEY_RETIRE_FAILED", failure); }
        retired = true;
    }

    private PrivateKey privateKey() throws Exception {
        ensureActive();
        return (PrivateKey) keyStore.getKey(alias, null);
    }

    private void ensureActive() {
        if (retired) throw new SecurityException("A2A_BROKER_KEY_RETIRED");
    }

    private static byte[] rawPublicKey(KeyStore store, String alias) {
        try {
            Certificate certificate = store.getCertificate(alias);
            if (certificate == null) throw new SecurityException("A2A_BROKER_PUBLIC_KEY_MISSING");
            if (!"EC".equalsIgnoreCase(certificate.getPublicKey().getAlgorithm()))
                throw new SecurityException("A2A_BROKER_KEY_NOT_P256");
            byte[] encoded = certificate.getPublicKey().getEncoded();
            if (encoded == null || encoded.length < 65)
                throw new SecurityException("A2A_BROKER_KEY_NOT_P256");
            byte[] raw = java.util.Arrays.copyOfRange(encoded, encoded.length - 65, encoded.length);
            if (raw[0] != 4) throw new SecurityException("A2A_BROKER_KEY_NOT_P256");
            return raw;
        } catch (SecurityException failure) { throw failure; }
        catch (Exception failure) { throw new SecurityException("A2A_BROKER_PUBLIC_KEY_MISSING", failure); }
    }

    /** Convert JCA's ASN.1 DER ECDSA signature to WebCrypto's 32-byte r || s form. */
    private static byte[] ecdsaDerToP1363(byte[] der) {
        if (der == null || der.length < 8 || der.length > 72 || der[0] != 0x30 ||
                (der[1] & 255) != der.length - 2 || der[2] != 0x02)
            throw new SecurityException("A2A_BROKER_SIGNATURE_INVALID");
        int rLength = der[3] & 255;
        int rStart = 4;
        int sTag = rStart + rLength;
        if (rLength < 1 || rLength > 33 || sTag + 2 > der.length || der[sTag] != 0x02)
            throw new SecurityException("A2A_BROKER_SIGNATURE_INVALID");
        int sLength = der[sTag + 1] & 255;
        int sStart = sTag + 2;
        if (sLength < 1 || sLength > 33 || sStart + sLength != der.length)
            throw new SecurityException("A2A_BROKER_SIGNATURE_INVALID");
        byte[] output = new byte[64];
        copyInteger(der, rStart, rLength, output, 0);
        copyInteger(der, sStart, sLength, output, 32);
        return output;
    }

    private static void copyInteger(byte[] der, int start, int length, byte[] output, int offset) {
        while (length > 32 && der[start] == 0) { start++; length--; }
        if (length > 32 || (der[start] & 0x80) != 0)
            throw new SecurityException("A2A_BROKER_SIGNATURE_INVALID");
        System.arraycopy(der, start, output, offset + 32 - length, length);
    }

    private static byte[] sha256(byte[] value) {
        try { return java.security.MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception failure) { throw new IllegalStateException("SHA256_UNAVAILABLE", failure); }
    }

    private static String hex(byte[] value) {
        StringBuilder output = new StringBuilder(value.length * 2);
        for (byte item : value) output.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        return output.toString();
    }

    private static boolean allZero(byte[] value) {
        int aggregate = 0;
        for (byte item : value) aggregate |= item;
        return aggregate == 0;
    }
}
