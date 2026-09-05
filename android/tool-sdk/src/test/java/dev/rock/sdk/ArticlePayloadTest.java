package dev.rock.sdk;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class ArticlePayloadTest {
    private JSONObject input() throws Exception {
        return new JSONObject().put("markdown", "原稿です。次の手順です。").put("afterChars", 4)
            .put("summary", "- 一\n- 二\n- 三").put("price", 500).put("paidContents", "詳しい手順")
            .put("noteUrl", "https://note.com/example/n/article");
    }
    @Test public void acceptsClosedPayloadAndOnlyMarkdownChange() throws Exception {
        JSONObject original = input(), output = input().put("markdown", "整理済みです。");
        assertEquals(6, ArticlePayload.parse(original.toString()).length());
        ArticlePayload.validateIntermediate(original.toString(), output.toString());
    }
    @Test public void rejectsUnknownMissingAndCoercedFields() throws Exception {
        JSONObject unknown = input().put("command", "anything");
        assertThrows(IllegalArgumentException.class, () -> ArticlePayload.parse(unknown.toString()));
        JSONObject missing = input(); missing.remove("price");
        assertThrows(IllegalArgumentException.class, () -> ArticlePayload.parse(missing.toString()));
        for (Object invalid : new Object[]{"500", true, 1.5, JSONObject.NULL, -1, 1000001}) {
            JSONObject value = input().put("price", invalid);
            assertThrows(IllegalArgumentException.class, () -> ArticlePayload.parse(value.toString()));
        }
    }
    @Test public void rejectsToolChangesToPriceUrlAndSummary() throws Exception {
        JSONObject original = input();
        for (String key : new String[]{"price", "noteUrl", "summary"}) {
            JSONObject changed = input().put(key, key.equals("price") ? 1000 : "changed");
            assertThrows(IllegalArgumentException.class, () -> ArticlePayload.validateIntermediate(original.toString(), changed.toString()));
        }
    }
    @Test public void rejectsEmptyAndHugeContent() throws Exception {
        JSONObject empty = input().put("markdown", " ");
        JSONObject huge = input().put("markdown", "あ".repeat(20000));
        assertThrows(IllegalArgumentException.class, () -> ArticlePayload.parse(empty.toString()));
        assertThrows(IllegalArgumentException.class, () -> ArticlePayload.parse(huge.toString()));
    }
}
