package dev.rock.automation;

import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import dev.rock.core.platform.ComponentManifest;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.core.platform.PlatformApi;
import dev.rock.core.platform.PlatformStore;
import dev.rock.core.platform.ResumableModelArtifactStager;
import dev.rock.core.platform.RuntimeManifest;
import dev.rock.sdk.ZemaToolPlan;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Explicit owner import of one catalog-pinned weight, through existing authenticated API v4. */
final class LocalModelInstaller {
    private final Context context;
    private final PlatformStore platform;
    LocalModelInstaller(Context context, PlatformStore platform) { this.context = context; this.platform = platform; }

    LocalModelCatalog catalog() throws Exception {
        try (InputStream input = context.getAssets().open(LocalModelCatalog.ASSET)) {
            byte[] bytes = input.readNBytes(32769);
            if (bytes.length > 32768) throw new SecurityException("MODEL_CATALOG_TOO_LARGE");
            return new LocalModelCatalog(new String(bytes, StandardCharsets.UTF_8));
        }
    }

    String catalogJson() throws Exception {
        ModelProfileManifest active = platform.activeModelProfile();
        JSONArray entries = new JSONArray();
        for (LocalModelCatalog.Entry entry : catalog().entries.values()) {
            ModelProfileManifest p = entry.profile;
            entries.put(new JSONObject().put("profileId", p.profileId).put("name", entry.name).put("fileName", entry.fileName)
                .put("source", entry.source).put("licenseUrl", entry.licenseUrl).put("licenseId", p.licenseId)
                .put("bytes", p.artifactBytes).put("sha256", p.weightsSha256).put("trustLabel", entry.trustLabel)
                .put("manifestDigest", p.digest()).put("version", p.version).put("tasks", new JSONArray(entry.tasks)).put("autoPriority", entry.autoPriority)
                .put("cached", LocalModelChoice.cached(context, p)).put("licenseAccepted", LocalModelChoice.accepted(context, p))
                .put("activeProfile", active != null && p.digest().equals(active.digest())));
        }
        return new JSONObject().put("models", entries).put("activeProfileId", active == null ? JSONObject.NULL : active.profileId)
            .put("automaticLoad", false).put("networkDownload", "explicit_wifi_only_signed_catalog").toString();
    }

    String install(String profileId, ParcelFileDescriptor source, boolean consent) throws Exception {
        if (source == null) throw new SecurityException("MODEL_FILE_REQUIRED");
        return activate(profileId, source, consent);
    }

    String reloadAccepted(String profileId) throws Exception {
        ModelProfileManifest profile = catalog().require(profileId).profile;
        if (!LocalModelChoice.accepted(context, profile)) throw new SecurityException("MODEL_LICENSE_CONSENT_REQUIRED");
        return activate(profileId, null, true);
    }

    String reload(String profileId, boolean consent) throws Exception {
        return activate(profileId, null, consent);
    }

    private String activate(String profileId, ParcelFileDescriptor source, boolean consent) throws Exception {
        // Called only after the exact Shell caller gate, or from Broker-owned instrumentation.
        long identity = android.os.Binder.clearCallingIdentity();
        try { return activateAsBroker(profileId, source, consent); }
        finally { android.os.Binder.restoreCallingIdentity(identity); }
    }

