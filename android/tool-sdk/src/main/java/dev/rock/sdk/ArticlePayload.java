package dev.rock.sdk;

import dev.rock.core.Engine;
import dev.rock.core.ArticleTools;
import org.json.JSONObject;
import java.util.Set;

/** Closed wire schema: unknown fields and type coercion are rejected. */
public final class ArticlePayload {
    private static final Set<String> KEYS = Set.of("markdown", "afterChars", "summary", "price", "paidContents", "noteUrl");
    private ArticlePayload() {}
    public static JSONObject parse(String input) {
        Engine.bounded(input);
        try {
            JSONObject j = new JSONObject(input);
            if (j.length() != KEYS.size()) throw new IllegalArgumentException("INVALID_FIELDS");
            java.util.Iterator<String> keys = j.keys();
            while (keys.hasNext()) if (!KEYS.contains(keys.next())) throw new IllegalArgumentException("UNKNOWN_FIELD");
            for (String key : KEYS) {
                Object value = j.get(key);
                if (key.equals("afterChars") || key.equals("price")) {
                    if (!(value instanceof Integer)) throw new IllegalArgumentException("INTEGER_REQUIRED");
                    int max = key.equals("price") ? 1000000 : 100000;
                    if ((Integer) value < 1 || (Integer) value > max) throw new IllegalArgumentException("INVALID_RANGE");
                } else { if (!(value instanceof String)) throw new IllegalArgumentException("TEXT_REQUIRED"); Engine.bounded((String)value); }
            }
            return j;
        } catch (org.json.JSONException e) { throw new IllegalArgumentException("INVALID_JSON"); }
    }
    public static void validateIntermediate(String input, String output) {
        JSONObject before = parse(input), after = parse(output);
        try {
            for (String key : KEYS) if (!key.equals("markdown") && !before.get(key).equals(after.get(key)))
                throw new IllegalArgumentException("TOOL_CHANGED_SETTINGS");
        } catch (org.json.JSONException e) { throw new IllegalArgumentException("INVALID_JSON"); }
    }

    /** Proves that both selected pure transforms can accept the planned input before it is queued. */
    public static void validateExecutable(String input) {
        JSONObject j = parse(input);
        try {
            String cited = ArticleTools.citations(j.getString("markdown"));
            ArticleTools.freeArticle(cited, j.getInt("afterChars"), j.getString("summary"),
                j.getInt("price"), j.getString("paidContents"), j.getString("noteUrl"));
        } catch (org.json.JSONException invalid) {
            throw new IllegalArgumentException("INVALID_JSON", invalid);
        }
    }
}
