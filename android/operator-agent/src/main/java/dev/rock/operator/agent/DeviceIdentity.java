package dev.rock.operator.agent;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import java.nio.ByteBuffer;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.UUID;

final class DeviceIdentity {
    private static final String STORE = "AndroidKeyStore";
    private static final String ALIAS = "avocado_operator_device_identity_v1";
    private final KeyStore keyStore;

    DeviceIdentity() throws Exception {
        this(false, "");
    }

    DeviceIdentity(boolean hardwareRequired) throws Exception {
        this(hardwareRequired, "");
    }

    DeviceIdentity(boolean hardwareRequired, String attestationChallenge) throws Exception {
        keyStore = KeyStore.getInstance(STORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(ALIAS)) createKey(hardwareRequired, attestationChallenge);
        if (hardwareRequired && !insideStrongBox())
            throw new SecurityException("StrongBox device identity required");
    }

    private static void createKey(boolean hardwareRequired, String attestationChallenge) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .setUnlockedDeviceRequired(false);
        if (hardwareRequired) {
            builder.setIsStrongBoxBacked(true);
            builder.setAttestationChallenge(
                    OperatorCommandVerifier.decode(attestationChallenge, 256));
        }
        generator.initialize(builder.build());
        generator.generateKeyPair();
    }

    private boolean insideStrongBox() throws Exception {
        PrivateKey key = (PrivateKey) keyStore.getKey(ALIAS, null);
        KeyInfo info = java.security.KeyFactory.getInstance(key.getAlgorithm(), STORE)
                .getKeySpec(key, KeyInfo.class);
        return info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX;
    }

    byte[] publicKeySpki() throws Exception {
        Certificate certificate = keyStore.getCertificate(ALIAS);
        if (certificate == null) throw new IllegalStateException("Device identity is unavailable");
        return certificate.getPublicKey().getEncoded();
    }

    Certificate[] certificateChain() throws Exception {
        Certificate[] chain = keyStore.getCertificateChain(ALIAS);
        if (chain == null || chain.length < 2)
            throw new SecurityException("Hardware attestation chain is unavailable");
        return chain.clone();
    }

    String deviceId() throws Exception {
        byte[] digest = OperatorCommandVerifier.sha256(publicKeySpki());
        digest[6] = (byte) ((digest[6] & 0x0f) | 0x50);
        digest[8] = (byte) ((digest[8] & 0x3f) | 0x80);
        ByteBuffer bytes = ByteBuffer.wrap(digest);
        return new UUID(bytes.getLong(), bytes.getLong()).toString();
    }

    byte[] sign(byte[] value) throws Exception {
        PrivateKey key = (PrivateKey) keyStore.getKey(ALIAS, null);
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key);
        signature.update(value);
        return signature.sign();
    }

    String newNonce() {
        byte[] nonce = new byte[24];
        new SecureRandom().nextBytes(nonce);
        return OperatorCommandVerifier.encode(nonce);
    }
}
