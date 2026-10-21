package dev.rock.sdk;

import dev.rock.core.AgentToolChain;
import dev.rock.core.ArticleTools;
import dev.rock.core.Engine;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Data adapters for the existing article Tool ABI. No generated Tool IDs or settings. */
public final class AgentToolPayload {
    private AgentToolPayload() { }
    public static List<String> operations(JSONObject recipe) throws Exception {
        JSONArray values=recipe.getJSONArray("tools");List<String> tools=new ArrayList<>();
        for(int i=0;i<values.length();i++) {
            if(!(values.get(i) instanceof String))throw new IllegalArgumentException("AGENT_TOOLS_UNSUPPORTED");
            tools.add(values.getString(i));
        }
        AgentToolChain.stages(tools);return tools;
    }
    public static String input(String draft) {return LocalWorkDraft.articleInput(LocalWorkDraft.verify("article",draft));}
    public static String input(JSONObject recipe,String draft)throws Exception {
        if(operations(recipe).contains("free-article@1"))return input(draft);
        JSONObject value=new JSONObject(LocalWorkDraft.verify("article",draft));
        JSONObject payload=new JSONObject().put("markdown","# "+value.getString("title")+"\n\n"+value.getString("body"))
            .put("summary",value.getString("summary")).put("afterChars",1).put("price",500).put("paidContents","未公開の下書き").put("noteUrl","https://note.com/example/n/example");
        ArticlePayload.parse(payload.toString());ArticleTools.citations(payload.getString("markdown"));return payload.toString();
    }
    public static void verifyResult(String tool,String input,String output) throws Exception {
        JSONObject before=ArticlePayload.parse(input);String expected;
        if("citations@1".equals(tool)) {
            ArticlePayload.validateIntermediate(input,output);
            expected=new JSONObject(input).put("markdown",ArticleTools.citations(before.getString("markdown"))).getString("markdown");
            if(!expected.equals(ArticlePayload.parse(output).getString("markdown")))throw new SecurityException("AGENT_TOOL_RESULT_MISMATCH");
        } else if("free-article@1".equals(tool)) {
            expected=ArticleTools.freeArticle(before.getString("markdown"),before.getInt("afterChars"),before.getString("summary"),
                before.getInt("price"),before.getString("paidContents"),before.getString("noteUrl"));
            if(!expected.equals(output))throw new SecurityException("AGENT_TOOL_RESULT_MISMATCH");
        } else throw new SecurityException("AGENT_TOOLS_UNSUPPORTED");
    }
    public static String seal(JSONObject recipe,String input) throws Exception {
        List<String> tools=operations(recipe);String last=tools.get(tools.size()-1);
        String body="citations@1".equals(last)?ArticlePayload.parse(input).getString("markdown"):input;
        Engine.bounded(body);
        return body+"\n\n---\nSky Agentの下書き · 実行Tool: "+String.join(" → ",tools)
            +"\n内容を確認して利用してください。価格・URLがある場合は下書きの仮設定です。公開・販売・外部送信は行っていません。";
    }
}
