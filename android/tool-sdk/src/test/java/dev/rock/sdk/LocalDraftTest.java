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
}