    private String activateAsBroker(String profileId, ParcelFileDescriptor source, boolean consent) throws Exception {
        try (ParcelFileDescriptor owned = source) {
            if (!consent) throw new SecurityException("MODEL_IMPORT_CONSENT_REQUIRED");
            requireUnlocked();
            LocalModelCatalog catalog = catalog();
            LocalModelCatalog.Entry entry = catalog.require(profileId);
            ModelProfileManifest profile = entry.profile;
            catalog.verifier.verifySignature(profile);
            if (owned != null && (!OsConstants.S_ISREG(Os.fstat(owned.getFileDescriptor()).st_mode)
                    || (Os.fcntlInt(owned.getFileDescriptor(), OsConstants.F_GETFL, 0) & OsConstants.O_ACCMODE) != OsConstants.O_RDONLY))
                throw new SecurityException("READ_ONLY_REGULAR_MODEL_FILE_REQUIRED");
            if (owned != null && owned.getStatSize() != profile.artifactBytes) throw new SecurityException("MODEL_FILE_LENGTH_MISMATCH");
            ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
            context.getSystemService(ActivityManager.class).getMemoryInfo(memory);
            if (memory.totalMem < profile.minRamBytes || memory.lowMemory) throw new IllegalStateException("MODEL_MEMORY_UNAVAILABLE");
            if (context.getNoBackupFilesDir().getUsableSpace() < 2 * profile.artifactBytes + 100_663_296L)
                throw new IllegalStateException("MODEL_STORAGE_UNAVAILABLE");
            if (owned != null) verifySelectedWeights(owned, profile);
            synchronized (ModelProfileOperationLock.LOCK) {
                requireUnlocked();
                LocalAiConnection runtime = new LocalAiConnection(context);
                String signer = runtime.trustedInstalledSigningDigest();
                int uid = context.getPackageManager().getPackageUid(LocalAiConnection.PACKAGE, 0);
                ComponentManifest component = new ComponentManifest(ComponentManifest.Kind.TOOL,
                    LocalAiConnection.RUNTIME_COMPONENT_ID, LocalAiConnection.PACKAGE, LocalAiConnection.PACKAGE_VERSION_CODE,
                    PlatformApi.VERSION, PlatformApi.VERSION, uid, ComponentManifest.expectedDomain(ComponentManifest.Kind.TOOL),
                    signer, List.of("local-ai.inference"), 1, 1);
                long now = System.currentTimeMillis();
                platform.register("local-model-runtime:" + component.digest(), component, now);
                platform.activate(component.componentId, component.versionCode, false, now);
                platform.registerRuntimeManifest(new RuntimeManifest(component.componentId, component.versionCode, signer,
                    LocalAiConnection.API_VERSION, LocalAiConnection.API_VERSION, List.of("GGUF"), List.of(ZemaToolPlan.ARTICLE_PLAN_SCHEMA, dev.rock.sdk.LocalWorkDraft.SCHEMA)));
                ResumableModelArtifactStager stager = new ResumableModelArtifactStager(
                    new java.io.File(context.getNoBackupFilesDir(), "verified-models").toPath(), (candidate, offset) -> {
                        requireUnlocked();
                        if (!candidate.digest().equals(profile.digest())) throw new SecurityException("MODEL_IMPORT_PROFILE_CHANGED");
                        if (owned == null) throw new java.io.IOException("MODEL_CACHED_ARTIFACT_UNAVAILABLE");
                        ParcelFileDescriptor duplicate = ParcelFileDescriptor.dup(owned.getFileDescriptor());
                        try {
                            Os.lseek(duplicate.getFileDescriptor(), offset, OsConstants.SEEK_SET);
                            InputStream body = new ParcelFileDescriptor.AutoCloseInputStream(duplicate);
                            return new ResumableModelArtifactStager.Download() {
                                public int statusCode() { return offset == 0 ? 200 : 206; }
                                public long rangeStart() { return offset; }
                                public long contentLength() { return profile.artifactBytes - offset; }
                                public InputStream body() { return body; }
                                public void close() throws java.io.IOException { body.close(); }
                            };
                        } catch (Exception failure) {
                            duplicate.close();
                            throw new java.io.IOException("MODEL_IMPORT_SOURCE_UNAVAILABLE", failure);
                        }
                    });
                JSONObject licenseReceipt = new JSONObject().put("profileDigest", profile.digest())
                    .put("licenseId", profile.licenseId).put("owner", AndroidOwner.current(context)).put("acceptedAt", now);
                if (!LocalModelChoice.accepted(context, profile) && !context.getSharedPreferences("local-model-license", Context.MODE_PRIVATE).edit()
                        .putString(profile.digest(), licenseReceipt.toString()).commit())
                    throw new IllegalStateException("MODEL_LICENSE_RECEIPT_NOT_SAVED");
                // Verify before activation so a locked device or failed import cannot change the pointer.
                stager.verifyAndStage(profile);
                requireUnlocked();
                long generation = new ModelProfileActivationCoordinator(context, platform, stager, catalog.verifier)
                    .installAndActivate(profile, now, () -> !context.getSystemService(KeyguardManager.class).isDeviceLocked());
                return new JSONObject().put("status", "ready").put("profileId", profile.profileId)
                    .put("weightsSha256", profile.weightsSha256).put("generation", generation).toString();
            }
        }
    }
    static void verifySelectedWeights(ParcelFileDescriptor source, ModelProfileManifest profile) throws Exception {
        java.security.MessageDigest hash = java.security.MessageDigest.getInstance("SHA-256");
        long length = 0;
        try (ParcelFileDescriptor duplicate = ParcelFileDescriptor.dup(source.getFileDescriptor())) {
            Os.lseek(duplicate.getFileDescriptor(), 0, OsConstants.SEEK_SET);
            try (InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(duplicate)) {
                byte[] bytes = new byte[65536]; int count;
                while ((count = input.read(bytes)) != -1) {
                    length += count;
                    if (length > profile.artifactBytes) throw new SecurityException("MODEL_FILE_LENGTH_MISMATCH");
                    hash.update(bytes, 0, count);
                }
            }
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte value : hash.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        if (length != profile.artifactBytes || !profile.weightsSha256.equals(hex.toString()))
            throw new SecurityException("MODEL_ARTIFACT_HASH_MISMATCH");
    }

    private void requireUnlocked() {
        if (context.getSystemService(KeyguardManager.class).isDeviceLocked()) throw new SecurityException("DEVICE_UNLOCK_REQUIRED");
    }
}
