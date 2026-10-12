package dev.rock.operator.agent;

import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

final class OperatorCommandVerifier {
    interface Clock { long now(); }
    static final class Verified {
        final String payloadSha256;
        final long signCount;
        Verified(String payloadSha256, long signCount) {
            this.payloadSha256 = payloadSha256;
            this.signCount = signCount;
        }
    }

    private final OperatorAgentConfig config;
    private final Clock clock;

    OperatorCommandVerifier(OperatorAgentConfig config, Clock clock) {
        this.config = config;
        this.clock = clock;
    }

    Verified verify(SignedOperatorCommand command, String expectedDeviceId) throws Exception {
        if (!config.isConfigured()) throw new SecurityException("Agent trust anchors are not configured");
        if (!MessageDigest.isEqual(command.deviceId.getBytes(StandardCharsets.UTF_8),
                expectedDeviceId.getBytes(StandardCharsets.UTF_8)))
            throw new SecurityException("Command targets another device");
        if (!constantEquals(command.operatorCredentialId, config.credentialId))
            throw new SecurityException("Operator credential mismatch");

        long now = clock.now();
        boolean reset = command.action.equals("request_factory_reset");
        long expectedNotBefore = Math.addExact(command.issuedAt, reset ? 1_800_000L : 0L);
        long expectedExpires = Math.addExact(command.issuedAt, reset ? 3_600_000L : 900_000L);
        if (command.notBefore != expectedNotBefore || command.expiresAt != expectedExpires
                || command.issuedAt > now + 120_000L || command.expiresAt <= now)
            throw new SecurityException("Command time window rejected");

        byte[] canonical = command.canonicalBytes();
        byte[] challenge = sha256(canonical);
        String payloadSha = encode(challenge);
        if (!constantEquals(payloadSha, command.signedPayloadSha256))
            throw new SecurityException("Payload digest mismatch");

        byte[] authenticatorData = decode(command.authenticatorData, 1024);
        byte[] clientDataBytes = decode(command.clientDataJSON, 4096);
        byte[] signatureBytes = decode(command.operatorSignature, 256);
        if (authenticatorData.length < 37) throw new SecurityException("Authenticator data too short");
        if (!MessageDigest.isEqual(sha256(config.rpId.getBytes(StandardCharsets.UTF_8)),
                slice(authenticatorData, 0, 32)))
            throw new SecurityException("RP ID mismatch");
        int flags = authenticatorData[32] & 0xff;
        if ((flags & 0x01) == 0 || (flags & 0x04) == 0)
            throw new SecurityException("User presence and verification required");

        JSONObject client = new JSONObject(new String(clientDataBytes, StandardCharsets.UTF_8));
        Set<String> clientFields = new HashSet<>();
        client.keys().forEachRemaining(clientFields::add);
        if (!Set.of("type", "challenge", "origin", "crossOrigin").containsAll(clientFields)
                || !"webauthn.get".equals(client.optString("type"))
                || !payloadSha.equals(client.optString("challenge"))
                || !config.webAuthnOrigin.equals(client.optString("origin"))
                || client.optBoolean("crossOrigin", false))
            throw new SecurityException("WebAuthn client data mismatch");

        byte[] signed = new byte[authenticatorData.length + 32];
        System.arraycopy(authenticatorData, 0, signed, 0, authenticatorData.length);
        System.arraycopy(sha256(clientDataBytes), 0, signed, authenticatorData.length, 32);
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(
                new X509EncodedKeySpec(decode(config.operatorPublicKeySpki, 1024)));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(key);
        verifier.update(signed);
        if (!verifier.verify(signatureBytes)) throw new SecurityException("Operator signature rejected");
        long signCount = Integer.toUnsignedLong(ByteBuffer.wrap(authenticatorData, 33, 4).getInt());
        return new Verified(payloadSha, signCount);
    }

    static String payloadSha256(SignedOperatorCommand command) throws Exception {
        return encode(sha256(command.canonicalBytes()));
    }

    static byte[] sha256(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    static byte[] decode(String value, int maximum) {
        if (value == null || !value.matches("[A-Za-z0-9_-]+"))
            throw new SecurityException("Invalid base64url");
        try {
            byte[] decoded = Base64.decode(value, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            if (decoded.length == 0 || decoded.length > maximum)
                throw new SecurityException("Invalid base64url length");
            return decoded;
        } catch (IllegalArgumentException exception) {
            throw new SecurityException("Invalid base64url", exception);
        }
    }

    private static byte[] slice(byte[] value, int offset, int length) {
        byte[] result = new byte[length];
        System.arraycopy(value, offset, result, 0, length);
        return result;
    }

    private static boolean constantEquals(String left, String right) {
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8),
                right.getBytes(StandardCharsets.UTF_8));
    }
}
