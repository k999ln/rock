package si.avoado.noah.participant;

import android.content.Context;
import android.net.*;
import android.os.*;

final class DeviceConditions {
    private final PowerManager power;
    private final BatteryManager battery;
    private final ConnectivityManager connections;
    private long measured = -20_000;
    private float thermalHeadroom = Float.NaN;

    DeviceConditions(Context context) {
        power = context.getSystemService(PowerManager.class);
        battery = context.getSystemService(BatteryManager.class);
        connections = context.getSystemService(ConnectivityManager.class);
    }
    synchronized Network allowedNetwork() {
        if (power == null || battery == null || connections == null || !battery.isCharging()
                || power.isPowerSaveMode() || !power.isInteractive()
                || power.getCurrentThermalStatus() != PowerManager.THERMAL_STATUS_NONE) return null;
        long now = SystemClock.elapsedRealtime();
        // Android reports NaN for unsupported sensors and for sampling more often than every 10s.
        if (now - measured >= 11_000) {
            thermalHeadroom = power.getThermalHeadroom(0);
            measured = now;
        }
        if (!Float.isFinite(thermalHeadroom) || thermalHeadroom < 0 || thermalHeadroom >= 0.70f) return null;
        Network network = connections.getActiveNetwork();
        NetworkCapabilities caps = connections.getNetworkCapabilities(network);
        if (caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                || !(caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) return null;
        return network;
    }
}
