package dev.rock.sdk;

import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

public final class LocalDraftTest {
    private String draft(String task, String body) throws Exception {
        return new JSONObject().put("task", task).put("title", "下書き").put("body", body).put("summary", "- 一\n- 二\n- 三").toString();
    }
    @Test public void closedDraftKeepsCodeAsTextAndRejectsToolFieldsAndChangedTask() throws Exception {
        String code = draft("code", "print('hello')");
        assertTrue(LocalWorkDraft.render(code).contains("print('hello')"));
        assertEquals(LocalWorkDraft.verify("code",code),LocalWorkDraft.verify("code","```json\n"+code+"\n```"));
        assertThrows(IllegalArgumentException.class, () -> LocalWorkDraft.verify("code",code+" trailing"));
        assertThrows(SecurityException.class, () -> LocalWorkDraft.verify("planning","```json\n"+code+"\n```"));
        assertThrows(SecurityException.class, () -> LocalWorkDraft.verify("planning", code));
        assertThrows(IllegalArgumentException.class, () -> LocalWorkDraft.verify("code", new JSONObject(code).put("tool", "shell").toString()));
        assertThrows(IllegalArgumentException.class, () -> LocalWorkDraft.verify("code", "```" + code));
        assertThrows(IllegalArgumentException.class, () -> LocalWorkDraft.prompt("code", "原稿".repeat(400)));
    }
    @Test public void countIsBoundedAndMissingIdeasNeverSeal() throws Exception {
        assertEquals(300, LocalIdeaBatch.requestedCount("RockstarOS・Skyのサービスアイデア300件"));
        assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.requestedCount("アイデア301"));
        String initial = LocalIdeaBatch.start("サービスのアイデア300", 300);
        assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.render(initial));
        assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.append(initial, draft("planning", "1. 家具の記録")));
    }
    @Test public void checkpointsPreserveActualCountAndRejectDuplicateNumberAndTamper() throws Exception {
        String checkpoint = LocalIdeaBatch.start("サービスのアイデア300", 300);
        for (int start = 1; start <= 300; start += LocalIdeaBatch.BATCH_SIZE) {
            StringBuilder body = new StringBuilder();
            for (int i = start; i < start + LocalIdeaBatch.BATCH_SIZE; i++) body.append(i).append(". サービス案").append(i).append('\n');
            String previous = checkpoint;
            checkpoint = LocalIdeaBatch.append(checkpoint, draft("planning", body.toString()));
            assertEquals(start + LocalIdeaBatch.BATCH_SIZE - 1, LocalIdeaBatch.state(checkpoint).getJSONArray("ideas").length());
            if (start == 1) {
                assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.append(previous, draft("planning", body.toString().replace("2. サービス案2", "2. サービス案1"))));
                assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.append(previous, draft("planning", body.toString().replace("2. サービス案2", "2. サービス案1。"))));
                assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.append(previous, draft("planning", body.toString().replace("2. ", "3. "))));
            }
        }
        assertEquals(300, LocalIdeaBatch.render(checkpoint).split("(?m)^\\d+\\. ", -1).length - 1);
        JSONObject tamper = new JSONObject(checkpoint); tamper.put("target", 301);
        assertThrows(IllegalArgumentException.class, () -> LocalIdeaBatch.state(tamper.toString()));
    }
    @Test public void presentationBlankLinesAndConsistentLocalNumbersDoNotInventItems() throws Exception {
        String checkpoint=LocalIdeaBatch.start("サービスのアイデア20",20);StringBuilder first=new StringBuilder();
        for(int i=1;i<=10;i++)first.append(i).append(". 最初のサービス").append(i).append("\n\n");
        checkpoint=LocalIdeaBatch.append(checkpoint,draft("planning",first.toString()));assertEquals(10,LocalIdeaBatch.state(checkpoint).getJSONArray("ideas").length());
        StringBuilder second=new StringBuilder();for(int i=1;i<=10;i++)second.append(i).append(". 別のサービス").append(i).append("\n");
        String complete=LocalIdeaBatch.append(checkpoint,draft("planning",second.toString()));
        assertEquals(20,LocalIdeaBatch.state(complete).getJSONArray("ideas").length());assertTrue(LocalIdeaBatch.render(complete).contains("20. 別のサービス10"));
        String previous=checkpoint;assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.append(previous,draft("planning",second.toString().replace("2. ","12. "))));
    }
    @Test public void exactBulletOrStringArrayItemsUseBrokerNumbersAndNeverPadding() throws Exception {
        String checkpoint=LocalIdeaBatch.start("アイデア20",20);StringBuilder bullets=new StringBuilder();JSONArray array=new JSONArray();
        for(int i=1;i<=10;i++){bullets.append("- 新しいサービス").append(i).append("\n");array.put("別の新しいサービス"+i);}
        checkpoint=LocalIdeaBatch.append(checkpoint,draft("planning",bullets.toString()));
        String complete=LocalIdeaBatch.append(checkpoint,draft("planning",array.toString()));assertEquals(20,LocalIdeaBatch.state(complete).getJSONArray("ideas").length());
        String previous=checkpoint;array.remove(9);assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.append(previous,draft("planning",array.toString())));
    }
    @Test public void structuredSubtypeCountComesFromSavedActualPrefixAndRemainingTarget() throws Exception {
        assertEquals("local-work@1/ideas-10-v1",LocalIdeaBatch.schema(LocalIdeaBatch.start("アイデア300",300)));
        assertEquals("local-work@1/ideas-1-v1",LocalIdeaBatch.schema(LocalIdeaBatch.start("アイデア1",1)));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.schemaForCount(0));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.schemaForCount(11));
    }
}
