package dev.rock.shell;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.ByteArrayOutputStream;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONObject;

/** Host gate only (JDK17+); not included in Android or a public execution API. */
public final class EvePortableHostProbe {
    private static JSONObject bridge(Path socket,JSONObject body)throws Exception{
        byte[] bytes=(EvePortableCommands.canonical(body)+"\n").getBytes(StandardCharsets.UTF_8);
        if(bytes.length>24000)throw new java.io.IOException("PROBE_FRAME_LIMIT");
        long deadline=System.nanoTime()+20_000_000_000L;
        try(SocketChannel channel=SocketChannel.open(StandardProtocolFamily.UNIX)){
            channel.configureBlocking(false);channel.connect(UnixDomainSocketAddress.of(socket));
            while(!channel.finishConnect()){if(System.nanoTime()>deadline)throw new java.io.IOException("PROBE_TIMEOUT");Thread.sleep(2);}
            ByteBuffer out=ByteBuffer.wrap(bytes);
            while(out.hasRemaining()){if(System.nanoTime()>deadline)throw new java.io.IOException("PROBE_TIMEOUT");if(channel.write(out)==0)Thread.sleep(2);}
            ByteArrayOutputStream received=new ByteArrayOutputStream();ByteBuffer in=ByteBuffer.allocate(4096);
            for(;;){
                if(System.nanoTime()>deadline)throw new java.io.IOException("PROBE_TIMEOUT");int n=channel.read(in);
                if(n<0)throw new java.io.EOFException();if(n==0){Thread.sleep(2);continue;}
                in.flip();while(in.hasRemaining()){
                    byte b=in.get();if(b==10){if(in.hasRemaining())throw new java.io.IOException("PROBE_TRAILING_FRAME");return new JSONObject(received.toString("UTF-8"));}
                    if(received.size()>=110000)throw new java.io.IOException("PROBE_RESPONSE_LIMIT");received.write(b);
                }in.clear();
            }
        }
    }
    public static void main(String[] args)throws Exception{
        // JDK HttpURLConnection restricts Origin by default; Android's transport is separate.
        // Only this test JVM may send the production client's fixed Origin. Server checks stay on.
        System.setProperty("sun.net.http.allowRestrictedHeaders","true");
        EvePortableClaimJournal journal=null;EvePortableController controller=null;EvePortableAgentPreparation preparation=null;AtomicBoolean active=new AtomicBoolean(true);
        try(BufferedReader input=new BufferedReader(new InputStreamReader(System.in,StandardCharsets.UTF_8))){
            String line;
            while((line=input.readLine())!=null){
                if(line.length()>200000)throw new java.io.IOException("PROBE_INPUT_LIMIT");JSONObject command=new JSONObject(line);
                try{
                    String action=command.getString("action");JSONObject answer;
                    if("open".equals(action)){
                        if(journal!=null)throw new IllegalStateException();
                        System.setProperty("javax.net.ssl.trustStore",command.getString("trustStore"));System.setProperty("javax.net.ssl.trustStorePassword","fixture-only");
                        String origin=command.getString("origin"),owner=command.getString("owner"),device=command.getString("device");
                        byte[] secret=java.util.Base64.getDecoder().decode(command.getString("key"));SecretKeySpec key=new SecretKeySpec(secret,"AES");java.util.Arrays.fill(secret,(byte)0);
                        journal=new EvePortableClaimJournal(Path.of(command.getString("directory")),"dev.rock.shell",origin,owner,device,()->key);
                        EvePortableHttpClient account=new EvePortableHttpClient(origin,command.getString("authorization"),new EvePortableHttpClient.Guard(){
                            public void check()throws Exception{if(!active.get())throw new EvePortableController.Stopped();}
                            public void unauthorized(){active.set(false);}
                        });
                        Path socket=Path.of(command.getString("socket"));controller=new EvePortableController(account,c->bridge(socket,c),journal,owner,device,
                            EvePortableCommands.sha(origin+"\n"+owner+"\n"+device),active::get,System::currentTimeMillis);
                        if(command.has("presenceFile")){
                            Path presenceFile=Path.of(command.getString("presenceFile")).toAbsolutePath().normalize();
                            EvePortableCommands.require(presenceFile.startsWith(Path.of(command.getString("directory")).toAbsolutePath().normalize().getParent()));
                            preparation=new EvePortableAgentPreparation(account,c->bridge(socket,c),()->new JSONObject(java.nio.file.Files.readString(presenceFile)),owner,device,
                                EvePortableCommands.sha(origin+"\n"+owner+"\n"+device),active::get,System::currentTimeMillis);
                        }
                        answer=new JSONObject().put("opened",true);
                    }else if("prepare".equals(action)){if(preparation==null)throw new IllegalStateException();answer=new JSONObject().put("registered",preparation.poll());}
                    else if("poll".equals(action))answer=controller.poll(command.isNull("presence")?null:command.getJSONObject("presence"));
                    else if("read".equals(action)){
                        JSONObject row=journal.read(command.getString("id"));answer=new JSONObject().put("state",row.getString("state")).put("claimId",row.getString("claimId"));
                        if(row.has("publication"))answer.put("publication",row.getJSONObject("publication").getString("phase"));
                    }else if("close".equals(action)){
                        if(journal!=null)journal.close();journal=null;System.out.println(new JSONObject().put("closed",true));break;
                    }else throw new IllegalArgumentException();
                    System.out.println(new JSONObject().put("ok",true).put("result",answer));
                }catch(Exception failure){
                    // No token, request, model output or exception body in the process protocol.
                    JSONObject error=new JSONObject().put("ok",false).put("errorClass",failure.getClass().getSimpleName());
                    String message=failure.getMessage();if(message!=null&&message.matches("[A-Z][A-Z0-9_]{0,99}"))error.put("errorCode",message);
                    java.util.List<String> places=new java.util.ArrayList<>();for(StackTraceElement frame:failure.getStackTrace())
                        if(frame.getClassName().startsWith("dev.rock.shell.")){places.add(frame.getClassName()+":"+frame.getLineNumber());if(places.size()==3)break;}
                    error.put("places",new org.json.JSONArray(places));System.out.println(error);
                }
            }
        }finally{if(journal!=null)journal.close();}
    }
}
