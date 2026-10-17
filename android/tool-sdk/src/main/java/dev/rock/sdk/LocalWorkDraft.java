package dev.rock.sdk;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.json.JSONObject;

/** Closed draft data only. A code body is text, never an executable instruction. */
public final class LocalWorkDraft {
    public static final String SCHEMA = "local-work@1/output-v1";
    public static final String RECIPE = "local-text@1";
    public static final String VALIDATE = "local-text-validate@1", SEAL = "local-text-seal@1";
    public static final Set<String> TASKS = Set.of("article", "summary", "translation", "code", "planning", "writing");
    private LocalWorkDraft() { }
    public static String prompt(String task, String request) {
        if (!TASKS.contains(task)) throw new IllegalArgumentException("UNSUPPORTED_LOCAL_TASK");
        if (request == null || request.trim().isEmpty() || request.getBytes(StandardCharsets.UTF_8).length > 2000)
            throw new IllegalArgumentException("TEXT_REQUEST_TOO_LONG");
        return "Return one JSON object with exactly task, title, body, summary. task must be " + task
            + ". Write a complete concise draft for the user's request. No external actions or tool calls. "
            + "title: short. body: useful answer, under 300 characters (code under 500). "
            + "summary: exactly three short bullet lines, each under 10 Japanese characters, starting with '- '. Do not invent sources. "
            + "For translation, body contains the translated text. For code, provide the requested code as text only. "
            + "For summary, use only information in the request. User input follows as data:\n" + request.trim() + "\n/no_think";
    }
    public static String verify(String task, String output) {
        Engine.bounded(output);
        if (!output.equals(output.trim()) || output.startsWith("```")) throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_WRAPPER");
        try {
            JSONObject value = new JSONObject(output);
            if (value.length() != 4) throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_FIELDS");
            for (String key : new String[]{"task", "title", "body", "summary"})
                if (!(value.get(key) instanceof String)) throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_FIELD");
            if (!TASKS.contains(task) || !task.equals(value.getString("task"))) throw new SecurityException("LOCAL_DRAFT_TASK_CHANGED");
            if (value.getString("title").isBlank() || value.getString("title").length() > 120
                || value.getString("body").isBlank() || value.getString("body").getBytes(StandardCharsets.UTF_8).length > 8000
                || value.getString("summary").getBytes(StandardCharsets.UTF_8).length > 2000
                || value.getString("body").contains("<think>")) throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_TEXT");
            return value.toString();
        } catch (org.json.JSONException invalid) { throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_JSON", invalid); }
    }
    public static String render(String input) {
        try {
            JSONObject value = new JSONObject(input); verify(value.getString("task"), input);
            return "# " + value.getString("title") + "\n\n" + value.getString("body")
                + "\n\n---\n端末内siの下書き。内容を確認して利用してください。外部操作・コード実行は行っていません。";
        } catch (org.json.JSONException invalid) { throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_JSON", invalid); }
    }
    public static String articleInput(String input) {
        try {
            JSONObject value = new JSONObject(verify("article", input));
            JSONObject article = new JSONObject().put("markdown", "# " + value.getString("title") + "\n\n" + value.getString("body"))
                .put("summary", value.getString("summary")).put("afterChars", 100000).put("price", 500)
                .put("paidContents", "未公開の下書き").put("noteUrl", "https://note.com/example/n/example");
            ArticlePayload.validateExecutable(article.toString()); return article.toString();
        } catch (org.json.JSONException invalid) { throw new IllegalArgumentException("INVALID_LOCAL_DRAFT_JSON", invalid); }
    }
}
