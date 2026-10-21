package dev.rock.automation;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
public final class SkyAgentDefinitionTest {
    JSONObject recipe()throws Exception{return new JSONObject().put("schema","rock-sky-agent/1").put("id","other.author.helper").put("version",1).put("name","Helper").put("instructions","Write a concise useful note.").put("task","writing").put("licenseId","MIT").put("permissions",new JSONArray()).put("runner","local-text/1");}
    @Test public void arbitraryAuthorRecipeIsDataAndProvenanceChangesWithVersionOrSource()throws Exception {
        JSONObject a=SkyAddonStore.agent(recipe(),"https://github.com/author/repo/blob/"+"a".repeat(40)+"/sky-addon.json");
        JSONObject b=SkyAddonStore.agent(recipe().put("version",2),a.getString("source"));
        assertNotEquals(a.getString("id"),b.getString("id"));assertFalse(a.getBoolean("network"));
        assertTrue(SkyAddonStore.render(a,"hello").contains("未信頼のデータ"));assertTrue(SkyAddonStore.render(a,"hello").contains("hello"));
    }
    @Test public void executableUnknownFieldsPermissionsAndUnsupportedRunnerAreRejected()throws Exception{
        for(JSONObject bad:new JSONObject[]{recipe().put("shell","echo bad"),recipe().put("runner","python"),recipe().put("permissions",new JSONArray().put("files.all")),recipe().put("task","article"),recipe().put("instructions","a\u0000b")})
            assertThrows(Exception.class,()->SkyAddonStore.agent(bad,"https://github.com/author/repo"));
    }
    @Test public void externalLocalPrivateOrCredentialSourcesFailBeforeNetwork()throws Exception{
        SkyAddonResolver resolver=new SkyAddonResolver(null);
        for(String u:new String[]{"file:///tmp/model","http://huggingface.co/a/b","https://user:secret@huggingface.co/a/b","https://127.0.0.1/a/b","https://huggingface.co/a/b?token=secret","https://github.com/a/b/blob/main/../x.json"})
            assertThrows(Exception.class,()->resolver.inspect(u));
    }
    @Test public void provenanceExtensionIsExactAndCannotChangeTaskOrPrompt()throws Exception {
        String origin="https://github.com/author/repo/blob/"+"a".repeat(40)+"/sky-addon.json";
        JSONObject d=SkyAddonStore.agent(recipe(),origin);String request="Write a useful note.",rendered=SkyAddonStore.render(d,request);
        JSONObject provenance=new JSONObject().put("schema","rock-sky-agent-use/1").put("addonDigest",dev.rock.core.Engine.digest(d.toString())).put("source",origin).put("request",request).put("recipe",d.getJSONObject("recipe"));
        JSONObject input=new JSONObject().put("task","writing").put("request",rendered).put("prompt",dev.rock.sdk.LocalWorkDraft.prompt("writing",rendered)).put("agentProvenance",provenance);
        assertTrue(SkyAddonStore.validWorkInput(input));
        assertFalse(SkyAddonStore.validWorkInput(new JSONObject(input.toString()).put("shell","bad")));
        assertFalse(SkyAddonStore.validWorkInput(new JSONObject(input.toString()).put("task","code")));
        JSONObject tampered=new JSONObject(input.toString());tampered.getJSONObject("agentProvenance").put("addonDigest","0".repeat(64));assertFalse(SkyAddonStore.validWorkInput(tampered));
    }
}
