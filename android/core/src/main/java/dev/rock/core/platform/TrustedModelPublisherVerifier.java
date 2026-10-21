package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;

/** Verifies detached Ed25519 model-manifest signatures against an OS-owned keyset. */
public final class TrustedModelPublisherVerifier implements ModelProfileAuthenticator {
    public static final class PublisherKey {
        public final String publisherId;
        public final String keyId;
        public final boolean revoked;
        private final byte[] rawPublicKey;

        public PublisherKey(String publisherId, String keyId, byte[] rawPublicKey, boolean revoked) {
            if (publisherId == null || !publisherId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{2,127}"))
                throw new IllegalArgumentException("INVALID_MODEL_PUBLISHER_ID");
            if (keyId == null || !keyId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{2,127}"))
                throw new IllegalArgumentException("INVALID_MODEL_SIGNING_KEY_ID");
            if (rawPublicKey == null || rawPublicKey.length != 32)
                throw new IllegalArgumentException("INVALID_ED25519_PUBLIC_KEY");
            this.publisherId = publisherId;
            this.keyId = keyId;
            this.rawPublicKey = rawPublicKey.clone();
            this.revoked = revoked;
        }
    }

    private final Map<String, PublisherKey> keys;

    /** The caller must source this immutable keyset from an OS-authenticated trust store. */
    public TrustedModelPublisherVerifier(Collection<PublisherKey> trustedKeys) {
        if (trustedKeys == null || trustedKeys.size() > 256)
            throw new IllegalArgumentException("INVALID_MODEL_PUBLISHER_KEYSET");
        Map<String, PublisherKey> copy = new HashMap<>();
        for (PublisherKey key : trustedKeys) {
            if (key == null || copy.putIfAbsent(identity(key.publisherId, key.keyId), key) != null)
                throw new IllegalArgumentException("DUPLICATE_MODEL_PUBLISHER_KEY");
        }
        keys = Collections.unmodifiableMap(copy);
    }

    /** Verify signature and publisher/key binding; this does not verify model bytes or licensing. */
    public String verifySignature(ModelProfileManifest profile) {
        if (profile == null) throw new IllegalArgumentException("MODEL_PROFILE_REQUIRED");
        if (profile.ownerPinned()) throw new SecurityException("MODEL_AUTHOR_SIGNATURE_ABSENT");
        PublisherKey key = keys.get(identity(profile.publisherId, profile.signingKeyId));
        if (key == null) throw new SecurityException("MODEL_PUBLISHER_KEY_UNTRUSTED");
        if (key.revoked) throw new SecurityException("MODEL_PUBLISHER_KEY_REVOKED");
        try {
            byte[] signatureBytes = Base64.getUrlDecoder().decode(profile.manifestSignatureBase64Url);
            if (signatureBytes.length != 64 || !Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(signatureBytes).equals(profile.manifestSignatureBase64Url))
                throw new SecurityException("INVALID_MODEL_MANIFEST_SIGNATURE");
            // A fixed software verifier works on Android 35 and JVM without importing a public
            // model-distribution key into AndroidKeyStore or registering a global crypto provider.
            Ed25519Signer signature = new Ed25519Signer();
            signature.init(false, new Ed25519PublicKeyParameters(key.rawPublicKey, 0));
            byte[] payload = profile.signedPayload().getBytes(StandardCharsets.UTF_8);
            signature.update(payload, 0, payload.length);
            if (!signature.verifySignature(signatureBytes)) throw new SecurityException("MODEL_MANIFEST_SIGNATURE_MISMATCH");
            return Engine.digest("rockstaros-model-profile-signature-verified/1\n" + profile.digest());
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SecurityException("MODEL_MANIFEST_SIGNATURE_VERIFICATION_FAILED", failure);
        }
    }

    private static String identity(String publisherId, String keyId) {
        return publisherId + "\n" + keyId;
    }
}
