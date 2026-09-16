package dev.rock.operator.agent;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.List;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class OperatorAgentIntegrationTest {
    private Context context;
    private KeyPair operator;
    private String credentialId;
    private String rpId;
    private String origin;
    private String deviceId;
    private long now;
    private OperatorAgentConfig config;

    @Before public void setup() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        context.deleteDatabase("operator-agent.db");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        operator = generator.generateKeyPair();
        credentialId = OperatorCommandVerifier.encode("credential-1".getBytes(StandardCharsets.UTF_8));
        rpId = "operator.avocado.test";
        origin = "https://operator.avocado.test";
        deviceId = UUID.randomUUID().toString();
        now = 1_789_600_000_000L;
        config = new OperatorAgentConfig(origin, credentialId,
                OperatorCommandVerifier.encode(operator.getPublic().getEncoded()), rpId, origin,
                List.of(), false);
    }

    @Test public void independentlyVerifiesExactWebAuthnCommand() throws Exception {
        SignedOperatorCommand command = signed("lock_device", now, now, now + 900_000L, 7);
        OperatorCommandVerifier.Verified verified =
                new OperatorCommandVerifier(config, () -> now + 1_000L).verify(command, deviceId);
        assertEquals(command.signedPayloadSha256, verified.payloadSha256);
        assertEquals(7L, verified.signCount);

        JSONObject altered = json(command).put("action", "pause_ota_installation");
        SignedOperatorCommand changed = SignedOperatorCommand.parse(altered);
        assertThrows(SecurityException.class, () ->
                new OperatorCommandVerifier(config, () -> now).verify(changed, deviceId));
        assertThrows(SecurityException.class, () ->
                new OperatorCommandVerifier(config, () -> now).verify(command, UUID.randomUUID().toString()));
    }

    @Test public void rejectsExpiredAndInvalidResetWindows() throws Exception {
        SignedOperatorCommand expired = signed("lock_device", now, now, now + 900_000L, 8);
        assertThrows(SecurityException.class, () ->
                new OperatorCommandVerifier(config, () -> now + 900_001L).verify(expired, deviceId));
        SignedOperatorCommand badReset = signed("request_factory_reset", now,
                now + 1_000L, now + 3_600_000L, 9);
        assertThrows(SecurityException.class, () ->
                new OperatorCommandVerifier(config, () -> now).verify(badReset, deviceId));
    }

    @Test public void persistsReplayAndMonotonicCounterBoundaries() throws Exception {
        OperatorAgentDatabase database = new OperatorAgentDatabase(context);
        SignedOperatorCommand first = signed("lock_device", now, now, now + 900_000L, 10);
        OperatorCommandVerifier verifier = new OperatorCommandVerifier(config, () -> now);
        assertTrue(database.stageVerified(first, verifier.verify(first, deviceId), now));
        assertFalse(database.stageVerified(first, verifier.verify(first, deviceId), now));

        SignedOperatorCommand lower = signed("pause_ota_installation", now + 1,
                now + 1, now + 900_001L, 9);
        assertThrows(SecurityException.class, () ->
                database.stageVerified(lower, verifier.verify(lower, deviceId), now + 1));
        database.close();
    }

    @Test public void deviceIdentityIsStableAndSignsWithoutExportingPrivateKey() throws Exception {
        DeviceIdentity first = new DeviceIdentity();
        DeviceIdentity second = new DeviceIdentity();
        assertEquals(first.deviceId(), second.deviceId());
        assertArrayEquals(first.publicKeySpki(), second.publicKeySpki());
        byte[] message = "device-request".getBytes(StandardCharsets.UTF_8);
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(java.security.KeyFactory.getInstance("EC").generatePublic(
                new java.security.spec.X509EncodedKeySpec(first.publicKeySpki())));
        verifier.update(message);
        assertTrue(verifier.verify(first.sign(message)));
    }

    @Test public void factoryResetFailsClosedWithoutDeviceOwner() throws Exception {
        SignedOperatorCommand reset = signed("request_factory_reset", now,
                now + 1_800_000L, now + 3_600_000L, 11);
        OperatorCommandExecutor.Result result =
                new OperatorCommandExecutor(context, config).execute(reset, now + 1_800_000L);
        assertEquals("failed", result.status);
        assertEquals("DEVICE_OWNER_REQUIRED", result.code);
        assertNotNull(result.details);
    }

    private SignedOperatorCommand signed(String action, long issuedAt, long notBefore,
                                         long expiresAt, int signCount) throws Exception {
        JSONObject unsigned = base(action, issuedAt, notBefore, expiresAt);
        SignedOperatorCommand placeholder = SignedOperatorCommand.parse(unsigned
                .put("authenticatorData", "AA").put("clientDataJSON", "AA")
                .put("operatorSignature", "AA").put("signedPayloadSha256", "AA"));
        String challenge = OperatorCommandVerifier.payloadSha256(placeholder);
        byte[] auth = new byte[37];
        System.arraycopy(OperatorCommandVerifier.sha256(rpId.getBytes(StandardCharsets.UTF_8)),
                0, auth, 0, 32);
        auth[32] = 0x05;
        ByteBuffer.wrap(auth, 33, 4).putInt(signCount);
        byte[] client = new JSONObject().put("type", "webauthn.get")
                .put("challenge", challenge).put("origin", origin)
                .put("crossOrigin", false).toString().getBytes(StandardCharsets.UTF_8);
        byte[] signed = new byte[auth.length + 32];
        System.arraycopy(auth, 0, signed, 0, auth.length);
        System.arraycopy(OperatorCommandVerifier.sha256(client), 0, signed, auth.length, 32);
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(operator.getPrivate());
        signer.update(signed);
        return SignedOperatorCommand.parse(unsigned
                .put("authenticatorData", OperatorCommandVerifier.encode(auth))
                .put("clientDataJSON", OperatorCommandVerifier.encode(client))
                .put("operatorSignature", OperatorCommandVerifier.encode(signer.sign()))
                .put("signedPayloadSha256", challenge));
    }

    private JSONObject base(String action, long issuedAt, long notBefore, long expiresAt)
            throws Exception {
        return new JSONObject().put("id", UUID.randomUUID().toString()).put("deviceId", deviceId)
                .put("incidentId", "INC-100").put("action", action).put("reason", "device protection")
                .put("status", action.equals("request_factory_reset") ? "scheduled" : "queued")
                .put("issuedAt", issuedAt).put("notBefore", notBefore).put("expiresAt", expiresAt)
                .put("operatorCredentialId", credentialId);
    }

    private static JSONObject json(SignedOperatorCommand command) throws Exception {
        return new JSONObject().put("id", command.id).put("deviceId", command.deviceId)
                .put("incidentId", command.incidentId).put("action", command.action)
                .put("reason", command.reason).put("status", command.status)
                .put("issuedAt", command.issuedAt).put("notBefore", command.notBefore)
                .put("expiresAt", command.expiresAt)
                .put("operatorCredentialId", command.operatorCredentialId)
                .put("authenticatorData", command.authenticatorData)
                .put("clientDataJSON", command.clientDataJSON)
                .put("operatorSignature", command.operatorSignature)
                .put("signedPayloadSha256", command.signedPayloadSha256);
    }
}
