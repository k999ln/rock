package dev.rock.core;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/** Bound values only. Implementations must serialize transactions and roll back on failure. */
public interface Database extends AutoCloseable {
    void execute(String sql, Object... args);
    List<Map<String, String>> query(String sql, Object... args);
    <T> T transaction(Supplier<T> body);
    @Override void close();
}
