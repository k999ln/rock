package dev.rock.shell;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import org.json.JSONObject;

/** Wire validation only. Account grants and durable execution remain in the host controller. */
final class PixelPortableBridgeProtocol {
    private static final String RESPONSE="rockstaros.pixel-runtime-response/1";
    static boolean isRuntime(JSONObject command) {
        return Arrays.asList("runtime-agent-capabilities","runtime-agent-prepare","runtime-capabilities","runtime-start","runtime-read","runtime-cancel","runtime-stop-capabilities","runtime-stop-intent","runtime-stop-status").contains(command.optString("action"));
    }
    static boolean advertised(JSONObject hello) {
        org.json.JSONArray caps=hello.optJSONArray("capabilities");if(caps==null)return false;
        for(int i=0;i<caps.length();i++)if("portable-runtime/1".equals(caps.opt(i)))return true;
        return false;
    }
    private static boolean number(JSONObject value,String key,long expected){Object n=value.opt(key);return (n instanceof Integer||n instanceof Long)&&((Number)n).longValue()==expected;}
    private static void require(boolean ok)throws IOException {if(!ok)throw new IOException("Portable runtime response mismatch");}
    private static void fields(JSONObject value,String... allowed)throws IOException {
        Set<String> names=new HashSet<>(Arrays.asList(allowed));Iterator<String> keys=value.keys();while(keys.hasNext())require(names.contains(keys.next()));
    }
    private static boolean id(String value){return value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");}
    private static String sha(String value)throws Exception {
        java.nio.ByteBuffer encoded=StandardCharsets.UTF_8.newEncoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPLACE)
            .replaceWith(new byte[]{(byte)0xef,(byte)0xbf,(byte)0xbd}).encode(java.nio.CharBuffer.wrap(value));
        MessageDigest digest=MessageDigest.getInstance("SHA-256");digest.update(encoded);
        StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(java.util.Locale.ROOT,"%02x",b));return out.toString();
    }
    static void validate(JSONObject command,JSONObject value)throws Exception {
        require(isRuntime(command)&&RESPONSE.equals(value.optString("schema"))&&!value.has("error"));
        String action=command.getString("action"),state=value.getString("state");
        if("runtime-agent-capabilities".equals(action)) {
            fields(value,"schema","state","protocol","pinnedAgentPreparation","downloads");
            require("agent_capabilities".equals(state)&&number(value,"protocol",1)&&Boolean.TRUE.equals(value.opt("pinnedAgentPreparation"))&&Boolean.FALSE.equals(value.opt("downloads")));return;
        }
        if("runtime-agent-prepare".equals(action)) {
            fields(value,"schema","state","id","threadId","claimId","requestSha256","agent","model");
            JSONObject request=command.getJSONObject("request"),agent=value.getJSONObject("agent"),model=value.getJSONObject("model");
            fields(agent,"id","name","instructions","modelId","sha256");fields(model,"id","scheme","sha256");
            require("agent_prepared".equals(state)&&id(value.getString("id"))&&request.getString("id").equals(value.getString("id"))
                &&id(value.getString("threadId"))&&request.getString("threadId").equals(value.getString("threadId"))
                &&id(value.getString("claimId"))&&command.getString("claimId").equals(value.getString("claimId"))
                &&command.getString("requestSha256").matches("[a-f0-9]{64}")&&command.getString("requestSha256").equals(value.getString("requestSha256"))
                &&EvePortableCommands.canonical(request.getJSONObject("agent")).equals(EvePortableCommands.canonical(agent))&&EvePortableCommands.canonical(request.getJSONObject("model")).equals(EvePortableCommands.canonical(model))
                &&id(agent.getString("id"))&&agent.getString("modelId").equals(model.getString("id"))&&"gguf-sha256".equals(model.getString("scheme"))
                &&model.getString("sha256").matches("[a-f0-9]{64}"));
            String recipe="{\"name\":"+EvePortableCommands.quote(agent.getString("name"))+",\"instructions\":"+EvePortableCommands.quote(agent.getString("instructions"))+",\"modelId\":"+EvePortableCommands.quote(agent.getString("modelId"))+"}";
            require(sha(recipe).equals(agent.getString("sha256")));return;
        }
        if("runtime-stop-capabilities".equals(action)) {
            fields(value,"schema","state","protocol","durableExactBinding","contentFreeStatus");
            require("stop_capabilities".equals(state)&&number(value,"protocol",1)&&Boolean.TRUE.equals(value.opt("durableExactBinding"))&&Boolean.TRUE.equals(value.opt("contentFreeStatus")));return;
        }
        if("runtime-capabilities".equals(action)) {
            fields(value,"schema","state","protocol","scopedExecution","worker");
            require("capabilities".equals(state)&&number(value,"protocol",1)&&Boolean.TRUE.equals(value.opt("scopedExecution")));
            JSONObject worker=value.getJSONObject("worker");fields(worker,"schema","protocol","maximumOutputTokens","maximumDeadlineMs","platform","architecture");
            require("rockstaros.linux-text-capability/1".equals(worker.getString("schema"))&&number(worker,"protocol",1)&&number(worker,"maximumOutputTokens",1024)&&number(worker,"maximumDeadlineMs",120000)&&"linux".equals(worker.getString("platform"))&&"aarch64".equals(worker.getString("architecture")));return;
        }
        if("not_found".equals(state)){fields(value,"schema","state");require(!Arrays.asList("runtime-start","runtime-stop-intent","runtime-stop-status").contains(action));return;}
        String expected="runtime-start".equals(action)?command.getJSONObject("request").getString("id"):command.getString("id");
        require(id(expected)&&id(command.getString("claimId"))&&command.getString("requestSha256").matches("[a-f0-9]{64}")&&expected.equals(value.getString("id"))&&command.getString("claimId").equals(value.getString("claimId"))&&command.getString("requestSha256").equals(value.getString("requestSha256")));
        if("runtime-stop-intent".equals(action)) {
            fields(value,"schema","state","id","claimId","requestSha256","fenceDurable","stopConfirmed");
            require("fenced".equals(state)&&Boolean.TRUE.equals(value.opt("fenceDurable"))&&Boolean.FALSE.equals(value.opt("stopConfirmed")));return;
        }
        if("runtime-stop-status".equals(action)) {
            fields(value,"schema","state","id","claimId","requestSha256","fenceDurable","stopConfirmed");
            require(Arrays.asList("stop_absent","stop_pending","stop_finished","stop_confirmed","stop_unknown").contains(state)
                &&value.opt("fenceDurable") instanceof Boolean&&value.opt("stopConfirmed") instanceof Boolean
                &&Boolean.TRUE.equals(value.opt("stopConfirmed"))=="stop_confirmed".equals(state));return;
        }
        if("runtime-cancel".equals(action)){fields(value,"schema","state","id","claimId","requestSha256","stopConfirmed");require("cancel_requested".equals(state)&&Boolean.FALSE.equals(value.opt("stopConfirmed")));return;}
        require(Arrays.asList("starting","running","review","unknown").contains(state));
        if("starting".equals(state)){fields(value,"schema","state","id","claimId","requestSha256");return;}
        if(value.has("threadId"))require(id(value.getString("threadId")));
        if("running".equals(state)){fields(value,"schema","state","id","threadId","claimId","requestSha256");require(id(value.getString("threadId")));return;}
        if("unknown".equals(state)){
            fields(value,"schema","state","id","threadId","claimId","requestSha256","stopConfirmed","text");
            require(!value.has("text")||value.isNull("text"));if(value.has("stopConfirmed"))require(value.get("stopConfirmed") instanceof Boolean);return;
        }
        fields(value,"schema","state","id","threadId","claimId","requestSha256","text","outputSha256","durationMs","model");
        require(id(value.getString("threadId")));
        String text=value.getString("text");require(!text.trim().isEmpty()&&text.length()<=32000&&sha(text).equals(value.getString("outputSha256")));
        Object duration=value.get("durationMs");require((duration instanceof Long||duration instanceof Integer)&&((Number)duration).longValue()>=0);
        JSONObject model=value.getJSONObject("model");fields(model,"id","scheme","sha256");require(model.getString("id").matches("[a-z0-9][a-z0-9.-]{0,79}")&&"gguf-sha256".equals(model.getString("scheme"))&&model.getString("sha256").matches("[a-f0-9]{64}"));
    }
}
