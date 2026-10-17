package dev.rock.core;

import java.util.HashSet;
import org.junit.Test;
import static org.junit.Assert.*;

public final class OutputTestToolsTest {
    @Test public void everySampleProducesExplicitlyClassifiedOutput() {
        assertEquals(17,OutputTestTools.SCENARIOS.size());
        HashSet<String> ids=new HashSet<>();
        for(OutputTestTools.Scenario s:OutputTestTools.SCENARIOS) {
            assertTrue(ids.add(s.id));String result=OutputTestTools.run(s.id,s.sample,s.option);
            assertTrue(s.id,result.startsWith("【"+s.mode()+" / テスト専用】"));assertTrue(s.id,result.length()>30);
        }
    }
    @Test public void articleFunctionsReuseProductionAlgorithmsWithoutBroker() {
        OutputTestTools.Scenario citation=OutputTestTools.SCENARIOS.get(1),article=OutputTestTools.SCENARIOS.get(2);
        assertTrue(OutputTestTools.run(citation.id,citation.sample,"").endsWith(ArticleTools.citations(citation.sample)));
        assertTrue(OutputTestTools.run(article.id,article.sample,article.option).endsWith(ArticleTools.freeArticle(article.sample,20,article.option,500,"詳細手順（試験用）","https://note.com/test/n/test")));
    }
    @Test public void csvActuallyTransformsEditedInputAndQuotedValues() {
        String result=OutputTestTools.run("csv","id,name\n3, gamma\n1,\"alpha, one\"\n3,gamma","id");
        assertTrue(result.contains("入力行: 3 → 出力行: 2"));assertTrue(result.contains("1,\"alpha, one\"\n3,gamma"));
        assertTrue(OutputTestTools.run("csv","id,name\n1,=1+1","id").contains("1,'=1+1"));
        assertTrue(OutputTestTools.run("csv","id,name\n1,\"hello\nworld\"","id").contains("\"hello\nworld\""));
        assertTrue(OutputTestTools.run("csv","id,name\n1,\"a\"\"b\"","id").contains("\"a\"\"b\""));
    }
    @Test public void invalidInputsAndUnknownExecutorsAreRejected() {
        for(String[] input:new String[][]{{"shell","echo bad",""},{"csv","a,b\n1","a"},{"csv","a,a\n1,2","a"},{"csv","a,b\n\"open","a"},{"wallet","100","101"},{"market","-1","2"},{"citations","", ""},{"citations","x".repeat(12001),""}}) {
            try {OutputTestTools.run(input[0],input[1],input[2]);fail(input[0]);} catch(IllegalArgumentException expected) {assertNotNull(expected.getMessage());}
        }
    }
    @Test public void hashingAndSimulationBoundariesAreVisible() {
        assertTrue(OutputTestTools.run("delivery","abc","").contains("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
        assertTrue(OutputTestTools.run("wallet","1000","700").contains("終了残高: 9300"));
        assertTrue(OutputTestTools.run("cloud-ai","依頼","条件").contains("モデルの回答: なし"));
        assertTrue(OutputTestTools.run("zema","依頼","成果物").contains("本番仕事: 未作成"));
    }
}
