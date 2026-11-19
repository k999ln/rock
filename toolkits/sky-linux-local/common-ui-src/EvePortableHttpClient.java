package dev.rock.shell;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.Proxy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Runtime-only wire client, shared by native account binding and the controlled host gate. */
final class EvePortableHttpClient implements EvePortableController.Account, EvePortableAgentPreparation.Account {
    interface Guard { void check() throws Exception; void unauthorized() throws Exception; }
    private final String origin,authorization;
    private final Guard guard;
    private final boolean loopback;
    EvePortableHttpClient(String origin,String authorization,Guard guard)throws Exception{
        URI u=new URI(origin);loopback="http".equals(u.getScheme())&&("127.0.0.1".equals(u.getHost())||"localhost".equals(u.getHost()));
        EvePortableCommands.require(("https".equals(u.getScheme())||loopback)&&u.getHost()!=null&&u.getRawUserInfo()==null
            &&u.getRawQuery()==null&&u.getRawFragment()==null&&u.getRawPath().isEmpty()&&u.getPort()!=0
            &&authorization!=null&&authorization.matches("Bearer rock_session_[A-Za-z0-9_-]{43}")&&guard!=null);
        this.origin=origin;this.authorization=authorization;this.guard=guard;
    }
    private JSONObject request(String path,String method,JSONObject body)throws Exception{
        guard.check();URL url=new URL(origin+path);
        HttpURLConnection http=(HttpURLConnection)(loopback?url.openConnection(Proxy.NO_PROXY):url.openConnection());
        http.setInstanceFollowRedirects(false);http.setConnectTimeout(10000);http.setReadTimeout(15000);
        http.setRequestMethod(method);http.setRequestProperty("Authorization",authorization);http.setRequestProperty("Accept","application/json");
        http.setRequestProperty("Origin",origin);http.setRequestProperty("Cache-Control","no-store");
        try{
            if(body!=null){byte[] bytes=EvePortableCommands.canonical(body).getBytes(StandardCharsets.UTF_8);EvePortableCommands.require(bytes.length<=120000);
                http.setDoOutput(true);http.setRequestProperty("Content-Type","application/json");http.setFixedLengthStreamingMode(bytes.length);
                guard.check();try(OutputStream out=http.getOutputStream()){out.write(bytes);}
            }
            guard.check();int code=http.getResponseCode();guard.check();
            // Revocation must stop owned work even when the server returns no error body.
            if(code==401){guard.unauthorized();throw new EvePortableController.HttpFailure(code);}
            if(code<200||code>=300)throw new EvePortableController.HttpFailure(code);
            InputStream raw=http.getInputStream();
            if(raw==null)throw new IOException("PORTABLE_ACCOUNT_RESPONSE_MISSING");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=raw){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(bytes.size()+n>640000)throw new IOException("PORTABLE_ACCOUNT_RESPONSE_TOO_LARGE");bytes.write(b,0,n);}}
            guard.check();
            String type=http.getContentType();if(type==null||!type.split(";",2)[0].trim().equalsIgnoreCase("application/json"))throw new IOException("PORTABLE_ACCOUNT_RESPONSE_INVALID");
            String decoded=StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
            JSONObject result=new JSONObject(decoded);guard.check();return result;
        }finally{http.disconnect();}
    }
    public JSONObject preparations()throws Exception{return request("/api/eve/runtime?agentPreparations=1","GET",null);}
    public JSONObject inspect()throws Exception{return request("/api/eve/runtime","GET",null);}
    public JSONObject put(JSONObject body)throws Exception{return request("/api/eve/runtime","PUT",body);}
    public JSONObject read(String id)throws Exception{
        EvePortableCommands.require(EvePortableCommands.id(id));
        try{return request("/api/eve/runtime?id="+id,"GET",null);}catch(EvePortableController.HttpFailure error){if(error.status==404)return null;throw error;}
    }
}
