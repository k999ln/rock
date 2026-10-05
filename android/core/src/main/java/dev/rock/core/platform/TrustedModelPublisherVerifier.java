package dev.rock.core.platform;

import dev.rock.core.Engine;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** Verifies detached Ed25519 model-manifest signatures against an OS-owned keyset. */
public final class TrustedModelPublisherVerifier {
    private static final byte[] ED25519_X509_PREFIX = new byte[] {
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    };

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

        private PublicKey publicKey() throws Exception {
            byte[] encoded = ByteBuffer.allocate(ED25519_X509_PREFIX.length + rawPublicKey.length)
                .put(ED25519_X509_PREFIX).put(rawPublicKey).array();
            return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(encoded));
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
        PublisherKey key = keys.get(identity(profile.publisherId, profile.signingKeyId));
        if (key == null) throw new SecurityException("MODEL_PUBLISHER_KEY_UNTRUSTED");
        if (key.revoked) throw new SecurityException("MODEL_PUBLISHER_KEY_REVOKED");
        try {
            byte[] signatureBytes = Base64.getUrlDecoder().decode(profile.manifestSignatureBase64Url);
            if (signatureBytes.length != 64 || !Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(signatureBytes).equals(profile.manifestSignatureBase64Url))
                throw new SecurityException("INVALID_MODEL_MANIFEST_SIGNATURE");
            Signature signature = Signature.getInstance("Ed25519");
            signature.initVerify(key.publicKey());
            signature.update(profile.signedPayload().getBytes(StandardCharsets.UTF_8));
            if (!signature.verify(signatureBytes)) throw new SecurityException("MODEL_MANIFEST_SIGNATURE_MISMATCH");
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
