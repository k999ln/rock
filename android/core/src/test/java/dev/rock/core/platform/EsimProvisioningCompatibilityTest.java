package dev.rock.core.platform;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public final class EsimProvisioningCompatibilityTest {
    @Test public void deviceOwnerCanUseManagedSubscriptionAndAutomaticEnablementFromAndroid15() {
        EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(35, true, false, false, true);
        assertEquals("eligible", result.managedSubscriptionManagement);
        assertEquals("eligible", result.automaticProfileEnablement);
        assertEquals("true", result.organizationOwnedDevice);
    }

    @Test public void organizationOwnedProfileOwnerCanAutomaticallyEnableProfile() {
        EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(35, false, true, false, true);
        assertEquals("eligible", result.managedSubscriptionManagement);
        assertEquals("eligible", result.automaticProfileEnablement);
    }

    @Test public void personalProfileOwnerCanManageButMustNotAutoEnable() {
        EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(35, false, true, false, false);
        assertEquals("eligible", result.managedSubscriptionManagement);
        assertEquals("not_eligible", result.automaticProfileEnablement);
        assertEquals("false", result.organizationOwnedDevice);
    }

    @Test public void unmanagedClientAndOlderAndroidCannotClaimManagedInstallation() {
        EsimProvisioningCompatibility client = EsimProvisioningCompatibility.classify(35, false, false, false, false);
        assertEquals("not_eligible", client.managedSubscriptionManagement);
        assertEquals("not_eligible", client.automaticProfileEnablement);
        EsimProvisioningCompatibility oldApi = EsimProvisioningCompatibility.classify(34, true, false, false, true);
        assertEquals("unsupported", oldApi.managedSubscriptionManagement);
        assertEquals("unsupported", oldApi.automaticProfileEnablement);
    }

    @Test public void unknownOrganizationOwnershipNeverBecomesAutomaticEnablement() {
        EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(35, false, true, false, null);
        assertEquals("eligible", result.managedSubscriptionManagement);
        assertEquals("unknown", result.automaticProfileEnablement);
        assertEquals("unknown", result.organizationOwnedDevice);
    }

    @Test public void specialManagedSubscriptionPermissionDoesNotImplyAutomaticEnablement() {
        EsimProvisioningCompatibility result = EsimProvisioningCompatibility.classify(35, false, false, true, null);
        assertEquals("eligible", result.managedSubscriptionManagement);
        assertEquals("not_eligible", result.automaticProfileEnablement);
        assertEquals("unknown", result.organizationOwnedDevice);
    }
}
