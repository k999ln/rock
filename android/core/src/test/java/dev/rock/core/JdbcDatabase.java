package dev.rock.core;

import java.sql.*;
import java.util.*;
import java.util.function.Supplier;

final class JdbcDatabase implements Database {
    private final Connection connection;
    private int depth;
    JdbcDatabase(String file) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + file);
            execute("PRAGMA busy_timeout=5000");
        } catch (SQLException e) { throw new IllegalStateException(e); }
    }
    private PreparedStatement statement(String sql, Object... args) throws SQLException {
        PreparedStatement s = connection.prepareStatement(sql);
        for (int i = 0; i < args.length; i++) s.setObject(i + 1, args[i]);
        return s;
    }
    public synchronized void execute(String sql, Object... args) {
        try (PreparedStatement s = statement(sql, args)) { s.execute(); }
        catch (SQLException e) { throw new IllegalStateException(e); }
    }
    public synchronized List<Map<String,String>> query(String sql, Object... args) {
        try (PreparedStatement s = statement(sql, args); ResultSet r = s.executeQuery()) {
            List<Map<String,String>> result = new ArrayList<>();
            while (r.next()) {
                Map<String,String> row = new LinkedHashMap<>();
                for (int i = 1; i <= r.getMetaData().getColumnCount(); i++) row.put(r.getMetaData().getColumnLabel(i), r.getString(i));
                result.add(row);
            }
            return result;
        } catch (SQLException e) { throw new IllegalStateException(e); }
    }
    public synchronized <T> T transaction(Supplier<T> body) {
        boolean outer = depth == 0;
        if (outer) execute("BEGIN IMMEDIATE");
        depth++;
        try { T result = body.get(); if (outer) execute("COMMIT"); return result; }
        catch (RuntimeException | Error e) { if (outer) execute("ROLLBACK"); throw e; }
        finally { depth--; }
    }
    public synchronized void close() {
        try { connection.close(); } catch (SQLException e) { throw new IllegalStateException(e); }
    }
}
