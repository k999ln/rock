package dev.rock.automation;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Stable, app-install-scoped public reference used to bind an enrolled Broker key. */
final class AndroidA2ABrokerDeviceRefStore {
    private static final String FILE_NAME = "a2a-broker-device-ref-v1";
    private final AtomicFile file;

    AndroidA2ABrokerDeviceRefStore(Context context) {
        if (context == null) throw new IllegalArgumentException("A2A_BROKER_CONTEXT_REQUIRED");
        File directory = new File(context.getApplicationContext().getNoBackupFilesDir(), "account");
        if (!directory.isDirectory() && !directory.mkdirs())
            throw new IllegalStateException("A2A_BROKER_DEVICE_REF_DIRECTORY");
        this.file = new AtomicFile(new File(directory, FILE_NAME));
    }

    synchronized String getOrCreate() throws java.io.IOException {
        if (file.getBaseFile().isFile()) {
            byte[] bytes = file.readFully();
            try {
                String value = new String(bytes, StandardCharsets.US_ASCII);
                if (!value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
                    throw new java.io.IOException("A2A_BROKER_DEVICE_REF_INVALID");
                return value;
            } finally { java.util.Arrays.fill(bytes, (byte) 0); }
        }

        String value = UUID.randomUUID().toString();
        FileOutputStream pending = null;
        try {
            pending = file.startWrite();
            pending.write(value.getBytes(StandardCharsets.US_ASCII));
            pending.getFD().sync();
            file.finishWrite(pending);
            return value;
        } catch (Exception failure) {
            if (pending != null) file.failWrite(pending);
            if (failure instanceof java.io.IOException) throw (java.io.IOException) failure;
            throw new java.io.IOException("A2A_BROKER_DEVICE_REF_WRITE_FAILED", failure);
        }
    }
}
