package dev.rock.automation;

import android.os.Build;
import androidx.test.platform.app.InstrumentationRegistry;
import java.security.KeyStore;
import java.security.ProviderException;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.Set;
import org.junit.function.ThrowingRunnable;
import static org.junit.Assert.*;

/** Test target is explicit; the default retains physical hardware acceptance requirements. */
final class DeviceAcceptance {
    static boolean emulator() {
        String target = InstrumentationRegistry.getArguments().getString("rockAcceptanceTarget", "physical");
        if (!"emulator".equals(target)) {
            assertEquals("physical", target);
            return false;
        }
        assertTrue("emulator profile requires an actual Android emulator",
            Set.of("ranchu", "goldfish").contains(Build.HARDWARE));
        return true;
    }

    static void assertHardwareProvisioningRejected(String prefix, String rejection, ThrowingRunnable provision)
            throws Exception {
        Set<String> before = aliases(prefix);
        Exception failure = assertThrows(Exception.class, provision);
        boolean unsupportedAttestation = failure instanceof ProviderException
            && failure.getCause() instanceof android.security.KeyStoreException;
        assertTrue("only the hardware gate or Android attestation provider may reject provisioning",
            (failure instanceof SecurityException && rejection.equals(failure.getMessage())) || unsupportedAttestation);
        assertEquals("rejected provisioning must not leave a usable Broker key", before, aliases(prefix));
        System.out.println("HARDWARE_KEY_ACCEPTANCE=EMULATOR_REJECTED_NOT_PHYSICAL_ACCEPTANCE");
    }

    private static Set<String> aliases(String prefix) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        Set<String> result = new HashSet<>();
        Enumeration<String> aliases = store.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            if (alias.startsWith(prefix)) result.add(alias);
        }
        return result;
    }
}
