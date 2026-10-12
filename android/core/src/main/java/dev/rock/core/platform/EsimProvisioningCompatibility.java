package dev.rock.core.platform;

/** Classifies Android 15 managed-eSIM authority without implying profile or plan compatibility. */
public final class EsimProvisioningCompatibility {
    public final String managedSubscriptionManagement;
    public final String automaticProfileEnablement;
    public final String organizationOwnedDevice;

    private EsimProvisioningCompatibility(String managed, String automatic, String organizationOwned) {
        this.managedSubscriptionManagement = managed;
        this.automaticProfileEnablement = automatic;
        this.organizationOwnedDevice = organizationOwned;
    }

    public static EsimProvisioningCompatibility classify(int apiLevel, boolean deviceOwner,
            boolean profileOwner, boolean managedSubscriptionsPermission, Boolean organizationOwned) {
        if (apiLevel < 35) return new EsimProvisioningCompatibility("unsupported", "unsupported", "unknown");
        if (deviceOwner) return new EsimProvisioningCompatibility("eligible", "eligible", "true");
        if (profileOwner) {
            if (organizationOwned == null)
                return new EsimProvisioningCompatibility("eligible", "unknown", "unknown");
            return new EsimProvisioningCompatibility("eligible",
                organizationOwned ? "eligible" : "not_eligible", organizationOwned ? "true" : "false");
        }
        if (managedSubscriptionsPermission)
            return new EsimProvisioningCompatibility("eligible", "not_eligible",
                organizationOwned == null ? "unknown" : organizationOwned ? "true" : "false");
        return new EsimProvisioningCompatibility("not_eligible", "not_eligible",
            organizationOwned == null ? "unknown" : organizationOwned ? "true" : "false");
    }
}
