package dev.rock.automation;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import dev.rock.core.Database;
import java.util.*;
import java.util.function.Supplier;

final class AndroidDatabase implements Database {
    private final SQLiteDatabase db;
    private int depth;
    AndroidDatabase(Context context) {
        java.io.File file = context.getDatabasePath("rock-automation.db");
        java.io.File parent = file.getParentFile();
        if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) throw new IllegalStateException("DATABASE_DIRECTORY");
        db = SQLiteDatabase.openOrCreateDatabase(file, null);
        db.enableWriteAheadLogging();
    }
    public synchronized void execute(String sql, Object... args) { db.execSQL(sql, args); }
    public synchronized List<Map<String,String>> query(String sql, Object... args) {
        String[] values = new String[args.length];
        for (int i = 0; i < args.length; i++) values[i] = args[i] == null ? null : args[i].toString();
        try (Cursor c = db.rawQuery(sql, values)) {
            List<Map<String,String>> rows = new ArrayList<>();
            while (c.moveToNext()) {
                Map<String,String> row = new LinkedHashMap<>();
                for (int i = 0; i < c.getColumnCount(); i++) row.put(c.getColumnName(i), c.isNull(i) ? null : c.getString(i));
                rows.add(row);
            }
            return rows;
        }
    }
    public synchronized <T> T transaction(Supplier<T> body) {
        boolean outer = depth == 0; if (outer) db.beginTransaction(); depth++;
        try { T result = body.get(); if (outer) db.setTransactionSuccessful(); return result; }
        finally { depth--; if (outer) db.endTransaction(); }
    }
    public synchronized void close() { db.close(); }
}
