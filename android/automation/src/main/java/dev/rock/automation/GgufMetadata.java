package dev.rock.automation;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.DigestInputStream;

/** Reads bounded GGUF v2/v3 metadata as data. Does not load tensors or execute a template. */
final class GgufMetadata {
    final String tokenizerHash, templateHash, architecture; final long context;
    GgufMetadata(String t, String c, String a, long n) { tokenizerHash=t; templateHash=c; architecture=a; context=n; }
    static final class Reader {
        final DigestInputStream in; long consumed; final long deadline=(System.nanoTime()/1_000_000L)+30_000;
        Reader(InputStream source, MessageDigest digest) { in=new DigestInputStream(new BufferedInputStream(source,65536),digest); in.on(false); }
        byte[] bytes(int n) throws Exception {
            if(n<0 || (consumed+=n)>16_777_216 || (System.nanoTime()/1_000_000L)>deadline) throw new IOException("GGUF_METADATA_LIMIT");
            byte[] b=new byte[n]; int p=0,k; while(p<n && (k=in.read(b,p,n-p))>0){p+=k;if((System.nanoTime()/1_000_000L)>deadline)throw new IOException("GGUF_METADATA_DEADLINE");}
            if(p!=n)throw new EOFException("GGUF_METADATA_INCOMPLETE"); return b;
        }
        long number(int n) throws Exception { byte[] b=bytes(n);long x=0;for(int i=n-1;i>=0;i--)x=(x<<8)|(b[i]&255L);return x; }
        String text() throws Exception {long n=number(8);if(n<0||n>1_048_576)throw new IOException("GGUF_STRING_LIMIT");return StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes((int)n))).toString();}
        Object value(int type, int depth) throws Exception {
            switch(type) {
                case 0: case 1: case 7:return number(1);
                case 2: case 3:return number(2);
                case 4: case 5: case 6:return number(4);
                case 10: case 11: case 12:return number(8);
                case 8:return text();
                case 9: int element=(int)number(4);long count=number(8);
                    if(depth>0||element==9||count<0||count>300_000)throw new IOException("GGUF_ARRAY_LIMIT");
                    for(long j=0;j<count;j++)value(element,depth+1);return null;
                default:throw new IOException("GGUF_METADATA_TYPE_UNSUPPORTED");
            }
        }
    }
    static GgufMetadata read(InputStream stream) throws Exception {
        MessageDigest hash=MessageDigest.getInstance("SHA-256");Reader r=new Reader(stream,hash);
        if(!java.util.Arrays.equals(r.bytes(4),new byte[]{'G','G','U','F'}))throw new IOException("GGUF_MAGIC_INVALID");
        long version=r.number(4);if(version!=2&&version!=3)throw new IOException("GGUF_VERSION_UNSUPPORTED");
        long tensors=r.number(8), fields=r.number(8);
        if(tensors<1||tensors>1_000_000||fields<1||fields>4096)throw new IOException("GGUF_METADATA_LIMIT");
        String template=null,architecture=null;long context=0;int tokenizerFields=0;
        java.util.Set<String> seen=new java.util.HashSet<>();
        for(int i=0;i<fields;i++) {
            String key=r.text();if(key.length()>256||!seen.add(key))throw new IOException("GGUF_METADATA_KEY_INVALID");
            boolean token=key.startsWith("tokenizer.")&&!key.equals("tokenizer.chat_template");
            if(token){hash.update((key+"\n").getBytes(StandardCharsets.UTF_8));tokenizerFields++;}
            r.in.on(token);int type=(int)r.number(4);Object v=r.value(type,0);r.in.on(false);
            if(key.equals("tokenizer.chat_template")&&v instanceof String)template=(String)v;
            if(key.equals("general.architecture")&&v instanceof String)architecture=(String)v;
            if(key.endsWith(".context_length")&&v instanceof Long)context=(Long)v;
        }
        if(tokenizerFields==0||template==null||template.isEmpty()||architecture==null)throw new IOException("GGUF_CHAT_METADATA_REQUIRED");
        return new GgufMetadata(hex(hash.digest()),dev.rock.core.Engine.digest(template),architecture,context);
    }
    static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte v:b)s.append(String.format(java.util.Locale.ROOT,"%02x",v&255));return s.toString();}
}
