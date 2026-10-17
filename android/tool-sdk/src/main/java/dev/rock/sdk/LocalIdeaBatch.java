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
    public static final int BATCH_SIZE = 10, GENERATION_PART_SIZE = 5;
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
    private static boolean valid(String idea) { return !idea.isBlank() && idea.getBytes(StandardCharsets.UTF_8).length <= 96 && !idea.codePoints().anyMatch(Character::isISOControl) && !normal(idea).isEmpty() && !idea.contains("<think>"); }
    private static String normal(String idea) { return Normalizer.normalize(idea, Normalizer.Form.NFKC).toLowerCase(java.util.Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]", ""); }
    public static String schema(String checkpoint) {
        JSONObject data=state(checkpoint);
        try { return schemaForCount(Math.min(batchSize(data),data.getInt("target")-data.getJSONArray("ideas").length())); }
        catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    public static String schemaForCount(int count) {
        if (count<1 || count>10) throw new IllegalArgumentException("INVALID_IDEA_SCHEMA_COUNT");
        return "local-work@1/ideas-"+count+"-v1";
    }
    public static String prompt(String checkpoint, int attempt) {
        return promptCount(checkpoint, attempt, 20);
    }
    public static String promptPart(String checkpoint, int attempt, int count) {
        requirePartCount(checkpoint,count);
        return promptCount(checkpoint,attempt,count);
    }
    private static void requirePartCount(String checkpoint, int count) {
        JSONObject data=state(checkpoint);
        if(count<1 || count>GENERATION_PART_SIZE || count>batchSize(data) || count>data.optInt("target")-data.optJSONArray("ideas").length())
            throw new IllegalArgumentException("INVALID_IDEA_PART_COUNT");
    }
    private static String promptCount(String checkpoint, int attempt, int count) {
        JSONObject data = state(checkpoint);
        try {
            JSONArray ideas = data.getJSONArray("ideas"); int begin = ideas.length() + 1, end = Math.min(data.getInt("target"), begin + Math.min(count,batchSize(data)) - 1);
            if (begin > end) throw new IllegalArgumentException("IDEAS_ALREADY_COMPLETE");
            String[] angles = {"朝の支度","料理","食材管理","買物","掃除","洗濯","睡眠","体調の記録","家族連絡","子育て","介護","外出","移動","防災","地域","学習","読書","文章","画像と映像","音楽","ゲーム","仕事の計画","会議","資料","開発","家具","照明","空調","建築","機器連携"};
            StringBuilder recent = new StringBuilder(); for (int i = Math.max(0, ideas.length() - 2); i < ideas.length(); i++) recent.append(ideas.getString(i)).append("; ");
            return "Agent・道具・家具をつないで暮らしを便利にする構想。依頼: " + data.getString("request")
                + "\n視点: " + angles[(ideas.length()/GENERATION_PART_SIZE+7*Math.max(0,attempt-1))%angles.length]
                + "。対象: " + (ideas.length()<150?"家庭":"店・事業者") + "。既出と異なる案: " + recent
                + "\n日本語で" + (end-begin+1) + "案だけ。各12文字の具体的な動作。製品名や抽象名詞だけは不可。JSONのideas配列のみ。 /no_think";
        } catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    private static String[] items(String body, int needed, int start) throws JSONException {
        String trimmed = body.strip();
        if (trimmed.startsWith("[")) {
            org.json.JSONTokener tokens = new org.json.JSONTokener(trimmed); Object parsed = tokens.nextValue();
            if (!(parsed instanceof JSONArray) || tokens.nextClean() != 0) throw new IllegalArgumentException("INVALID_IDEA_BATCH");
            JSONArray array = (JSONArray) parsed;
            if (array.length() != needed) throw new IllegalArgumentException("IDEA_BATCH_COUNT_MISMATCH");
            String[] values = new String[needed];
            for (int i=0;i<needed;i++) { if (!(array.get(i) instanceof String)) throw new IllegalArgumentException("INVALID_IDEA_BATCH"); values[i]=array.getString(i); }
            return values;
        }
        trimmed = trimmed.replaceAll("\\\\n(?=\\s*(?:[0-9]+[.)、．]|[-•] ))", "\n");
        String[] lines = java.util.Arrays.stream(trimmed.split("\n")).map(String::strip).filter(line -> !line.isEmpty()).toArray(String[]::new);
        if (lines.length != needed) throw new IllegalArgumentException("IDEA_BATCH_COUNT_MISMATCH");
        String[] values = new String[needed]; boolean localNumbers = false;
        boolean bullets = lines[0].matches("^[-•]\\s+.+");
        for (int i=0;i<needed;i++) {
            if (bullets) {
                Matcher line = Pattern.compile("^[-•]\\s+(.+)$").matcher(lines[i]);
                if (!line.matches()) throw new IllegalArgumentException("IDEA_NUMBER_MISMATCH"); values[i]=line.group(1);
            } else {
                Matcher line = Pattern.compile("^\\s*(?:\\*\\*)?\\(?([0-9]+)[.)、．](?:\\*\\*)?\\s*(.+?)\\s*$").matcher(lines[i]);
                if (!line.matches()) throw new IllegalArgumentException("IDEA_NUMBER_MISMATCH"); int number=Integer.parseInt(line.group(1));
                if (i==0) localNumbers=start>0 && number==1;
                if (number!=(localNumbers?i+1:start+i+1)) throw new IllegalArgumentException("IDEA_NUMBER_MISMATCH"); values[i]=line.group(2);
            }
        }
        return values;
    }
    public static String append(String checkpoint, String modelOutput) {
        return appendCount(checkpoint,modelOutput,20);
    }
    /** A verified in-memory piece. Caller persists only the complete original stage checkpoint. */
    public static String appendPart(String checkpoint, String modelOutput, int count) {
        requirePartCount(checkpoint,count);
        return appendCount(checkpoint,modelOutput,count);
    }
    private static String appendCount(String checkpoint, String modelOutput, int count) {
        JSONObject data = state(checkpoint);
        try {
            JSONObject draft = new JSONObject(LocalWorkDraft.verify("planning", modelOutput)); JSONArray ideas = data.getJSONArray("ideas");
            int needed = Math.min(Math.min(count,batchSize(data)), data.getInt("target")-ideas.length());
            if (needed<1) throw new IllegalArgumentException("IDEAS_ALREADY_COMPLETE");
            String[] values = items(draft.getString("body"),needed,ideas.length());
            Set<String> seen = new HashSet<>(); for (int i=0;i<ideas.length();i++) seen.add(normal(ideas.getString(i)));
            for (String idea:values) {
                if (!valid(idea) || !seen.add(normal(idea))) throw new IllegalArgumentException("DUPLICATE_OR_INVALID_IDEA"); ideas.put(idea);
            }
            String next=data.toString(); Engine.bounded(next); return next;
        } catch (JSONException e) { throw new IllegalArgumentException("INVALID_IDEA_BATCH",e); }
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
