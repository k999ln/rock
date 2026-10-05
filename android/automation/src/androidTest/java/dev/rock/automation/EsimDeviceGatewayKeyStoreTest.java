package dev.rock.automation;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.platform.EsimDeviceEntitlement;
import java.security.SecureRandom;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Physical-device acceptance for the AndroidKeyStore-backed eSIM receipt key. */
@RunWith(AndroidJUnit4.class)
public final class EsimDeviceGatewayKeyStoreTest {
    @Test public void hardwareP256KeySignsReceiptAndRetirementBlocksFurtherSigning() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        byte[] attestationChallenge = new byte[32];
        new SecureRandom().nextBytes(attestationChallenge);
        EsimDeviceGatewayKeyStore key = EsimDeviceGatewayKeyStore.provision(
            context, attestationChallenge, false);
        try {
            EsimDeviceGatewayKeyStore resumed = EsimDeviceGatewayKeyStore.provision(
                context, attestationChallenge, false);
            assertTrue("same server nonce resumes the existing non-exportable key",
                resumed.resumedFromExistingAlias());
            assertEquals(key.keyId(), resumed.keyId());
            assertTrue(key.hardwareBacked());
            assertEquals(65, key.rawPublicKey().length);
            assertEquals(4, key.rawPublicKey()[0]);
            assertEquals(key.keyId(), hex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(key.rawPublicKey())));
            assertTrue("attestation chain must be available for server/OEM verification",
                key.attestationChainDer().length >= 2);
            assertTrue(EsimDeviceGatewayKeyStore.open(context, key.authorityId(), key.keyId())
                .hardwareBacked());
            assertTrue(key.attestationChainDerBase64Url().get(0).matches("[A-Za-z0-9_-]+"));

            long now = System.currentTimeMillis();
            String digestA = repeat('a');
            String digestB = repeat('b');
            String digestC = repeat('c');
            EsimDeviceEntitlement.Challenge challenge = new EsimDeviceEntitlement.Challenge(
                "android-owner", "android-order", digestA, UUID.randomUUID().toString(),
                "n".repeat(43), now + 60_000, "android-device", digestB,
                "lifeline", "1.0.0", digestC);
            EsimDeviceEntitlement.InstalledProfileEvidence fixtureEvidence =
                new EsimDeviceEntitlement.InstalledProfileEvidence("android-owner", "android-order",
                    digestA, "android-device", digestB, true, true);
            EsimDeviceEntitlement.Receipt receipt = EsimDeviceEntitlement.sign(
                challenge, fixtureEvidence, key, now);
            assertTrue(receipt.toJson().contains("\"signatureAlgorithm\":\"ES256\""));
            assertTrue(receipt.toJson().contains("\"activationState\":\"installed_enabled\""));
            assertEquals(64, java.util.Base64.getUrlDecoder().decode(receipt.signature).length);

            key.retire();
            assertTrue(key.revoked());
            assertThrows(SecurityException.class, () -> key.signDer(new byte[] { 1 }));
        } finally {
            if (!key.revoked()) key.retire();
            java.util.Arrays.fill(attestationChallenge, (byte) 0);
        }
    }

    private static String repeat(char value) { return String.valueOf(value).repeat(64); }
    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return result.toString();
    }
}
