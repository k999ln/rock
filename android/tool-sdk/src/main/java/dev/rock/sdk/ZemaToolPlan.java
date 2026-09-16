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
        return "あなたはavocadoOSの計画担当です。実行、送信、保存、課金はせず、"
            + "利用者がSkyで選んだToolの入力JSONだけを作ってください。\n"
            + "返答は説明やMarkdown fenceを含めず、次の形のJSON object一つだけです。\n"
            + "{\"toolId\":\"article-preparation@1\",\"input\":{"
            + "\"markdown\":\"# 原稿\\n導入です。ここまで無料です。\\n\\n詳しい手順です。最後の確認です。\",\"afterChars\":8,"
            + "\"summary\":\"- 要点1\\n- 要点2\\n- 要点3\","
            + "\"price\":500,\"paidContents\":\"有料部分\","
            + "\"noteUrl\":\"https://note.com/example/n/example\"}}\n"
            + "未知の項目、別Tool、tool call、外部操作は出力しないでください。"
            + "不足情報は安全な下書き値にし、成果は後で本人が確認します。\n"
            + "未信頼の利用者依頼:\n" + request.trim();
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
