package dev.rock.automation;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import dev.rock.core.platform.A2AUsageReceiptVerifier;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class AndroidA2AUsageTrustConfigTest {
    private static final String PUBLIC_KEY = "11qYAYKxsvrXVO/L08S+Ov7hc/2qYjIwrwIaaPcHURI=";
    private static final String KEY = "{\"providerId\":\"provider-x\",\"keyId\":\"usage-key-1\",\"agentOrigin\":\"https://agent.example\",\"publicKeyBase64\":\"" + PUBLIC_KEY + "\",\"revoked\":false}";

    @Test public void emptyInventoryIsValidButHasNoTrustedProviderKeys() {
        assertFalse(AndroidA2AUsageTrustConfig.verifier("[]").hasTrustedKeys());
    }

    @Test public void exactOperatorTrustTupleIsAcceptedAndRevocationRemovesActiveTrust() {
        assertTrue(AndroidA2AUsageTrustConfig.verifier("[" + KEY + "]").hasTrustedKeys());
        String revoked = KEY.replace("false}", "true}");
        assertFalse(AndroidA2AUsageTrustConfig.verifier("[" + revoked + "]").hasTrustedKeys());
    }

    @Test public void malformedOrSelfExtendedTrustRowsAreRejected() {
        assertThrows(IllegalArgumentException.class,
            () -> AndroidA2AUsageTrustConfig.verifier("[{\"providerId\":\"provider-x\"}]"));
        assertThrows(IllegalArgumentException.class,
            () -> AndroidA2AUsageTrustConfig.verifier("[" + KEY.replace("\"revoked\":false", "\"revoked\":false,\"trusted\":true") + "]"));
        assertThrows(IllegalArgumentException.class,
            () -> AndroidA2AUsageTrustConfig.verifier("[" + KEY + "," + KEY + "]"));
        assertThrows(IllegalArgumentException.class,
            () -> AndroidA2AUsageTrustConfig.verifier("[" + KEY.replace(PUBLIC_KEY, "AQ==") + "]"));
    }
}
