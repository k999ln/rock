package dev.rock.automation;

import android.app.DownloadManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import dev.rock.core.platform.PlatformStore;
import java.io.File;
import java.nio.file.Files;
import java.util.UUID;
import org.json.JSONObject;

/** Explicit Wi-Fi download of APK-reviewed immutable profiles. Public search metadata has no install authority. */
final class PublicModelInstall {
    private static final Object LOCK = new Object();
    private final Context context;
    private final LocalModelInstaller installer;
    private final SharedPreferences prefs;
    private final DownloadManager manager;
    PublicModelInstall(Context context, PlatformStore platform) {
        this.context = context; installer = new LocalModelInstaller(context, platform);
        prefs = context.getSharedPreferences("public-model-install", Context.MODE_PRIVATE);
        manager = context.getSystemService(DownloadManager.class);
    }
    String prepare(String id) throws Exception {
        LocalModelCatalog.Entry e = installer.catalog().require(id);
        return new JSONObject().put("status", "prepared").put("profileId", id).put("name", e.name)
            .put("source", e.source).put("bytes", e.profile.artifactBytes).put("sha256", e.profile.weightsSha256)
            .put("licenseId", e.profile.licenseId).put("licenseUrl", e.licenseUrl)
            .put("manifestDigest", e.profile.digest()).put("reusableCache", reusable(e) != null)
            .put("network", "wifi_only").put("executionStarted", false).toString();
    }
    String begin(String id, boolean consent) throws Exception {
        synchronized (LOCK) {
            if (!consent) throw new SecurityException("MODEL_IMPORT_CONSENT_REQUIRED");
            unlocked(); LocalModelCatalog.Entry e = installer.catalog().require(id); fixedSource(e);
            String previous = prefs.getString("operation", null);
            if (previous != null && !prefs.getBoolean("terminal", false)) {
                if (!id.equals(prefs.getString("profile", ""))) throw new IllegalStateException("MODEL_DOWNLOAD_ALREADY_PENDING");
                return status();
            }
            if (context.getNoBackupFilesDir().getUsableSpace() < 3 * e.profile.artifactBytes + 100_663_296L)
                throw new IllegalStateException("MODEL_STORAGE_UNAVAILABLE");
            // Verify the exact runtime package/signature/API before using storage or network.
            new LocalAiConnection(context).trustedInstalledSigningDigest();
            String operation = UUID.randomUUID().toString();
            boolean cached = reusable(e) != null;
            if (!prefs.edit().clear().putString("operation", operation).putString("profile", id)
                    .putString("owner", AndroidOwner.current(context)).putString("manifest", e.profile.digest())
                    .putLong("download", -1).putBoolean("cached", cached).putBoolean("terminal", false).commit())
                throw new IllegalStateException("MODEL_DOWNLOAD_STATE_NOT_SAVED");
            if (!cached) {
                File target = new File(context.getExternalFilesDir("model-downloads"), operation + ".gguf");
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(e.source))
                    .setTitle("RockstarOS: " + e.name).setDescription("rock-model:" + operation)
                    .setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI).setAllowedOverMetered(false)
                    .setAllowedOverRoaming(false).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationUri(Uri.fromFile(target));
                long download = manager.enqueue(request);
                // If this write is interrupted, status reconciles the persisted nonce; begin never enqueues twice.
                if (!prefs.edit().putLong("download", download).commit()) throw new IllegalStateException("MODEL_DOWNLOAD_STATE_UNCERTAIN");
            }
            return status();
        }
    }
    private LocalModelCatalog.Entry current(String operation) throws Exception {
        if (operation == null || !operation.equals(prefs.getString("operation", null))
                || !AndroidOwner.current(context).equals(prefs.getString("owner", null))) throw new SecurityException("MODEL_DOWNLOAD_OPERATION_INVALID");
        LocalModelCatalog.Entry e = installer.catalog().require(prefs.getString("profile", ""));
        if (!e.profile.digest().equals(prefs.getString("manifest", ""))) throw new SecurityException("MODEL_DOWNLOAD_PROFILE_CHANGED");
        return e;
    }
    private long downloadId(String operation, LocalModelCatalog.Entry e) {
        long id = prefs.getLong("download", -1); if (id >= 0) return id;
        long found = -1;
        try (Cursor rows = manager.query(new DownloadManager.Query())) {
            while (rows != null && rows.moveToNext()) {
                if (!("rock-model:" + operation).equals(rows.getString(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_DESCRIPTION)))
                        || !e.source.equals(rows.getString(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_URI)))) continue;
                if (found >= 0) throw new IllegalStateException("MODEL_DOWNLOAD_STATE_UNCERTAIN");
                found = rows.getLong(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));
            }
        }
        if (found >= 0 && !prefs.edit().putLong("download", found).commit()) throw new IllegalStateException("MODEL_DOWNLOAD_STATE_UNCERTAIN");
        return found;
    }
    String status() throws Exception {
        synchronized (LOCK) {
            String operation = prefs.getString("operation", null);
            if (operation == null) return "{\"status\":\"idle\"}";
            LocalModelCatalog.Entry e = current(operation);
            String state = prefs.getString("terminalState", ""); long bytes = 0;
            if (!prefs.getBoolean("terminal", false)) {
                if (prefs.getBoolean("cached", false)) state = reusable(e) == null ? "failed" : "downloaded";
                else {
                    long id = downloadId(operation, e); state = "uncertain";
                    if (id >= 0) try (Cursor rows = manager.query(new DownloadManager.Query().setFilterById(id))) {
                        if (rows != null && rows.moveToFirst()) {
                            int status = rows.getInt(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            bytes = rows.getLong(rows.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            state = status == DownloadManager.STATUS_SUCCESSFUL ? "downloaded" : status == DownloadManager.STATUS_FAILED ? "failed"
                                : status == DownloadManager.STATUS_PAUSED ? "paused" : "downloading";
                        }
                    }
                }
            }
            return new JSONObject().put("status", state).put("operationId", operation).put("profileId", e.profile.profileId)
                .put("name", e.name).put("bytesDownloaded", bytes).put("bytesTotal", e.profile.artifactBytes)
                .put("cachedSource", prefs.getBoolean("cached", false)).put("network", "wifi_only").toString();
        }
    }
    String finish(String operation, boolean consent) throws Exception {
        synchronized (LOCK) {
            if (!consent) throw new SecurityException("MODEL_IMPORT_CONSENT_REQUIRED");
            unlocked(); LocalModelCatalog.Entry e = current(operation);
            if (prefs.getBoolean("terminal", false)) return status();
            if (!"downloaded".equals(new JSONObject(status()).getString("status"))) throw new IllegalStateException("MODEL_DOWNLOAD_NOT_COMPLETE");
            File cached = prefs.getBoolean("cached", false) ? reusable(e) : null;
            ParcelFileDescriptor source = cached != null ? ParcelFileDescriptor.open(cached, ParcelFileDescriptor.MODE_READ_ONLY)
                : manager.openDownloadedFile(downloadId(operation, e));
            // Existing installer verifies every byte, signature, owner consent, resources and runtime receipt before activation.
            String receipt = installer.install(e.profile.profileId, source, true);
            if (!"ready".equals(new JSONObject(receipt).optString("status"))) throw new IllegalStateException("MODEL_IMPORT_NOT_READY");
            if (!prefs.edit().putBoolean("terminal", true).putString("terminalState", "installed").commit())
                throw new IllegalStateException("MODEL_DOWNLOAD_STATE_UNCERTAIN");
            long download = prefs.getLong("download", -1); if (download >= 0) manager.remove(download);
            return new JSONObject(status()).put("receipt", new JSONObject(receipt)).toString();
        }
    }
    String cancel(String operation) throws Exception {
        synchronized (LOCK) {
            LocalModelCatalog.Entry e = current(operation);
            if (prefs.getBoolean("terminal", false)) return status();
            long id = downloadId(operation, e);
            if (id < 0 && !prefs.getBoolean("cached", false)) throw new IllegalStateException("MODEL_DOWNLOAD_STATE_UNCERTAIN");
            if (id >= 0) manager.remove(id);
            if (!prefs.edit().putBoolean("terminal", true).putString("terminalState", "cancelled").commit()) throw new IllegalStateException("MODEL_DOWNLOAD_STATE_NOT_SAVED");
            return status();
        }
    }
    private File reusable(LocalModelCatalog.Entry e) throws Exception {
        File root = new File(context.getNoBackupFilesDir(), "verified-models");
        if (!root.isDirectory() || Files.isSymbolicLink(root.toPath())) return null;
        try (java.util.stream.Stream<java.nio.file.Path> paths = Files.walk(root.toPath(), 2)) {
            return paths.filter(p -> p.getFileName().toString().equals(e.profile.weightsSha256 + ".gguf"))
                .filter(p -> !Files.isSymbolicLink(p) && Files.isRegularFile(p, java.nio.file.LinkOption.NOFOLLOW_LINKS))
                .map(java.nio.file.Path::toFile).filter(f -> f.length() == e.profile.artifactBytes).findFirst().orElse(null);
        }
    }
    private static void fixedSource(LocalModelCatalog.Entry e) {
        if (!e.source.matches("https://huggingface\\.co/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/resolve/[a-f0-9]{40}/[A-Za-z0-9_.-]+\\.gguf"))
            throw new SecurityException("MODEL_DOWNLOAD_SOURCE_NOT_PINNED");
    }
    private void unlocked() {
        if (context.getSystemService(KeyguardManager.class).isDeviceLocked()) throw new SecurityException("DEVICE_LOCKED");
    }
}
