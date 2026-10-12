package dev.rock.operator.agent;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteConstraintException;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.json.JSONObject;

final class OperatorAgentDatabase extends SQLiteOpenHelper {
    private static final String AUDIT_ALIAS = "avocado_operator_audit_hmac_v1";

    OperatorAgentDatabase(Context context) {
        super(context.createDeviceProtectedStorageContext(), "operator-agent.db", null, 1);
        setWriteAheadLoggingEnabled(true);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE commands (id TEXT PRIMARY KEY,payload_sha256 TEXT NOT NULL UNIQUE," +
                "action TEXT NOT NULL,not_before INTEGER NOT NULL,expires_at INTEGER NOT NULL," +
                "state TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL," +
                "result_code TEXT,result_details_json TEXT,reported_at INTEGER)");
        db.execSQL("CREATE TABLE operator_counters (credential_id TEXT NOT NULL,sign_count INTEGER NOT NULL," +
                "command_id TEXT NOT NULL UNIQUE,PRIMARY KEY(credential_id,sign_count))");
        db.execSQL("CREATE TABLE audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT,command_id TEXT," +
                "event TEXT NOT NULL,details_json TEXT NOT NULL,created_at INTEGER NOT NULL," +
                "previous_mac TEXT NOT NULL,record_mac TEXT NOT NULL UNIQUE)");
        db.execSQL("CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END");
        db.execSQL("CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported operator database migration");
    }

    boolean stageVerified(SignedOperatorCommand command, OperatorCommandVerifier.Verified verified,
                          long now) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            try (Cursor existing = db.rawQuery(
                    "SELECT payload_sha256 FROM commands WHERE id=?", new String[]{command.id})) {
                if (existing.moveToFirst()) {
                    if (!verified.payloadSha256.equals(existing.getString(0)))
                        throw new SecurityException("Command ID collision");
                    db.setTransactionSuccessful();
                    return false;
                }
            }
            if (verified.signCount > 0) {
                try (Cursor counter = db.rawQuery(
                        "SELECT COALESCE(MAX(sign_count),0) FROM operator_counters WHERE credential_id=?",
                        new String[]{command.operatorCredentialId})) {
                    counter.moveToFirst();
                    if (verified.signCount <= counter.getLong(0))
                        throw new SecurityException("WebAuthn sign counter did not increase");
                }
                try {
                    db.execSQL("INSERT INTO operator_counters(credential_id,sign_count,command_id) VALUES(?,?,?)",
                            new Object[]{command.operatorCredentialId, verified.signCount, command.id});
                } catch (SQLiteConstraintException exception) {
                    throw new SecurityException("WebAuthn sign counter replay", exception);
                }
            }
            db.execSQL("INSERT INTO commands(id,payload_sha256,action,not_before,expires_at,state," +
                            "created_at,updated_at) VALUES(?,?,?,?,?,'verified',?,?)",
                    new Object[]{command.id, verified.payloadSha256, command.action, command.notBefore,
                            command.expiresAt, now, now});
            appendAudit(db, command.id, "command_verified",
                    new JSONObject().put("action", command.action).put("notBefore", command.notBefore)
                            .put("expiresAt", command.expiresAt).toString(), now);
            db.setTransactionSuccessful();
            return true;
        } finally {
            db.endTransaction();
        }
    }

    String state(String commandId) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT state FROM commands WHERE id=?", new String[]{commandId})) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    void markAcknowledged(String commandId, long now) throws Exception {
        transition(commandId, "verified", "acknowledged", "command_acknowledged", null, now);
    }

    void markResult(String commandId, String status, String resultCode, JSONObject details,
                    long now) throws Exception {
        if (!(status.equals("completed") || status.equals("failed"))
                || !resultCode.matches("[A-Z][A-Z0-9_]{2,79}"))
            throw new IllegalArgumentException("Invalid result");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("UPDATE commands SET state=?,result_code=?,result_details_json=?,updated_at=? " +
                            "WHERE id=? AND state='acknowledged'",
                    new Object[]{status, resultCode, details.toString(), now, commandId});
            if (changedRows(db) != 1) {
                String current = state(commandId);
                if (!status.equals(current)) throw new IllegalStateException("Invalid command transition");
                db.setTransactionSuccessful();
                return;
            }
            appendAudit(db, commandId, "command_" + status,
                    new JSONObject().put("resultCode", resultCode).toString(), now);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    static final class StoredResult {
        final String status;
        final String resultCode;
        final JSONObject details;
        final boolean reported;
        StoredResult(String status, String resultCode, JSONObject details, boolean reported) {
            this.status = status; this.resultCode = resultCode; this.details = details;
            this.reported = reported;
        }
    }

    StoredResult storedResult(String commandId) throws Exception {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT state,result_code,result_details_json,reported_at FROM commands WHERE id=?",
                new String[]{commandId})) {
            if (!cursor.moveToFirst() || !(cursor.getString(0).equals("completed")
                    || cursor.getString(0).equals("failed"))) return null;
            return new StoredResult(cursor.getString(0), cursor.getString(1),
                    new JSONObject(cursor.getString(2)), !cursor.isNull(3));
        }
    }

    void markReported(String commandId, long now) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("UPDATE commands SET reported_at=?,updated_at=? WHERE id=? " +
                            "AND state IN ('completed','failed') AND reported_at IS NULL",
                    new Object[]{now, now, commandId});
            if (changedRows(db) == 1)
                appendAudit(db, commandId, "result_reported", "{}", now);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    boolean payloadMatches(String commandId, String payloadSha256) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT payload_sha256 FROM commands WHERE id=?", new String[]{commandId})) {
            return cursor.moveToFirst() && payloadSha256.equals(cursor.getString(0));
        }
    }

    private void transition(String commandId, String from, String to, String event,
                            String resultCode, long now) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("UPDATE commands SET state=?,result_code=?,updated_at=? WHERE id=? AND state=?",
                    new Object[]{to, resultCode, now, commandId, from});
            if (changedRows(db) != 1) {
                String current = state(commandId);
                if (!to.equals(current)) throw new IllegalStateException("Invalid command transition");
                db.setTransactionSuccessful();
                return;
            }
            appendAudit(db, commandId, event,
                    resultCode == null ? "{}" : new JSONObject().put("resultCode", resultCode).toString(), now);
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static int changedRows(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery("SELECT changes()", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private static void appendAudit(SQLiteDatabase db, String commandId, String event,
                                    String details, long now) throws Exception {
        String previous = "GENESIS";
        try (Cursor cursor = db.rawQuery(
                "SELECT record_mac FROM audit ORDER BY sequence DESC LIMIT 1", null)) {
            if (cursor.moveToFirst()) previous = cursor.getString(0);
        }
        String canonical = previous + "\n" + (commandId == null ? "" : commandId) + "\n"
                + event + "\n" + details + "\n" + now;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(auditKey());
        String record = OperatorCommandVerifier.encode(
                mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
        db.execSQL("INSERT INTO audit(command_id,event,details_json,created_at,previous_mac,record_mac) " +
                        "VALUES(?,?,?,?,?,?)",
                new Object[]{commandId, event, details, now, previous, record});
    }

    private static SecretKey auditKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(AUDIT_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
                    "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(AUDIT_ALIAS, KeyProperties.PURPOSE_SIGN
                    | KeyProperties.PURPOSE_VERIFY).setDigests(KeyProperties.DIGEST_SHA256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(AUDIT_ALIAS, null);
    }
}
