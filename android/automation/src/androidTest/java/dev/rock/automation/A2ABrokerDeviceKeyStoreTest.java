package dev.rock.automation;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.platform.A2AWalletHandoffRequest;
import java.security.Signature;
import java.util.UUID;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Supported-device acceptance: this must pass on exact SKU/OS before enabling Broker trust. */
@RunWith(AndroidJUnit4.class)
public final class A2ABrokerDeviceKeyStoreTest {
    @Test public void attestedHardwareP256KeySignsCloudCompatibleHandoffAndReopens() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        byte[] challenge = new byte[32];
        new java.security.SecureRandom().nextBytes(challenge);
        A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.provision(context, challenge, false);
        try {
            assertTrue(key.hardwareBacked());
            assertTrue(key.attestationChainDerBase64Url().size() >= 2);
            String keyId = key.keyId();
            byte[] raw = key.rawPublicKey();
            assertEquals(65, raw.length);
            assertEquals(4, raw[0]);

            long now = System.currentTimeMillis();
            java.util.Map<String,Object> request = A2AWalletHandoffRequest.create(
                "rock-authority", "owner-device-test", "pixel-test-device",
                "123e4567-e89b-42d3-a456-426614174000", UUID.randomUUID().toString(),
                now, keyId, now, key);
            Signature verifier = Signature.getInstance("SHA256withECDSA");
            verifier.initVerify(java.security.KeyFactory.getInstance("EC").generatePublic(
                new java.security.spec.X509EncodedKeySpec(key.subjectPublicKeyInfo())));
            verifier.update(A2AWalletHandoffRequest.signingBytes(unsigned(request)));
            assertTrue(verifier.verify(p1363ToDer(java.util.Base64.getUrlDecoder().decode((String) request.get("signature")))));

            A2ABrokerDeviceKeyStore reopened = A2ABrokerDeviceKeyStore.open(context, keyId);
            assertArrayEquals(raw, reopened.rawPublicKey());
            assertTrue(reopened.hardwareBacked());
        } finally {
            key.retire();
        }
    }

    @Test public void serverConfirmedRevocationCanIdempotentlyRetireOnlyMatchingLocalKey() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        byte[] challenge = new byte[32]; new java.security.SecureRandom().nextBytes(challenge);
        A2ABrokerDeviceKeyStore key = A2ABrokerDeviceKeyStore.provision(context, challenge, false);
        String keyId = key.keyId();
        A2ABrokerDeviceKeyStore.retire(context, keyId);
        A2ABrokerDeviceKeyStore.retire(context, keyId);
        try {
            A2ABrokerDeviceKeyStore.open(context, keyId);
            fail("revoked local key must not reopen");
        } catch (IllegalStateException expected) {
            assertEquals("A2A_BROKER_KEY_NOT_PROVISIONED", expected.getMessage());
        }
    }

    private static byte[] p1363ToDer(byte[] signature) {
        assertEquals(64, signature.length);
        byte[] r = integer(signature, 0), s = integer(signature, 32);
        byte[] result = new byte[6 + r.length + s.length];
        int offset = 0;
        result[offset++] = 0x30; result[offset++] = (byte) (result.length - 2);
        result[offset++] = 0x02; result[offset++] = (byte) r.length;
        System.arraycopy(r, 0, result, offset, r.length); offset += r.length;
        result[offset++] = 0x02; result[offset++] = (byte) s.length;
        System.arraycopy(s, 0, result, offset, s.length);
        return result;
    }

    private static byte[] integer(byte[] signature, int offset) {
        int start = offset;
        while (start < offset + 31 && signature[start] == 0) start++;
        boolean pad = (signature[start] & 0x80) != 0;
        byte[] result = new byte[offset + 32 - start + (pad ? 1 : 0)];
        System.arraycopy(signature, start, result, pad ? 1 : 0, offset + 32 - start);
        return result;
    }

    private static java.util.Map<String,Object> unsigned(java.util.Map<String,Object> request) {
        java.util.Map<String,Object> result = new java.util.LinkedHashMap<>(request);
        result.remove("signature");
        return result;
    }
}
