package dev.rock.core.platform;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.Base64;

/**
 * Android-side receipt contract for the owner/order/profile-bound eSIM entitlement API.
 * The caller must obtain the challenge over the authenticated service path and the install
 * evidence from an OEM/carrier privileged adapter. This class never inspects eUICC state.
 */
public final class EsimDeviceEntitlement {
    public static final String SCHEMA = "rock-esim-device-entitlement-receipt/1";
    private static final byte[] DOMAIN = "rock-esim-device-entitlement-signature/1\0"
        .getBytes(StandardCharsets.UTF_8);
    private static final long MAX_RECEIPT_LIFETIME_MS = 5 * 60_000L;

    private EsimDeviceEntitlement() {}

    /** Exact public challenge fields required by the signed-in Android gateway. */
    public static final class Challenge {
        public final String ownerUserId;
        public final String orderId;
        public final String profileDigest;
        public final String challengeId;
        public final String challengeNonce;
        public final long expiresAt;
        public final String deviceRef;
        public final String installReceiptSha256;
        public final String starterPackId;
        public final String starterPackVersion;
        public final String starterPackManifestSha256;

        public Challenge(String ownerUserId, String orderId, String profileDigest,
                String challengeId, String challengeNonce, long expiresAt, String deviceRef,
                String installReceiptSha256, String starterPackId, String starterPackVersion,
                String starterPackManifestSha256) {
            this.ownerUserId = id(ownerUserId, "INVALID_OWNER_ID");
            this.orderId = id(orderId, "INVALID_ORDER_ID");
            this.profileDigest = digest(profileDigest, "INVALID_PROFILE_DIGEST");
            this.challengeId = id(challengeId, "INVALID_CHALLENGE_ID");
            if (challengeNonce == null || !challengeNonce.matches("[A-Za-z0-9_-]{43}"))
                throw new IllegalArgumentException("INVALID_CHALLENGE_NONCE");
            this.challengeNonce = challengeNonce;
            if (expiresAt <= 0) throw new IllegalArgumentException("INVALID_CHALLENGE_EXPIRY");
            this.expiresAt = expiresAt;
            this.deviceRef = id(deviceRef, "INVALID_DEVICE_REF");
            this.installReceiptSha256 = digest(installReceiptSha256, "INVALID_INSTALL_RECEIPT_HASH");
            this.starterPackId = id(starterPackId, "INVALID_STARTER_PACK_ID");
            if (starterPackVersion == null || !starterPackVersion.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"))
                throw new IllegalArgumentException("INVALID_STARTER_PACK_VERSION");
            this.starterPackVersion = starterPackVersion;
            this.starterPackManifestSha256 = digest(starterPackManifestSha256, "INVALID_STARTER_PACK_HASH");
        }
    }

    /** Evidence adapter must only return this after trusted local installation verification. */
    public static final class InstalledProfileEvidence {
        public final String ownerUserId;
        public final String orderId;
        public final String profileDigest;
        public final String deviceRef;
        public final String installReceiptSha256;
        public final boolean verified;
        public final boolean installedEnabled;

        public InstalledProfileEvidence(String ownerUserId, String orderId, String profileDigest,
                String deviceRef, String installReceiptSha256, boolean verified,
                boolean installedEnabled) {
            this.ownerUserId = id(ownerUserId, "INVALID_EVIDENCE_OWNER");
            this.orderId = id(orderId, "INVALID_EVIDENCE_ORDER");
            this.profileDigest = digest(profileDigest, "INVALID_EVIDENCE_PROFILE");
            this.deviceRef = id(deviceRef, "INVALID_EVIDENCE_DEVICE");
            this.installReceiptSha256 = digest(installReceiptSha256, "INVALID_EVIDENCE_RECEIPT");
            this.verified = verified;
            this.installedEnabled = installedEnabled;
        }
    }

    /** AndroidKeyStore adapter supplies a non-exportable key and its verified public point. */
    public interface Es256DeviceKey {
        String authorityId();
        String keyId();
        boolean hardwareBacked();
        boolean revoked();
        PublicKey publicKey();
        /** Return the ASN.1 DER signature from SHA256withECDSA. */
        byte[] signDer(byte[] message) throws Exception;
    }

    public static final class Receipt {
        public final String authorityId;
        public final String keyId;
        public final String ownerUserId;
        public final String orderId;
        public final String profileDigest;
        public final String challengeId;
        public final String challengeNonceSha256;
        public final String deviceRef;
        public final String installReceiptSha256;
        public final String starterPackId;
        public final String starterPackVersion;
        public final String starterPackManifestSha256;
        public final long observedAt;
        public final long expiresAt;
        public final String signature;

