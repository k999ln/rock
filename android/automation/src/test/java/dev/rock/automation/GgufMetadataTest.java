package dev.rock.automation;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;
public final class GgufMetadataTest {
    private final ByteArrayOutputStream b=new ByteArrayOutputStream();
    void n(long x,int size){for(int i=0;i<size;i++)b.write((int)(x>>(8*i))&255);}
    void s(String text){byte[] bytes=text.getBytes(StandardCharsets.UTF_8);n(bytes.length,8);b.write(bytes,0,bytes.length);}
    void field(String key,String value){s(key);n(8,4);s(value);}
    byte[] header(String tokenizer,String template,boolean duplicate){b.reset();b.write('G');b.write('G');b.write('U');b.write('F');n(3,4);n(1,8);n(duplicate?4:3,8);field("general.architecture","qwen2");field("tokenizer.ggml.model",tokenizer);field("tokenizer.chat_template",template);if(duplicate)field("tokenizer.chat_template",template);return b.toByteArray();}
    @Test public void metadataHashesBindActualEmbeddedTokenizerAndTemplate()throws Exception {
        GgufMetadata a=GgufMetadata.read(new ByteArrayInputStream(header("bpe","template",false)));
        GgufMetadata t=GgufMetadata.read(new ByteArrayInputStream(header("other","template",false)));
        GgufMetadata c=GgufMetadata.read(new ByteArrayInputStream(header("bpe","changed",false)));
        assertNotEquals(a.tokenizerHash,t.tokenizerHash);assertEquals(a.templateHash,t.templateHash);
        assertEquals(a.tokenizerHash,c.tokenizerHash);assertNotEquals(a.templateHash,c.templateHash);assertEquals("qwen2",a.architecture);
    }
    @Test public void malformedTruncatedDuplicateAndOversizedMetadataAreRejected()throws Exception {
        assertThrows(IOException.class,()->GgufMetadata.read(new ByteArrayInputStream(new byte[24])));
        byte[] valid=header("bpe","template",false);
        assertThrows(IOException.class,()->GgufMetadata.read(new ByteArrayInputStream(java.util.Arrays.copyOf(valid,valid.length-1))));
        assertThrows(IOException.class,()->GgufMetadata.read(new ByteArrayInputStream(header("bpe","template",true))));
        b.reset();b.write('G');b.write('G');b.write('U');b.write('F');n(3,4);n(1,8);n(1,8);n(Long.MAX_VALUE,8);
        assertThrows(IOException.class,()->GgufMetadata.read(new ByteArrayInputStream(b.toByteArray())));
    }
}
