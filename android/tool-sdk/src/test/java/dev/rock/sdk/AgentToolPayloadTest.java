package dev.rock.sdk;
import dev.rock.core.ArticleTools;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public final class AgentToolPayloadTest {
    JSONObject recipe(String... tools)throws Exception{return new JSONObject().put("tools",new JSONArray(java.util.Arrays.asList(tools)));}
    @Test public void closedOperationsRejectSubstitutionPermissionsAndRepeatedOrReversedSteps()throws Exception {
        assertEquals(2,AgentToolPayload.operations(recipe("citations@1","free-article@1")).size());
        for(String[] bad:new String[][]{{},{"shell@1"},{"citations@1","citations@1"},{"free-article@1","citations@1"}})
            assertThrows(IllegalArgumentException.class,()->AgentToolPayload.operations(recipe(bad)));
        assertThrows(IllegalArgumentException.class,()->AgentToolPayload.operations(new JSONObject().put("tools",new JSONArray().put(1))));
    }
    @Test public void realTransformsAreVerifiedBeforeSealingAndChangedSettingsOrBodyAreRejected()throws Exception {
        String draft=new JSONObject().put("task","article").put("title","試験文書").put("body","本文。（出典: [資料](https://example.com/source)）\n\n具体的な手順を確認します。\n\n成果を保存します。")
            .put("summary","- 要点一\n- 要点二\n- 要点三").toString();
        String input=AgentToolPayload.input(draft);JSONObject j=new JSONObject(input);
        String cited=new JSONObject(input).put("markdown",ArticleTools.citations(j.getString("markdown"))).toString();
        AgentToolPayload.verifyResult("citations@1",input,cited);
        assertThrows(Exception.class,()->AgentToolPayload.verifyResult("citations@1",input,new JSONObject(cited).put("price",999).toString()));
        assertThrows(Exception.class,()->AgentToolPayload.verifyResult("citations@1",input,new JSONObject(cited).put("markdown","invented").toString()));
        j=new JSONObject(cited);String rendered=ArticleTools.freeArticle(j.getString("markdown"),j.getInt("afterChars"),j.getString("summary"),j.getInt("price"),j.getString("paidContents"),j.getString("noteUrl"));
        AgentToolPayload.verifyResult("free-article@1",cited,rendered);
        assertThrows(Exception.class,()->AgentToolPayload.verifyResult("free-article@1",cited,rendered+"forged"));
        String sealed=AgentToolPayload.seal(recipe("citations@1","free-article@1"),rendered);
        assertTrue(sealed.contains("https://example.com/source"));assertTrue(sealed.contains("citations@1 → free-article@1"));
        assertThrows(Exception.class,()->AgentToolPayload.input(draft.replace("article","writing")));
    }
}