        private Receipt(Challenge challenge, String authorityId, String keyId,
                long observedAt, long expiresAt, String signature) {
            this.authorityId = authorityId;
            this.keyId = keyId;
            this.ownerUserId = challenge.ownerUserId;
            this.orderId = challenge.orderId;
            this.profileDigest = challenge.profileDigest;
            this.challengeId = challenge.challengeId;
            this.challengeNonceSha256 = sha256Hex(challenge.challengeNonce.getBytes(StandardCharsets.UTF_8));
            this.deviceRef = challenge.deviceRef;
            this.installReceiptSha256 = challenge.installReceiptSha256;
            this.starterPackId = challenge.starterPackId;
            this.starterPackVersion = challenge.starterPackVersion;
            this.starterPackManifestSha256 = challenge.starterPackManifestSha256;
            this.observedAt = observedAt;
            this.expiresAt = expiresAt;
            this.signature = signature;
        }

        /** JSON member order intentionally matches the TypeScript canonical signer. */
        public String toJson() {
            return "{\"schema\":\"" + SCHEMA + "\",\"signatureAlgorithm\":\"ES256\","
                + "\"authorityId\":\"" + authorityId + "\",\"keyId\":\"" + keyId + "\","
                + "\"ownerUserId\":\"" + ownerUserId + "\",\"orderId\":\"" + orderId + "\","
                + "\"profileDigest\":\"" + profileDigest + "\",\"challengeId\":\"" + challengeId + "\","
                + "\"challengeNonceSha256\":\"" + challengeNonceSha256 + "\",\"deviceRef\":\"" + deviceRef + "\","
                + "\"installReceiptSha256\":\"" + installReceiptSha256 + "\",\"starterPackId\":\"" + starterPackId + "\","
                + "\"starterPackVersion\":\"" + starterPackVersion + "\",\"starterPackManifestSha256\":\""
                + starterPackManifestSha256 + "\",\"activationState\":\"installed_enabled\","
                + "\"observedAt\":" + observedAt + ",\"expiresAt\":" + expiresAt + ",\"signature\":\""
                + signature + "\"}";
        }
    }

    /** Create a server-verifiable receipt only for matching, locally verified active install evidence. */
    public static Receipt sign(Challenge challenge, InstalledProfileEvidence evidence,
            Es256DeviceKey key, long now) {
        if (challenge == null || evidence == null || key == null || now <= 0)
            throw new IllegalArgumentException("DEVICE_ENTITLEMENT_INPUT_REQUIRED");
        if (!evidence.verified || !evidence.installedEnabled
                || !challenge.ownerUserId.equals(evidence.ownerUserId)
                || !challenge.orderId.equals(evidence.orderId)
                || !challenge.profileDigest.equals(evidence.profileDigest)
                || !challenge.deviceRef.equals(evidence.deviceRef)
                || !challenge.installReceiptSha256.equals(evidence.installReceiptSha256))
            throw new SecurityException("INSTALLED_PROFILE_EVIDENCE_MISMATCH");
        if (!safeId(key.authorityId()) || !safeId(key.keyId()))
            throw new SecurityException("DEVICE_KEY_IDENTITY_INVALID");
        if (key.revoked()) throw new SecurityException("DEVICE_KEY_REVOKED");
        if (!key.hardwareBacked()) throw new SecurityException("DEVICE_KEY_NOT_HARDWARE_BACKED");
        if (challenge.expiresAt <= now) throw new SecurityException("DEVICE_CHALLENGE_EXPIRED");
        PublicKey publicKey = key.publicKey();
        if (!(publicKey instanceof ECPublicKey)) throw new SecurityException("DEVICE_KEY_NOT_P256");
        ECPublicKey ecPublicKey = (ECPublicKey) publicKey;
        if (ecPublicKey.getParams().getCurve().getField().getFieldSize() != 256
                || ecPublicKey.getParams().getOrder().bitLength() != 256)
            throw new SecurityException("DEVICE_KEY_NOT_P256");
        byte[] rawPoint = uncompressedPoint(ecPublicKey);
        if (rawPoint.length != 65 || rawPoint[0] != 4)
            throw new SecurityException("DEVICE_KEY_NOT_P256");

        long receiptExpiresAt = Math.min(challenge.expiresAt, now + MAX_RECEIPT_LIFETIME_MS);
        Receipt unsigned = new Receipt(challenge, key.authorityId(), key.keyId(), now, receiptExpiresAt, "");
        byte[] signedBytes = signingBytes(unsigned);
        try {
            byte[] derSignature = key.signDer(signedBytes);
            byte[] p1363 = derToP1363(derSignature);
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(publicKey);
            verifier.update(signedBytes);
            if (!verifier.verify(derSignature))
                throw new SecurityException("DEVICE_KEY_SIGNATURE_MISMATCH");
            return new Receipt(challenge, key.authorityId(), key.keyId(), now, receiptExpiresAt,
                Base64.getUrlEncoder().withoutPadding().encodeToString(p1363));
        } catch (SecurityException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new SecurityException("DEVICE_RECEIPT_SIGNING_FAILED", failure);
        }
    }

