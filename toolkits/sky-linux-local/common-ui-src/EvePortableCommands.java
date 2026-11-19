package dev.rock.shell;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Deterministic wire checks. A valid command still requires the current server grant. */
final class EvePortableCommands {
    static void require(boolean ok)throws IOException{if(!ok)throw new IOException("PORTABLE_COMMAND_INVALID");}
    static boolean id(String s){return s!=null&&s.matches("[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}");}
    static void fields(JSONObject v,String... keys)throws Exception {
        require(v.length()==keys.length);for(String k:keys)require(v.has(k));
    }
    static String string(JSONObject v,String k)throws Exception{Object s=v.get(k);require(s instanceof String);return (String)s;}
    static long safe(long x)throws IOException{require(x>=-9007199254740991L&&x<=9007199254740991L);return x;}
    static long integer(JSONObject v,String k)throws Exception{Object n=v.get(k);require(n instanceof Integer||n instanceof Long);return safe(((Number)n).longValue());}
    static boolean owner(String s){if(s==null||s.isEmpty()||s.length()>256)return false;for(char c:s.toCharArray())if(c<32||c==127)return false;return true;}
    static boolean nonblank(String s){for(char c:s.toCharArray())if(!(c>=9&&c<=13||c==32||c==0xa0||c==0x1680||c>=0x2000&&c<=0x200a||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff))return true;return false;}
    static String text(JSONObject v,String k,int limit)throws Exception{String s=string(v,k);require(nonblank(s)&&s.length()<=limit);for(char c:s.toCharArray())require(c>=32||c=='\n'||c=='\r'||c=='\t');return s;}
    static String quote(String s){
        StringBuilder out=new StringBuilder("\"");
        for(int i=0;i<s.length();i++){char c=s.charAt(i);switch(c){case '"':out.append("\\\"");break;case '\\':out.append("\\\\");break;case '\b':out.append("\\b");break;case '\f':out.append("\\f");break;case '\n':out.append("\\n");break;case '\r':out.append("\\r");break;case '\t':out.append("\\t");break;default:
            boolean lone=Character.isHighSurrogate(c)?i+1>=s.length()||!Character.isLowSurrogate(s.charAt(i+1)):Character.isLowSurrogate(c)&&(i==0||!Character.isHighSurrogate(s.charAt(i-1)));
            if(c<32||lone)out.append(String.format(java.util.Locale.ROOT,"\\u%04x",(int)c));else out.append(c);
        }}return out.append('"').toString();
    }
    static String canonical(Object v)throws Exception{
        if(v==null||v==JSONObject.NULL)return "null";if(v instanceof String)return quote((String)v);if(v instanceof Boolean)return v.toString();
        if(v instanceof Integer||v instanceof Long)return Long.toString(safe(((Number)v).longValue()));
        if(v instanceof JSONObject){JSONObject o=(JSONObject)v;ArrayList<String> keys=new ArrayList<>();Iterator<String> it=o.keys();while(it.hasNext())keys.add(it.next());Collections.sort(keys);ArrayList<String> parts=new ArrayList<>();for(String k:keys)parts.add(quote(k)+":"+canonical(o.get(k)));return "{"+String.join(",",parts)+"}";}
        if(v instanceof JSONArray){JSONArray a=(JSONArray)v;ArrayList<String> parts=new ArrayList<>();for(int i=0;i<a.length();i++)parts.add(canonical(a.get(i)));return "["+String.join(",",parts)+"]";}
        throw new IOException("PORTABLE_CANONICAL_TYPE");
    }
    static String sha(String text)throws Exception{
        java.nio.ByteBuffer encoded=StandardCharsets.UTF_8.newEncoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPLACE)
            .replaceWith(new byte[]{(byte)0xef,(byte)0xbf,(byte)0xbd}).encode(java.nio.CharBuffer.wrap(text));
        byte[] bytes=new byte[encoded.remaining()];encoded.get(bytes);StringBuilder out=new StringBuilder();
        for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))out.append(String.format(java.util.Locale.ROOT,"%02x",b));return out.toString();
    }
    static void verify(JSONObject c,String owner,String device,long now,boolean fresh)throws Exception{
        fields(c,"schema","owner","deviceId","request","requestSha256","executorId","displayInput");
        require(owner(owner)&&"rockstaros.runtime-command/1".equals(string(c,"schema"))&&owner.equals(string(c,"owner"))&&device.equals(string(c,"deviceId"))&&id(device)&&"pixel-linux-gguf".equals(string(c,"executorId")));
        text(c,"displayInput",2000);
        JSONObject r=c.getJSONObject("request");fields(r,"id","threadId","input","agent","model","deadline","maxOutputTokens");require(id(string(r,"id"))&&id(string(r,"threadId")));
        text(r,"input",4000);
        long cap=integer(r,"maxOutputTokens"),deadline=integer(r,"deadline");require(cap>=1&&cap<=1024&&deadline>=0&&(!fresh||now>=0&&safe(now)==now&&deadline>now&&deadline-now<=120000));
        JSONObject a=r.getJSONObject("agent"),m=r.getJSONObject("model");fields(a,"id","name","instructions","modelId","sha256");fields(m,"id","scheme","sha256");
        require(id(string(a,"id")));String name=text(a,"name",80),instructions=text(a,"instructions",1200),modelId=string(m,"id");
        require(string(a,"modelId").equals(modelId)&&modelId.matches("[a-z0-9][a-z0-9.-]{0,79}")&&!modelId.contains("..")&&"gguf-sha256".equals(string(m,"scheme"))&&string(m,"sha256").matches("[a-f0-9]{64}"));
        String recipe="{\"name\":"+quote(name)+",\"instructions\":"+quote(instructions)+",\"modelId\":"+quote(modelId)+"}";
        require(sha(recipe).equals(string(a,"sha256"))&&sha(canonical(r)).equals(string(c,"requestSha256")));
    }
    static void preparation(JSONObject c,String owner,String device,long now,boolean fresh)throws Exception{
        fields(c,"schema","owner","deviceId","request","requestSha256");
        require(owner(owner)&&"rockstaros.agent-preparation-command/1".equals(string(c,"schema"))&&owner.equals(string(c,"owner"))&&device.equals(string(c,"deviceId"))&&id(device));
        JSONObject r=c.getJSONObject("request");fields(r,"id","threadId","agent","model","deadline");
        require(id(string(r,"id"))&&id(string(r,"threadId")));long deadline=integer(r,"deadline");
        require(deadline>=0&&(!fresh||now>=0&&safe(now)==now&&deadline>now&&deadline-now<=120000));
        JSONObject a=r.getJSONObject("agent"),m=r.getJSONObject("model");fields(a,"id","name","instructions","modelId","sha256");fields(m,"id","scheme","sha256");
        require(id(string(a,"id")));String name=text(a,"name",80),instructions=text(a,"instructions",1200),modelId=string(m,"id");
        require(string(a,"modelId").equals(modelId)&&modelId.matches("[a-z0-9][a-z0-9.-]{0,79}")&&!modelId.contains("..")&&"gguf-sha256".equals(string(m,"scheme"))&&string(m,"sha256").matches("[a-f0-9]{64}"));
        String recipe="{\"name\":"+quote(name)+",\"instructions\":"+quote(instructions)+",\"modelId\":"+quote(modelId)+"}";
        require(sha(recipe).equals(string(a,"sha256"))&&sha(canonical(r)).equals(string(c,"requestSha256")));
    }
    static void report(JSONObject value,JSONObject command,String claim)throws Exception{
        fields(value,"schema","id","requestSha256","claimId","state","text","outputSha256","model","durationMs","errorCode");
        JSONObject request=command.getJSONObject("request");
        require("rockstaros.runtime-report/1".equals(string(value,"schema"))&&string(request,"id").equals(string(value,"id"))
            &&string(command,"requestSha256").equals(string(value,"requestSha256"))&&claim.equals(string(value,"claimId"))&&id(claim)
            &&canonical(request.getJSONObject("model")).equals(canonical(value.getJSONObject("model"))));
        if("review".equals(string(value,"state"))){
            String text=string(value,"text");long duration=integer(value,"durationMs");
            require(nonblank(text)&&text.length()<=32000&&duration>=0&&duration<=120000&&value.isNull("errorCode")
                &&sha(text).equals(string(value,"outputSha256")));
        }else require("unknown".equals(string(value,"state"))&&value.isNull("text")&&value.isNull("outputSha256")&&value.isNull("durationMs")
            &&string(value,"errorCode").matches("[A-Z][A-Z0-9_]{0,99}"));
    }
}
