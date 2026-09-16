package dev.rock.operator.agent;

import android.content.Context;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class OperatorAgentConfig {
    static final Set<String> ACTIONS = Set.of(
            "lock_device", "enter_lost_mode", "stop_sky_and_zema_execution",
            "revoke_active_sessions", "pause_ota_installation",
            "quarantine_external_connections", "collect_sanitized_diagnostics",
            "open_limited_maintenance_session", "resume_sky_and_zema_execution",
            "resume_ota_installation", "release_external_quarantine",
            "close_limited_maintenance_session", "exit_lost_mode",
            "request_factory_reset");

    final String dockOrigin;
    final String credentialId;
    final String operatorPublicKeySpki;
    final String rpId;
    final String webAuthnOrigin;
    final List<String> quarantinePackages;
    final String deviceAttestationChallenge;
    final boolean factoryResetEnabled;
    final boolean hardwareIdentityRequired;

    OperatorAgentConfig(String dockOrigin, String credentialId, String operatorPublicKeySpki,
                        String rpId, String webAuthnOrigin, List<String> quarantinePackages,
                        boolean factoryResetEnabled) {
        this(dockOrigin, credentialId, operatorPublicKeySpki, rpId, webAuthnOrigin,
                quarantinePackages, factoryResetEnabled, false, "");
    }

    OperatorAgentConfig(String dockOrigin, String credentialId, String operatorPublicKeySpki,
                        String rpId, String webAuthnOrigin, List<String> quarantinePackages,
                        boolean factoryResetEnabled, boolean hardwareIdentityRequired) {
        this(dockOrigin, credentialId, operatorPublicKeySpki, rpId, webAuthnOrigin,
                quarantinePackages, factoryResetEnabled, hardwareIdentityRequired, "");
    }

    OperatorAgentConfig(String dockOrigin, String credentialId, String operatorPublicKeySpki,
                        String rpId, String webAuthnOrigin, List<String> quarantinePackages,
                        boolean factoryResetEnabled, boolean hardwareIdentityRequired,
                        String deviceAttestationChallenge) {
        this.dockOrigin = dockOrigin;
        this.credentialId = credentialId;
        this.operatorPublicKeySpki = operatorPublicKeySpki;
        this.rpId = rpId;
        this.webAuthnOrigin = webAuthnOrigin;
        this.quarantinePackages = Collections.unmodifiableList(new ArrayList<>(quarantinePackages));
        this.factoryResetEnabled = factoryResetEnabled;
        this.hardwareIdentityRequired = hardwareIdentityRequired;
        this.deviceAttestationChallenge = deviceAttestationChallenge;
    }

    static OperatorAgentConfig load(Context context) {
        String packages = context.getString(R.string.operator_quarantine_packages).trim();
        List<String> quarantine = new ArrayList<>();
        if (!packages.isEmpty()) {
            for (String item : packages.split(",", -1)) {
                String value = item.trim();
                if (!value.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+"))
                    throw new IllegalStateException("Invalid quarantine package allowlist");
                if (value.startsWith("dev.rock.") || value.equals("com.localactionassistant"))
                    throw new IllegalStateException("Product packages cannot be quarantined");
                if (!quarantine.contains(value)) quarantine.add(value);
            }
        }
        return new OperatorAgentConfig(
                context.getString(R.string.operator_dock_origin).trim(),
                context.getString(R.string.operator_credential_id).trim(),
                context.getString(R.string.operator_public_key_spki).trim(),
                context.getString(R.string.operator_rp_id).trim(),
                context.getString(R.string.operator_webauthn_origin).trim(),
                quarantine,
                context.getResources().getBoolean(R.bool.operator_factory_reset_enabled),
                context.getResources().getBoolean(R.bool.operator_hardware_identity_required),
                context.getString(R.string.operator_device_attestation_challenge).trim());
    }

    boolean isConfigured() {
        if (dockOrigin.isEmpty() || credentialId.isEmpty() || operatorPublicKeySpki.isEmpty()
                || rpId.isEmpty() || webAuthnOrigin.isEmpty()) return false;
        if (hardwareIdentityRequired) {
            try {
                byte[] challenge = OperatorCommandVerifier.decode(deviceAttestationChallenge, 32);
                if (challenge.length != 32) return false;
                int combined = 0;
                for (byte value : challenge) combined |= value;
                if (combined == 0) return false;
            } catch (SecurityException exception) {
                return false;
            }
        }
        try {
            URI dock = URI.create(dockOrigin);
            URI webAuthn = URI.create(webAuthnOrigin);
            return isExactHttpsOrigin(dock, dockOrigin)
                    && isExactHttpsOrigin(webAuthn, webAuthnOrigin)
                    && dockOrigin.equals(webAuthnOrigin)
                    && rpId.equals(dock.getHost());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean isExactHttpsOrigin(URI uri, String source) {
        if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null
                || uri.getHost() == null
                || !uri.getHost().equals(uri.getHost().toLowerCase(Locale.ROOT))
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty())
                || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
        String canonical = "https://" + uri.getHost() + (uri.getPort() == 443 ? ":443" : "");
        return canonical.equals(source);
    }
}