    public static byte[] signingBytes(Receipt receipt) {
        String payload = "{\"schema\":\"" + SCHEMA + "\",\"signatureAlgorithm\":\"ES256\","
            + "\"authorityId\":\"" + receipt.authorityId + "\",\"keyId\":\"" + receipt.keyId + "\","
            + "\"ownerUserId\":\"" + receipt.ownerUserId + "\",\"orderId\":\"" + receipt.orderId + "\","
            + "\"profileDigest\":\"" + receipt.profileDigest + "\",\"challengeId\":\"" + receipt.challengeId + "\","
            + "\"challengeNonceSha256\":\"" + receipt.challengeNonceSha256 + "\",\"deviceRef\":\"" + receipt.deviceRef + "\","
            + "\"installReceiptSha256\":\"" + receipt.installReceiptSha256 + "\",\"starterPackId\":\"" + receipt.starterPackId + "\","
            + "\"starterPackVersion\":\"" + receipt.starterPackVersion + "\",\"starterPackManifestSha256\":\""
            + receipt.starterPackManifestSha256 + "\",\"activationState\":\"installed_enabled\","
            + "\"observedAt\":" + receipt.observedAt + ",\"expiresAt\":" + receipt.expiresAt + "}";
        byte[] payloadBytes = payload.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream(DOMAIN.length + payloadBytes.length);
        output.write(DOMAIN, 0, DOMAIN.length);
        output.write(payloadBytes, 0, payloadBytes.length);
        return output.toByteArray();
    }

    private static byte[] uncompressedPoint(ECPublicKey key) {
        byte[] x = fixed32(key.getW().getAffineX().toByteArray());
        byte[] y = fixed32(key.getW().getAffineY().toByteArray());
        byte[] result = new byte[65];
        result[0] = 4;
        System.arraycopy(x, 0, result, 1, 32);
        System.arraycopy(y, 0, result, 33, 32);
        return result;
    }

    private static byte[] fixed32(byte[] integer) {
        int offset = integer.length == 33 && integer[0] == 0 ? 1 : 0;
        int length = integer.length - offset;
        if (length > 32) throw new SecurityException("DEVICE_KEY_NOT_P256");
        byte[] result = new byte[32];
        System.arraycopy(integer, offset, result, 32 - length, length);
        return result;
    }

    /** Convert Java's ASN.1 ECDSA signature to WebCrypto's fixed-width P1363 form. */
    private static byte[] derToP1363(byte[] der) {
        if (der == null || der.length < 8 || der.length > 72 || der[0] != 0x30 || (der[1] & 0xff) != der.length - 2)
            throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        int cursor = 2;
        if (der[cursor++] != 0x02) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        int rLength = der[cursor++] & 0xff;
        if (rLength < 1 || cursor + rLength + 2 > der.length) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        byte[] r = integer32(Arrays.copyOfRange(der, cursor, cursor + rLength));
        cursor += rLength;
        if (der[cursor++] != 0x02) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        int sLength = der[cursor++] & 0xff;
        if (sLength < 1 || cursor + sLength != der.length) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        byte[] s = integer32(Arrays.copyOfRange(der, cursor, cursor + sLength));
        byte[] result = new byte[64];
        System.arraycopy(r, 0, result, 0, 32);
        System.arraycopy(s, 0, result, 32, 32);
        return result;
    }

    private static byte[] integer32(byte[] value) {
        if ((value[0] & 0x80) != 0) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        int offset = value.length > 1 && value[0] == 0 ? 1 : 0;
        int length = value.length - offset;
        if (length < 1 || length > 32) throw new SecurityException("INVALID_ES256_DER_SIGNATURE");
        byte[] result = new byte[32];
        System.arraycopy(value, offset, result, 32 - length, length);
        return result;
    }

    private static String sha256Hex(byte[] value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder result = new StringBuilder(64);
            for (byte item : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
            return result.toString();
        } catch (Exception impossible) { throw new IllegalStateException("SHA256_UNAVAILABLE", impossible); }
    }

    private static String digest(String value, String error) {
        if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException(error);
        return value;
    }

    private static String id(String value, String error) {
        if (!safeId(value)) throw new IllegalArgumentException(error);
        return value;
    }

    private static boolean safeId(String value) {
        return value != null && value.matches("[A-Za-z0-9._:-]{1,160}");
    }
}
