package dev.rock.sdk;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class ZemaToolPlanTest {
    private static JSONObject article() throws Exception {
        return new JSONObject().put("markdown", "# 原稿\n本文")
            .put("afterChars", 40).put("summary", "- 一\n- 二\n- 三")
            .put("price", 500).put("paidContents", "詳細")
            .put("noteUrl", "https://note.com/example/n/article");
    }

    private static String plan(String toolId) throws Exception {
        return new JSONObject().put("toolId", toolId).put("input", article()).toString();
    }

    @Test public void acceptsOnlyTheOwnerSelectedToolAndClosedInput() throws Exception {
        String input = ZemaToolPlan.verifiedInput(ZemaToolPlan.ARTICLE_TOOL,
            plan(ZemaToolPlan.ARTICLE_TOOL));
        assertEquals("# 原稿\n本文", new JSONObject(input).getString("markdown"));
        assertTrue(ZemaToolPlan.planningPrompt(ZemaToolPlan.ARTICLE_TOOL, "記事を準備して")
            .contains("未信頼の利用者依頼"));
    }

    @Test public void rejectsToolSubstitutionWrappersAndUnknownFields() throws Exception {
        assertThrows(SecurityException.class, () -> ZemaToolPlan.verifiedInput(
            ZemaToolPlan.ARTICLE_TOOL, plan("other-tool@1")));
        assertThrows(IllegalArgumentException.class, () -> ZemaToolPlan.verifiedInput(
            ZemaToolPlan.ARTICLE_TOOL, "```json\n" + plan(ZemaToolPlan.ARTICLE_TOOL) + "\n```"));
        JSONObject unknown = new JSONObject(plan(ZemaToolPlan.ARTICLE_TOOL)).put("execute", true);
        assertThrows(IllegalArgumentException.class, () -> ZemaToolPlan.verifiedInput(
            ZemaToolPlan.ARTICLE_TOOL, unknown.toString()));
        assertThrows(IllegalArgumentException.class, () ->
            ZemaToolPlan.planningPrompt("unknown@1", "run"));
    }

    @Test public void rejectsCoercedOrIncompleteToolInput() throws Exception {
        JSONObject bad = article().put("price", "500");
        String output = new JSONObject().put("toolId", ZemaToolPlan.ARTICLE_TOOL)
            .put("input", bad).toString();
        assertThrows(IllegalArgumentException.class, () ->
            ZemaToolPlan.verifiedInput(ZemaToolPlan.ARTICLE_TOOL, output));
        assertThrows(IllegalArgumentException.class, () ->
            ZemaToolPlan.planningPrompt(ZemaToolPlan.ARTICLE_TOOL, " "));
    }
}
