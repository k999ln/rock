package dev.rock.automation;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Strict JSON-to-Java conversion for native A2A signature verification. */
final class AndroidA2AJson {
    private AndroidA2AJson() {}

    static Map<String,Object> object(JSONObject source) throws JSONException {
        Map<String,Object> result = new LinkedHashMap<>();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            result.put(key, value(source.get(key)));
        }
        return result;
    }

    private static Object value(Object source) throws JSONException {
        if (source == JSONObject.NULL) return null;
        if (source instanceof JSONObject) return object((JSONObject) source);
        if (source instanceof JSONArray) {
            JSONArray array = (JSONArray) source;
            List<Object> result = new ArrayList<>(array.length());
            for (int i = 0; i < array.length(); i++) result.add(value(array.get(i)));
            return result;
        }
        if (source instanceof String || source instanceof Number || source instanceof Boolean) return source;
        throw new JSONException("UNSUPPORTED_A2A_JSON_VALUE");
    }
}
