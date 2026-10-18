package dev.rock.automation;

import java.net.URI;
import java.io.*;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;

/** Public, credential-free adapter. Discovery text never supplies an arbitrary network origin. */
final class SkyAddonNetwork {
    static final String REPO="[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}";
    static String json(String url) throws Exception {
        URI u=URI.create(url);String p=u.getPath();
        if(!"https".equals(u.getScheme())||u.getPort()!=-1||u.getUserInfo()!=null||u.getFragment()!=null
            || !("huggingface.co".equals(u.getHost())&&p.matches("/api/models/"+REPO+"(?:/revision/[a-f0-9]{40})?")
                || "api.github.com".equals(u.getHost())&&p.matches("/repos/"+REPO+"/(?:commits/[A-Za-z0-9_.-]+|contents/[A-Za-z0-9_./-]+)")))
            throw new SecurityException("ADDON_ORIGIN_DENIED");
        HttpsURLConnection c=(HttpsURLConnection)u.toURL().openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(8000);c.setReadTimeout(8000);
        c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","RockstarOS-Sky-addons");
        try {
            if(c.getResponseCode()!=200)throw new IOException("ADDON_SOURCE_UNAVAILABLE");
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                long deadline=System.nanoTime()+15_000_000_000L;byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(System.nanoTime()>deadline)throw new IOException("ADDON_RESPONSE_DEADLINE");if(out.size()+n>1_048_576)throw new IOException("ADDON_RESPONSE_TOO_LARGE");out.write(b,0,n);}
                return out.toString(StandardCharsets.UTF_8.name());
            }
        }finally{c.disconnect();}
    }
    static GgufMetadata metadata(String source) throws Exception {
        if(!source.matches("https://huggingface\\.co/"+REPO+"/resolve/[a-f0-9]{40}/[A-Za-z0-9_.-]+\\.gguf"))throw new SecurityException("MODEL_SOURCE_NOT_PINNED");
        URI u=URI.create(source);java.util.Set<String> visited=new java.util.HashSet<>();
        for(int i=0;i<4;i++){
            String host=u.getHost();
            if(!"https".equals(u.getScheme())||u.getPort()!=-1||u.getUserInfo()!=null||u.getFragment()!=null||host==null
                || !(host.equals("huggingface.co")||host.equals("cdn-lfs.huggingface.co")||host.equals("cdn-lfs-us-1.hf.co")
                    ||host.equals("cas-bridge.xethub.hf.co")||host.equals("us.aws.cdn.hf.co")))throw new SecurityException("MODEL_REDIRECT_DENIED");
            if(!visited.add(u.toString()))throw new IOException("MODEL_REDIRECT_LOOP");
            HttpsURLConnection c=(HttpsURLConnection)u.toURL().openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(8000);c.setReadTimeout(8000);
            c.setRequestProperty("Range","bytes=0-16777215");
            try {
                int status=c.getResponseCode();
                if(status==301||status==302||status==303||status==307||status==308){u=u.resolve(c.getHeaderField("Location"));continue;}
                if(status!=206&&status!=200)throw new IOException("MODEL_HEADER_UNAVAILABLE");
                if(status==206&&(c.getHeaderField("Content-Range")==null||!c.getHeaderField("Content-Range").startsWith("bytes 0-")))throw new IOException("MODEL_HEADER_RANGE_MISMATCH");
                try(InputStream in=c.getInputStream()){return GgufMetadata.read(in);}
            }finally{c.disconnect();}
        }
        throw new IOException("MODEL_REDIRECT_LIMIT");
    }
}
