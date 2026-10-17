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
        String checkpoint=LocalIdeaBatch.start("サービスのアイデア10",10);StringBuilder first=new StringBuilder();
        for(int i=1;i<=5;i++)first.append(i).append(". 最初のサービス").append(i).append("\n\n");
        checkpoint=LocalIdeaBatch.append(checkpoint,draft("planning",first.toString()));assertEquals(5,LocalIdeaBatch.state(checkpoint).getJSONArray("ideas").length());
        StringBuilder second=new StringBuilder();for(int i=1;i<=5;i++)second.append(i).append(". 別のサービス").append(i).append("\n");
        String complete=LocalIdeaBatch.append(checkpoint,draft("planning",second.toString()));
        assertEquals(10,LocalIdeaBatch.state(complete).getJSONArray("ideas").length());assertTrue(LocalIdeaBatch.render(complete).contains("10. 別のサービス5"));
        String previous=checkpoint;assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.append(previous,draft("planning",second.toString().replace("2. ","12. "))));
    }
    @Test public void exactBulletOrStringArrayItemsUseBrokerNumbersAndNeverPadding() throws Exception {
        String checkpoint=LocalIdeaBatch.start("アイデア10",10);StringBuilder bullets=new StringBuilder();JSONArray array=new JSONArray();
        for(int i=1;i<=5;i++){bullets.append("- 新しいサービス").append(i).append("\n");array.put("別の新しいサービス"+i);}
        checkpoint=LocalIdeaBatch.append(checkpoint,draft("planning",bullets.toString()));
        String complete=LocalIdeaBatch.append(checkpoint,draft("planning",array.toString()));assertEquals(10,LocalIdeaBatch.state(complete).getJSONArray("ideas").length());
        String previous=checkpoint;array.remove(4);assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.append(previous,draft("planning",array.toString())));
    }
    @Test public void structuredSubtypeCountComesFromSavedActualPrefixAndRemainingTarget() throws Exception {
        assertEquals("local-work@1/ideas-5-v2",LocalIdeaBatch.schema(LocalIdeaBatch.start("アイデア300",300)));
        assertEquals("local-work@1/ideas-1-v2",LocalIdeaBatch.schema(LocalIdeaBatch.start("アイデア1",1)));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.schemaForCount(0));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.schemaForCount(11));
    }
    @Test public void boundedPiecesPreserveTargetAndValidateAcrossTheSavedAndInMemoryPrefix() throws Exception {
        String original=LocalIdeaBatch.start("サービスのアイデア300",300);JSONArray first=new JSONArray(),second=new JSONArray();
        for(int i=0;i<5;i++){first.put("暮らしのサービス"+i);second.put("仕事のサービス"+i);}
        String half=LocalIdeaBatch.appendPart(original,draft("planning",first.toString()),5);
        assertEquals(0,LocalIdeaBatch.state(original).getJSONArray("ideas").length());
        assertEquals(5,LocalIdeaBatch.state(half).getJSONArray("ideas").length());
        assertEquals(300,LocalIdeaBatch.state(half).getInt("target"));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.appendPart(half,draft("planning",first.toString()),5));
        String complete=LocalIdeaBatch.appendPart(half,draft("planning",second.toString()),5);
        assertEquals(10,LocalIdeaBatch.state(complete).getJSONArray("ideas").length());
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.appendPart(original,draft("planning",first.toString()),6));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.render(half));
    }

    @Test public void legacyTwentyItemCheckpointKeepsItsOriginalReadAndValidationContract() throws Exception {
        String old=new JSONObject().put("kind","local-ideas/1").put("request","アイデア40").put("target",40).put("ideas",new JSONArray()).toString();
        JSONArray values=new JSONArray();for(int i=0;i<20;i++)values.put("旧形式のサービス"+i);
        String next=LocalIdeaBatch.append(old,draft("planning",values.toString()));
        assertEquals(20,LocalIdeaBatch.state(next).getJSONArray("ideas").length());
        assertTrue(LocalIdeaBatch.prompt(old,1).contains("20案"));
    }

    @Test public void requestedSiFormattingPreservesActualCountRejectsAliasDuplicatesAndKeepsHistoricalText() throws Exception {
        String original=LocalIdeaBatch.start("Skyのアイデア20",20);JSONArray values=new JSONArray();for(int i=0;i<5;i++)values.put("暮らしの支援"+i);
        values.put(0,"AIで洗濯支援");values.put(3,"SIで照明を調整");
        JSONObject result=LocalIdeaBatch.state(LocalIdeaBatch.appendPart(original,draft("planning",values.toString()),5));
        assertEquals(5,result.getJSONArray("ideas").length());assertEquals("siで洗濯支援",result.getJSONArray("ideas").getString(0));assertEquals("siで照明を調整",result.getJSONArray("ideas").getString(3));
        values.put(1,"siで洗濯支援");assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.appendPart(original,draft("planning",values.toString()),5));
        JSONObject old=new JSONObject(original);old.getJSONArray("ideas").put("AIで洗濯支援");assertEquals("AIで洗濯支援",LocalIdeaBatch.state(old.toString()).getJSONArray("ideas").getString(0));
        values.put(1,"OpenAIの文書を要約");values.put(2,"https://example.aiを見る");
        result=LocalIdeaBatch.state(LocalIdeaBatch.appendPart(original,draft("planning",values.toString()),5));
        assertEquals("OpenAIの文書を要約",result.getJSONArray("ideas").getString(1));assertEquals("https://example.aiを見る",result.getJSONArray("ideas").getString(2));
        assertTrue(LocalIdeaBatch.promptPart(original,1,5).contains("Skyのアイデア20"));
    }

    @Test public void newProtocolJunkIsRejectedWithoutRewritingHistoricalCheckpoints() throws Exception {
        String initial=LocalIdeaBatch.start("アイデア5",5);
        for(String junk:new String[]{"<|im_end|>","|>","```", "]}", "}]"}) {
            JSONArray values=new JSONArray();for(int i=0;i<5;i++)values.put("家具で暮らしを支援"+i);
            values.put(0,"子育て計画を調整"+junk);
            assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.appendPart(initial,draft("planning",values.toString()),5));
        }
        JSONObject legacy=new JSONObject(initial).put("kind","local-ideas/2").put("batchSize",10);
        legacy.getJSONArray("ideas").put("子育て計画を調整]}<|im_e");
        assertEquals("子育て計画を調整]}<|im_e",LocalIdeaBatch.state(legacy.toString()).getJSONArray("ideas").getString(0));
        assertEquals("local-work@1/ideas-4-v1",LocalIdeaBatch.schema(legacy.toString()));
        assertTrue(LocalIdeaBatch.promptPart(initial,1,5).contains("Miniは家具・建築に埋め込む端末"));
    }
    @Test public void repeatedTopicGroupsGetBoundedRelatedHistoryWithoutLosingOriginalRequest() throws Exception {
        JSONObject saved=new JSONObject(LocalIdeaBatch.start("Skyのアイデア300",300));JSONArray ideas=saved.getJSONArray("ideas");
        for(int i=0;i<270;i++)ideas.put("過去のサービス"+i);
        String prompt=LocalIdeaBatch.promptPart(saved.toString(),1,5);
        assertTrue(prompt.contains("過去のサービス244;"));assertTrue(prompt.contains("過去のサービス269;"));
        assertFalse(prompt.contains("過去のサービス0;"));assertTrue(prompt.contains("Skyのアイデア300"));assertTrue(prompt.length()<1000);
    }
    @Test public void compactReplanPreservesEverySavedIdeaAndFullRequestWithoutGrowingPromptHistory() throws Exception {
        JSONObject legacy=new JSONObject(LocalIdeaBatch.start("RockstarOSとSkyのアイデア300",300)).put("kind","local-ideas/5");
        for(int i=0;i<30;i++)legacy.getJSONArray("ideas").put("保存済みの動作"+i);
        String original=legacy.toString(),updated=LocalIdeaBatch.compactCheckpoint(original);JSONObject next=LocalIdeaBatch.state(updated);
        assertEquals("local-ideas/5",new JSONObject(original).getString("kind"));assertEquals("local-ideas/6",next.getString("kind"));
        assertEquals(legacy.getString("request"),next.getString("request"));assertEquals(300,next.getInt("target"));assertEquals(legacy.getJSONArray("ideas").toString(),next.getJSONArray("ideas").toString());
        String oldPrompt=LocalIdeaBatch.promptPart(original,1,5),compact=LocalIdeaBatch.promptPart(updated,1,5);
        assertTrue(compact.length()<oldPrompt.length());assertTrue(compact.contains(legacy.getString("request")));
        assertThrows(IllegalArgumentException.class,()->LocalIdeaBatch.compactCheckpoint(updated));
    }
}
