package dev.rock.automation;

import android.app.Application;
import dev.rock.core.Engine;
import dev.rock.core.platform.A2AUsageReceiptVerifier;
import dev.rock.core.platform.PlatformStore;
import java.util.List;

public final class RockApplication extends Application {
    private AndroidDatabase database;
    private Engine engine;
    private PlatformStore platform;
    private boolean a2aProviderUsageTrustConfigured;
    private boolean a2aProviderUsageTrustConfigurationValid;

    private synchronized AndroidDatabase database() {
        if (database == null) database = new AndroidDatabase(this);
        return database;
    }

    public synchronized Engine engine() {
        if (engine == null) engine = new Engine(database());
        return engine;
    }

    public synchronized PlatformStore platform() {
        if (platform == null) {
            A2AUsageReceiptVerifier receiptVerifier;
            try {
                receiptVerifier = AndroidA2AUsageTrustConfig.verifier(BuildConfig.A2A_PROVIDER_USAGE_KEYS_JSON);
                a2aProviderUsageTrustConfigurationValid = true;
            } catch (IllegalArgumentException invalidConfiguration) {
                // A bad optional Provider trust inventory must not prevent unrelated OS use.
                // Wallet receipt application stays disabled until the build is corrected.
                receiptVerifier = new A2AUsageReceiptVerifier(List.of());
                a2aProviderUsageTrustConfigurationValid = false;
            }
            a2aProviderUsageTrustConfigured = receiptVerifier.hasTrustedKeys();
            platform = new PlatformStore(database(), receiptVerifier);
        }
        return platform;
    }

    public synchronized boolean a2aProviderUsageTrustConfigured() {
        if (platform == null) platform();
        return a2aProviderUsageTrustConfigurationValid && a2aProviderUsageTrustConfigured;
    }

    public synchronized boolean a2aProviderUsageTrustConfigurationValid() {
        if (platform == null) platform();
        return a2aProviderUsageTrustConfigurationValid;
    }
}
