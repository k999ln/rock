package dev.rock.automation;

import android.content.Context;
import dev.rock.core.Engine;
import dev.rock.sdk.LocalWorkDraft;
import java.net.URI;
import org.json.*;

/** Resolves public immutable data, not arbitrary code or executables. No author/model ID allowlist. */
final class SkyAddonResolver {
    private final Context context;
    SkyAddonResolver(Context c){context=c;}
    String inspect(String source) throws Exception {
        SkyAddonStore.clean(source,1000);URI u=URI.create(source);
        if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||u.getPort()!=-1||u.getQuery()!=null||u.getFragment()!=null)throw new SecurityException("ADDON_SOURCE_INVALID");
        if("huggingface.co".equals(u.getHost()))return model(u.getPath());
        if("github.com".equals(u.getHost()))return agent(u.getPath());
        throw new SecurityException("ADDON_SOURCE_UNSUPPORTED");
    }
    private String model(String path) throws Exception {
        String[] a=path.split("/");if(a.length!=3&&a.length!=6)throw new SecurityException("MODEL_SOURCE_INVALID");
        String repo=a[1]+"/"+a[2];if(!repo.matches(SkyAddonNetwork.REPO))throw new SecurityException("MODEL_SOURCE_INVALID");
        if(a.length==6&&(!a[3].equals("resolve")||!a[4].matches("main|[a-f0-9]{40}")||!a[5].matches("[A-Za-z0-9_.-]+\\.gguf")))throw new SecurityException("MODEL_SOURCE_INVALID");
        String revision=a.length==6&&!a[4].equals("main")?"/revision/"+a[4]:"";
        JSONObject metadata=new JSONObject(SkyAddonNetwork.json("https://huggingface.co/api/models/"+repo+revision+"?blobs=true"));
        if(!repo.equals(metadata.getString("id"))||metadata.optBoolean("private")||!Boolean.FALSE.equals(metadata.opt("gated")))throw new SecurityException("PUBLIC_UNGATED_MODEL_REQUIRED");
        String sha=metadata.getString("sha");if(!sha.matches("[a-f0-9]{40}")||!revision.isEmpty()&&!a[4].equals(sha))throw new SecurityException("MODEL_REVISION_INVALID");
        String license=metadata.getJSONObject("cardData").optString("license");
        String licenseId="apache-2.0".equals(license)?"Apache-2.0":"mit".equals(license)?"MIT":"bsd-3-clause".equals(license)?"BSD-3-Clause":"";
        if(licenseId.isEmpty())throw new SecurityException("MODEL_LICENSE_NEEDS_ADAPTER");
        JSONArray files=new JSONArray(),siblings=metadata.getJSONArray("siblings");JSONObject selected=null;
        for(int i=0;i<siblings.length();i++){JSONObject f=siblings.getJSONObject(i);String name=f.optString("rfilename");JSONObject lfs=f.optJSONObject("lfs");
            if(name.matches("[A-Za-z0-9_.-]+\\.gguf")&&lfs!=null&&lfs.optString("sha256").matches("[a-f0-9]{64}")&&lfs.optLong("size")>1_048_576&&lfs.optLong("size")<=4_294_967_296L){
                if(files.length()<32)files.put(new JSONObject().put("name",name).put("bytes",lfs.getLong("size")).put("source","https://huggingface.co/"+repo+"/resolve/"+sha+"/"+name));
                if(a.length==6&&a[5].equals(name))selected=f;
            }}
        if(a.length==3)return new JSONObject().put("status","choose_file").put("repository",repo).put("revision",sha).put("files",files).put("executionStarted",false).toString();
        if(selected==null)throw new SecurityException("SINGLE_GGUF_FILE_UNAVAILABLE");
        String filename=selected.getString("rfilename"),url="https://huggingface.co/"+repo+"/resolve/"+sha+"/"+filename;
        GgufMetadata gguf=SkyAddonNetwork.metadata(url);
        if(!java.util.Set.of("qwen2","qwen3","llama","gemma","gemma2","phi3").contains(gguf.architecture))throw new SecurityException("MODEL_ARCHITECTURE_NEEDS_ADAPTER");
        String quant="";for(String q:new String[]{"Q4_K_M","Q4_K_S","Q5_K_M","Q5_K_S","Q8_0","Q6_K","Q4_0"})if(filename.toUpperCase(java.util.Locale.ROOT).contains(q)){quant=q;break;}
        if(quant.isEmpty())throw new SecurityException("MODEL_QUANTIZATION_NEEDS_ADAPTER");
        JSONObject lfs=selected.getJSONObject("lfs");long bytes=lfs.getLong("size");String id="sky.model."+Engine.digest(AndroidOwner.current(context)+"\n"+url);
        JSONObject p=new JSONObject().put("profileId",id).put("version",1).put("weightsSha256",lfs.getString("sha256"))
            .put("tokenizerSha256",gguf.tokenizerHash).put("templateSha256",gguf.templateHash).put("licenseId",licenseId)
            .put("publisherId","owner-pin:"+Engine.digest(AndroidOwner.current(context))).put("signingKeyId","owner-consent").put("manifestSignatureBase64Url","")
            .put("runtimeComponentId",LocalAiConnection.RUNTIME_COMPONENT_ID).put("runtimeVersionCode",LocalAiConnection.PACKAGE_VERSION_CODE)
            .put("runtimeApiMin",LocalAiConnection.API_VERSION).put("runtimeApiMax",LocalAiConnection.API_VERSION).put("format","GGUF").put("quantization",quant)
            .put("contextTokens",2048).put("planSchemaId",LocalWorkDraft.SCHEMA).put("artifactBytes",bytes).put("minRamBytes",Math.max(4_294_967_296L,2*bytes+2_147_483_648L));
        JSONObject entry=new JSONObject().put("name",SkyAddonStore.clean(repo+" · "+filename,120)).put("fileName",filename).put("source",url)
            .put("licenseUrl","https://huggingface.co/"+repo+"/blob/"+sha+"/README.md")
            .put("trustLabel","利用者が版とhashを指定。作者署名なし・品質未検証。公開元: "+repo)
            .put("profile",p).put("tasks",new JSONArray(java.util.List.of("writing","summary","translation","code","planning"))).put("autoPriority",20);
        new LocalModelCatalog.Entry(entry);
        return new SkyAddonStore(context).propose(new JSONObject().put("kind","model").put("id",id).put("name",entry.getString("name"))
            .put("source",url).put("authorProof","repository_origin_not_author_signature").put("entry",entry).put("architecture",gguf.architecture).put("quality","unverified"));
    }
    private String agent(String path) throws Exception {
        String[] a=path.split("/");if(a.length<6||!a[3].equals("blob")||!a[4].matches("[A-Za-z0-9_.-]+"))throw new SecurityException("AGENT_FILE_URL_REQUIRED");
        String repo=a[1]+"/"+a[2];if(!repo.matches(SkyAddonNetwork.REPO))throw new SecurityException("AGENT_SOURCE_INVALID");
        String file=String.join("/",java.util.Arrays.copyOfRange(a,5,a.length));
        if(!file.matches("[A-Za-z0-9_./-]+\\.json")||file.contains("..")||file.contains("//"))throw new SecurityException("AGENT_FILE_INVALID");
        JSONObject commit=new JSONObject(SkyAddonNetwork.json("https://api.github.com/repos/"+repo+"/commits/"+a[4]));String sha=commit.getString("sha");
        if(!sha.matches("[a-f0-9]{40}"))throw new SecurityException("AGENT_REVISION_INVALID");
        JSONObject f=new JSONObject(SkyAddonNetwork.json("https://api.github.com/repos/"+repo+"/contents/"+file+"?ref="+sha));
        if(!file.equals(f.getString("path"))||!"file".equals(f.getString("type"))||!"base64".equals(f.getString("encoding"))||f.getLong("size")>16384)throw new SecurityException("AGENT_FILE_INVALID");
        byte[] bytes=java.util.Base64.getMimeDecoder().decode(f.getString("content"));if(bytes.length!=f.getLong("size"))throw new SecurityException("AGENT_FILE_INVALID");
        return new SkyAddonStore(context).propose(SkyAddonStore.agent(new JSONObject(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)),"https://github.com/"+repo+"/blob/"+sha+"/"+file));
    }
}
