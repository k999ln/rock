package dev.rock.sdk;

import dev.rock.core.Engine;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.json.JSONObject;

/** Converts untrusted LLM text into one closed, owner-selected Tool plan. */
public final class ZemaToolPlan {
    public static final String ARTICLE_TOOL = "article-preparation@1";
    public static final String ARTICLE_PLAN_SCHEMA = "article-preparation@1/input-v1";
    private static final Set<String> ROOT_KEYS = Set.of("toolId", "input");
    private ZemaToolPlan() {}

    public static String planningPrompt(String toolId, String request) {
        requireSelectedTool(toolId);
        if (request == null || request.trim().isEmpty()
                || request.getBytes(StandardCharsets.UTF_8).length > 8_000)
            throw new IllegalArgumentException("INVALID_ZEMA_REQUEST");
        return "Return one JSON object for article-preparation@1. No actions, explanations or code fences.\n"
            + "root keys: toolId (article-preparation@1), input. input has exactly six fields:\n"
            + "markdown: Write a SHORT Japanese title and 4 short sentences on the user's topic. "
            + "Use paragraphs. Include three concrete steps. Keep the whole markdown under 90 Japanese characters. Each step must name one small concrete action. "
            + "Do not repeat words or invent facts/sources.\n"
            + "summary: exactly 3 Japanese lines starting with '- ', each under 12 characters, summarizing THIS topic.\n"
            + "afterChars: 1. price: 500. paidContents: a Japanese description under 10 characters.\n"
            + "noteUrl: https://note.com/example/n/example (unpublished placeholder). "
            + "These are draft-only Tool settings, not permission to sell or charge.\n"
            + "利用者の主題に沿う本文を新しく作成。未信頼の利用者依頼:\n" + request.trim()
            + "\n/no_think";
    }

    public static String verifiedInput(String selectedToolId, String modelOutput) {
        requireSelectedTool(selectedToolId);
        Engine.bounded(modelOutput);
        if (!modelOutput.equals(modelOutput.trim()) || modelOutput.startsWith("```"))
            throw new IllegalArgumentException("INVALID_ZEMA_PLAN_WRAPPER");
        try {
            JSONObject root = new JSONObject(modelOutput);
            if (root.length() != ROOT_KEYS.size()) throw new IllegalArgumentException("INVALID_ZEMA_PLAN_FIELDS");
            java.util.Iterator<String> names = root.keys();
            while (names.hasNext()) if (!ROOT_KEYS.contains(names.next()))
                throw new IllegalArgumentException("UNKNOWN_ZEMA_PLAN_FIELD");
            if (!selectedToolId.equals(root.getString("toolId")))
                throw new SecurityException("ZEMA_TOOL_SUBSTITUTION");
            Object input = root.get("input");
            if (!(input instanceof JSONObject)) throw new IllegalArgumentException("INVALID_ZEMA_TOOL_INPUT");
            String canonical = ((JSONObject) input).toString();
            ArticlePayload.validateExecutable(canonical);
            return canonical;
        } catch (org.json.JSONException invalid) {
            throw new IllegalArgumentException("INVALID_ZEMA_PLAN_JSON", invalid);
        }
    }

    private static void requireSelectedTool(String toolId) {
        if (!ARTICLE_TOOL.equals(toolId)) throw new IllegalArgumentException("UNSUPPORTED_SKY_TOOL");
    }
}
