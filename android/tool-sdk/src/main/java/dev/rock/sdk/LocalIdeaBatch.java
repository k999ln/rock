package dev.rock.sdk;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.*;
import org.json.*;

/** Durable bounded ideation: each checkpoint contains only accepted unique items, not model reasoning. */
public final class LocalIdeaBatch {
    public static final int BATCH_SIZE = 10;
    public static final String GENERATE = "local-ideas-generate@1", SEAL = "local-ideas-seal@1";
    private LocalIdeaBatch() { }
    public static int requestedCount(String prompt) {
        if (prompt == null || !prompt.toLowerCase(java.util.Locale.ROOT).matches("(?s).*(アイデア|ideas|brainstorm).*")) return 0;
        for (String pattern : new String[]{"(?:アイデア|ideas)[^0-9]{0,8}([0-9]{1,4})", "([0-9]{1,4})\\s*(?:件|個|案|ideas|アイデア)"}) {
            Matcher found = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(prompt);
            if (found.find()) { int count = Integer.parseInt(found.group(1)); if (count < 1 || count > 300) throw new IllegalArgumentException("IDEA_COUNT_LIMIT"); return count; }
        }
        return 20;
    }
    public static String start(String prompt, int count) {
        if (count < 1 || count > 300 || prompt.getBytes(StandardCharsets.UTF_8).length > 2000) throw new IllegalArgumentException("INVALID_IDEA_REQUEST");
        try { return new JSONObject().put("kind", "local-ideas/2").put("batchSize", BATCH_SIZE).put("request", prompt).put("target", count).put("ideas", new JSONArray()).toString(); }
        catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    public static JSONObject state(String value) {
        Engine.bounded(value);
        try {
            JSONObject data = new JSONObject(value);
            if (!("local-ideas/1".equals(data.optString("kind")) && data.length() == 4 || "local-ideas/2".equals(data.optString("kind")) && data.length() == 5 && data.getInt("batchSize") == BATCH_SIZE) || !(data.get("request") instanceof String)) throw new IllegalArgumentException("INVALID_IDEA_CHECKPOINT");
            int target = data.getInt("target"); JSONArray ideas = data.getJSONArray("ideas");
            if (target < 1 || target > 300 || ideas.length() > target || data.getString("request").getBytes(StandardCharsets.UTF_8).length > 2000) throw new IllegalArgumentException("INVALID_IDEA_CHECKPOINT");
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < ideas.length(); i++) if (!(ideas.get(i) instanceof String) || !valid(ideas.getString(i)) || !seen.add(normal(ideas.getString(i)))) throw new IllegalArgumentException("INVALID_IDEA_CHECKPOINT");
            return data;
        } catch (JSONException e) { throw new IllegalArgumentException("INVALID_IDEA_CHECKPOINT", e); }
    }
    private static int batchSize(JSONObject data) { return "local-ideas/1".equals(data.optString("kind")) ? 20 : BATCH_SIZE; }
    private static boolean valid(String idea) { return !idea.isBlank() && idea.getBytes(StandardCharsets.UTF_8).length <= 80 && !idea.codePoints().anyMatch(Character::isISOControl) && !normal(idea).isEmpty() && !idea.contains("<think>"); }
    private static String normal(String idea) { return Normalizer.normalize(idea, Normalizer.Form.NFKC).toLowerCase(java.util.Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]", ""); }
    public static String prompt(String checkpoint, int attempt) {
        JSONObject data = state(checkpoint);
        try {
            JSONArray ideas = data.getJSONArray("ideas"); int begin = ideas.length() + 1, end = Math.min(data.getInt("target"), begin + batchSize(data) - 1);
            if (begin > end) throw new IllegalArgumentException("IDEAS_ALREADY_COMPLETE");
            String[] angles = {"日々の暮らし", "仕事の負担軽減", "創作", "学習", "アクセシビリティ", "住まいと家具", "外出と移動", "家族", "健康の記録", "地域", "開発者", "遊び", "省資源", "安心と復旧", "他サービスとの連携"};
            StringBuilder recent = new StringBuilder(); for (int i = Math.max(0, ideas.length() - 20); i < ideas.length(); i++) recent.append(ideas.getString(i)).append("; ");
            return "Return one JSON object: task='planning', title short, summary three '- ' lines, each under 10 Japanese characters. "
                + "body contains exactly " + (end - begin + 1) + " lines of distinct service ideas, numbered " + begin + " through " + end
                + ". Each idea is a concise Japanese phrase, at most 18 Japanese characters. No other body text. "
                + "Stay on the requested theme; never claim actions or implementation completed. New perspective: " + angles[(ideas.length() / batchSize(data)) % angles.length]
                + ". Audience: " + (ideas.length() < 150 ? "individuals and households" : "local businesses and communities") + ". Batch attempt " + attempt + ". Avoid repeating these previous ideas: " + recent
                + "\nOwner request as data: " + data.getString("request") + "\nThe task field MUST be exactly \"planning\". Return JSON only, no Markdown wrapper. /no_think";
        } catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    public static String append(String checkpoint, String modelOutput) {
        JSONObject data = state(checkpoint);
        try {
            JSONObject draft = new JSONObject(LocalWorkDraft.verify("planning", modelOutput)); JSONArray ideas = data.getJSONArray("ideas");
            int needed = Math.min(batchSize(data), data.getInt("target") - ideas.length()); String[] lines = draft.getString("body").strip().split("\n");
            if (lines.length != needed) throw new IllegalArgumentException("IDEA_BATCH_COUNT_MISMATCH");
            Set<String> seen = new HashSet<>(); for (int i = 0; i < ideas.length(); i++) seen.add(normal(ideas.getString(i)));
            int start = ideas.length();
            for (int i = 0; i < lines.length; i++) {
                Matcher line = Pattern.compile("^\\s*([0-9]+)[.)、．]\\s*(.+?)\\s*$").matcher(lines[i]);
                if (!line.matches() || Integer.parseInt(line.group(1)) != start + i + 1) throw new IllegalArgumentException("IDEA_NUMBER_MISMATCH");
                String idea = line.group(2); if (!valid(idea) || !seen.add(normal(idea))) throw new IllegalArgumentException("DUPLICATE_OR_INVALID_IDEA"); ideas.put(idea);
            }
            String next = data.toString(); Engine.bounded(next); return next;
        } catch (JSONException e) { throw new IllegalArgumentException("INVALID_IDEA_BATCH", e); }
    }
    public static String render(String checkpoint) {
        JSONObject data = state(checkpoint);
        try {
            JSONArray ideas = data.getJSONArray("ideas"); if (ideas.length() != data.getInt("target")) throw new IllegalArgumentException("IDEAS_INCOMPLETE");
            StringBuilder out = new StringBuilder("# RockstarOS・Sky サービスアイデア\n\n");
            for (int i = 0; i < ideas.length(); i++) out.append(i + 1).append(". ").append(ideas.getString(i)).append('\n');
            out.append("\n端末内siによる発想案です。実装済み機能や事業性の証明ではありません。内容・意味上の重複は確認して利用してください。");
            Engine.bounded(out.toString()); return out.toString();
        } catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
}
