package dev.rock.core;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import dev.rock.core.BoundedMemory.Context;
import dev.rock.core.BoundedMemory.Item;
import dev.rock.core.BoundedMemory.Kind;
import dev.rock.core.BoundedMemory.Origin;
import dev.rock.core.BoundedMemory.Provenance;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

/** AI03 host/fixture acceptance: model-independent bounded memory, provenance, project isolation, deletion, limits, model swap. */
public class BoundedMemoryTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private static JSONObject fixture;
    private JdbcDatabase db; private Engine engine; private BoundedMemory memory; private String file;
    private static final long NOW = 1_000_000L, LATER = NOW + 86_400_000L;
    private static final Set<String> ARTICLE = Collections.singleton("article-preparation@1");
    private static final Provenance OWNER = new Provenance(Origin.OWNER, true, null, null, null);

    @BeforeClass public static void load() throws Exception {
        try (InputStream in = BoundedMemoryTest.class.getResourceAsStream("/model-profiles-fixture.json")) {
            fixture = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }
    private static ModelProfile profile(int index) {
        JSONObject p = fixture.getJSONArray("profiles").getJSONObject(index);
        return new ModelProfile(p.getString("modelId"), p.getString("version"), p.getString("weightsSha256"),
            p.getString("tokenizerSha256"), p.getString("chatTemplateSha256"), p.getString("license"),
            p.getInt("runtimeApiMin"), p.getInt("runtimeApiMax"), p.getString("quantization"), p.getString("format"),
            p.getInt("contextTokens"), p.getString("planSchema"), p.getLong("requiredRamBytes"),
            p.getLong("requiredStorageBytes"), p.getString("measuredOn"), p.getString("qualityResult"));
    }
    private ModelProfiles models() {
        JSONObject adapter = fixture.getJSONObject("runtimeAdapter");
        Set<String> formats = new LinkedHashSet<>();
        JSONArray f = adapter.getJSONArray("formats");
        for (int i = 0; i < f.length(); i++) formats.add(f.getString(i));
        return new ModelProfiles(db, engine, adapter.getInt("apiVersion"), formats, adapter.getString("planSchema"));
    }
    @Before public void setup() throws Exception {
        file = temp.newFile("work.db").getPath(); db = new JdbcDatabase(file); engine = new Engine(db); memory = new BoundedMemory(db);
    }
    @After public void close() { db.close(); }
    private void restart() { db.close(); db = new JdbcDatabase(file); engine = new Engine(db); memory = new BoundedMemory(db); }
    private int save(String project, String id, String content) {
        return memory.save("owner-1", project, id, Kind.PREFERENCE, content, ARTICLE, OWNER, NOW, LATER);
    }
    /** Runs the pinned two-step Engine recipe so an artifact memory can point at a real work artifact. */
    private String[] finishedWork(String key) {
        String work = engine.submit(key, "原稿", false, true);
        Engine.Ticket t = engine.claim("boot-1", 10, true);
        assertTrue(engine.finish(t, "passed", "整理済み", "boot-1", 20));
        t = engine.claim("boot-1", 30, true);
        assertTrue(engine.finish(t, "passed", "無料版の本文", "boot-1", 40));
        return new String[]{work, Engine.digest(engine.result(work))};
    }

    @Test public void canonicalRecordKeepsDesignFieldsAndProvenanceAndRefusesModelGuessAsOwnerFact() {
        String[] w = finishedWork("work-1");
        assertEquals(1, save("project-a", "tone", "です・ます調で書く"));
        assertEquals(1, save("project-a", "tone", "です・ます調で書く"));                         // identical resend
        assertEquals("MEMORY_CONFLICT", assertThrows(IllegalStateException.class,
            () -> save("project-a", "tone", "だ・である調で書く")).getMessage());
        Provenance tool = new Provenance(Origin.TOOL, false, w[0], w[1], null);
        memory.save("owner-1", "project-a", "free-article", Kind.ARTIFACT, "無料版の成果（work-1）", ARTICLE, tool, NOW, LATER);
        Item item = memory.get("owner-1", "project-a", "article-preparation@1", "free-article", NOW + 1);
        assertEquals(BoundedMemory.SCHEMA_VERSION, item.schemaVersion);
        assertEquals("owner-1", item.ownerRef); assertEquals("project-a", item.projectRef);
        assertEquals(Engine.digest("無料版の成果（work-1）"), item.contentRef);
        assertEquals(Origin.TOOL, item.provenance.origin); assertEquals(w[0], item.provenance.sourceWorkId);
        assertEquals(w[1], item.provenance.sourceArtifactDigest); assertEquals(1, item.revision);

        Provenance guess = new Provenance(Origin.MODEL, false, w[0], null, "fixture-local-planner@1.0");
        assertEquals("MEMORY_CONFIRMATION_REQUIRED", assertThrows(IllegalArgumentException.class,
            () -> memory.save("owner-1", "project-a", "guess", Kind.PREFERENCE, "推測した好み", ARTICLE, guess, NOW, LATER)).getMessage());
        Provenance confirmed = new Provenance(Origin.MODEL, true, w[0], null, "fixture-local-planner@1.0");
        memory.save("owner-1", "project-a", "confirmed", Kind.PROCEDURE, "本人が確認した手順", ARTICLE, confirmed, NOW, LATER);
        assertEquals("fixture-local-planner@1.0", memory.get("owner-1", "project-a", "article-preparation@1", "confirmed", NOW).provenance.modelProfileId);
        assertThrows(IllegalArgumentException.class, () -> memory.save("owner-1", "project-a", "bad-artifact", Kind.ARTIFACT, "x", ARTICLE,
            new Provenance(Origin.TOOL, false, w[0], Engine.digest("存在しない成果"), null), NOW, LATER));
        assertThrows(IllegalArgumentException.class, () -> new Provenance(Origin.TOOL, false, null, null, null));

        assertEquals(2, memory.revise("owner-1", "project-a", "free-article", 1, "無料版の成果（訂正）", ARTICLE, NOW + 2, LATER));
        Item revised = memory.get("owner-1", "project-a", "article-preparation@1", "free-article", NOW + 3);
        assertEquals(Origin.TOOL, revised.provenance.origin); assertEquals(w[1], revised.provenance.sourceArtifactDigest);
        assertEquals(NOW, revised.createdAt);
        assertEquals("REVISION_CONFLICT", assertThrows(IllegalStateException.class,
            () -> memory.revise("owner-1", "project-a", "free-article", 1, "古い訂正", ARTICLE, NOW + 4, LATER)).getMessage());
    }

    @Test public void projectsAndScopesAreIsolated() {
        save("project-a", "secret-plan", "Aだけの方針");
        save("project-b", "other", "Bの方針");
        assertEquals("UNKNOWN_MEMORY", assertThrows(IllegalArgumentException.class,
            () -> memory.get("owner-1", "project-b", "article-preparation@1", "secret-plan", NOW)).getMessage());
        assertEquals("UNKNOWN_MEMORY", assertThrows(IllegalArgumentException.class,
            () -> memory.get("owner-2", "project-a", "article-preparation@1", "secret-plan", NOW)).getMessage());
        assertTrue(memory.search("owner-1", "project-b", "article-preparation@1", "方針", NOW).stream().noneMatch(i -> i.memoryId.equals("secret-plan")));
        assertEquals(1, memory.search("owner-1", "project-b", "article-preparation@1", "方針", NOW).size());
        assertEquals(1, memory.export("owner-1", "project-b", NOW).size());
        Context b = memory.reconstruct("owner-1", "project-b", "article-preparation@1", profile(0), 2048, NOW);
        assertFalse(b.text.contains("Aだけの方針"));
        assertEquals(Arrays.asList("other"), b.included);
        // share stop for one scope: the memory disappears from that scope only
        Set<String> two = new HashSet<>(Arrays.asList("article-preparation@1", "sky-role:csv"));
        memory.revise("owner-1", "project-a", "secret-plan", 1, "Aだけの方針", two, NOW + 1, LATER);
        assertEquals(1, memory.search("owner-1", "project-a", "sky-role:csv", "方針", NOW + 2).size());
        memory.revise("owner-1", "project-a", "secret-plan", 2, "Aだけの方針", Collections.singleton("sky-role:csv"), NOW + 3, LATER);
        assertEquals(0, memory.search("owner-1", "project-a", "article-preparation@1", "方針", NOW + 4).size());
        assertThrows(IllegalArgumentException.class, () -> memory.get("owner-1", "project-a", "article-preparation@1", "secret-plan", NOW + 4));
    }

    @Test public void deletedAndExpiredMemoryNeverReappearsInReconstructionSearchOrExport() {
        save("project-a", "keep", "残す設定");
        save("project-a", "drop", "消す設定XYZ");
        memory.save("owner-1", "project-a", "short", Kind.REFERENCE, "期限付き資料QRS", ARTICLE, OWNER, NOW, NOW + 10);
        Context before = memory.reconstruct("owner-1", "project-a", "article-preparation@1", profile(0), 4096, NOW + 1);
        assertTrue(before.text.contains("消す設定XYZ")); assertTrue(before.text.contains("期限付き資料QRS"));
        memory.delete("owner-1", "project-a", "drop", NOW + 2);
        assertEquals(0, Integer.parseInt(db.query("SELECT COUNT(*) AS n FROM memory_projections").get(0).get("n")));
        assertTrue(db.query("SELECT 1 FROM memory_items WHERE content LIKE '%XYZ%'").isEmpty());
        Context after = memory.reconstruct("owner-1", "project-a", "article-preparation@1", profile(0), 4096, NOW + 20);
        assertFalse(after.text.contains("消す設定XYZ")); assertFalse(after.text.contains("期限付き資料QRS"));
        assertEquals(Arrays.asList("keep"), after.included);
        assertTrue(memory.search("owner-1", "project-a", "article-preparation@1", "XYZ", NOW + 21).isEmpty());
        assertEquals(1, memory.export("owner-1", "project-a", NOW + 21).size());
        assertEquals("MEMORY_DELETED", assertThrows(IllegalStateException.class, () -> save("project-a", "drop", "消す設定XYZ")).getMessage());
        assertEquals("MEMORY_DELETED", assertThrows(IllegalStateException.class,
            () -> memory.revise("owner-1", "project-a", "drop", 1, "復活", ARTICLE, NOW + 22, LATER)).getMessage());
        restart();
        assertTrue(memory.search("owner-1", "project-a", "article-preparation@1", "XYZ", NOW + 23).isEmpty());
        save("project-b", "b1", "B設定");
        assertEquals(2, memory.deleteAll("owner-1", NOW + 24));
        assertTrue(memory.export("owner-1", "project-a", NOW + 25).isEmpty());
        assertTrue(memory.export("owner-1", "project-b", NOW + 25).isEmpty());
        assertTrue(db.query("SELECT 1 FROM memory_items").isEmpty());
        assertTrue(db.query("SELECT 1 FROM memory_projections").isEmpty());
        assertEquals(4, db.query("SELECT 1 FROM memory_tombstones").size());
        assertTrue(db.query("SELECT 1 FROM memory_tombstones WHERE memory_id_digest IN('drop','keep','b1','short')").isEmpty());
    }

    @Test public void limitsRefuseWritesWithoutEvictionAndBudgetOmitsWholeItems() {
        StringBuilder big = new StringBuilder();
        while (big.length() <= BoundedMemory.MAX_CONTENT_BYTES) big.append('a');
        assertEquals("MEMORY_CONTENT_TOO_LARGE", assertThrows(IllegalArgumentException.class,
            () -> save("project-a", "big", big.toString())).getMessage());
        for (int i = 0; i < BoundedMemory.MAX_MEMORIES_PER_PROJECT; i++) save("project-a", "m-" + i, "設定" + i);
        assertEquals("MEMORY_LIMIT_REACHED", assertThrows(IllegalStateException.class, () -> save("project-a", "overflow", "追加")).getMessage());
        assertEquals(BoundedMemory.MAX_MEMORIES_PER_PROJECT, memory.export("owner-1", "project-a", NOW).size());   // nothing evicted
        assertEquals(1, save("project-b", "other-project", "別projectは別枠"));

        ModelProfile a = profile(0);
        assertThrows(IllegalArgumentException.class, () -> memory.reconstruct("owner-1", "project-a", "article-preparation@1", a, a.contextTokens + 1, NOW));
        Context small = memory.reconstruct("owner-1", "project-a", "article-preparation@1", a, 1024, NOW);
        assertTrue(small.estimatedTokens <= 1024);
        assertFalse(small.omitted.isEmpty());
        assertEquals(BoundedMemory.MAX_MEMORIES_PER_PROJECT, small.included.size() + small.omitted.size());
        for (String line : small.text.split("\n")) new JSONObject(line);                                  // no item cut in half
        for (String id : small.omitted) assertFalse(small.text.contains("\"memoryId\":\"" + id + "\""));
    }

    @Test public void modelSwapRebuildsContextFromCanonicalMemoryAndNeverReusesOtherProfileProjection() {
        ModelProfiles models = models();
        ModelProfile a = profile(0), b = profile(1);
        models.stage(a); models.recordIsolationTest(a.id(), true); models.activate(a.id()); models.confirmHealth(true);
        String workA = models.submit("work-a", "原稿A", false, true);
        save("project-a", "tone", "です・ます調で書く");
        Context ca = memory.reconstruct("owner-1", "project-a", "article-preparation@1", models.pinnedProfile(workA), 2048, NOW);
        assertEquals(a.id(), ca.profileId); assertFalse(ca.fromCache);
        assertTrue(memory.reconstruct("owner-1", "project-a", "article-preparation@1", a, 2048, NOW).fromCache);

        models.stage(b); models.recordIsolationTest(b.id(), true); models.activate(b.id()); models.confirmHealth(true);
        String workB = models.submit("work-b", "原稿B", false, true);
        db.execute("UPDATE memory_projections SET context=? WHERE profile_id=?", "{\"stale\":\"A projection\"}\n", a.id());
        Context cb = memory.reconstruct("owner-1", "project-a", "article-preparation@1", models.pinnedProfile(workB), 2048, NOW + 1);
        assertEquals(b.id(), cb.profileId); assertEquals(b.digest(), cb.profileDigest); assertFalse(cb.fromCache);
        assertTrue(cb.text.contains("です・ます調で書く")); assertFalse(cb.text.contains("A projection"));
        Context back = memory.reconstruct("owner-1", "project-a", "article-preparation@1", a, 2048, NOW + 2);
        assertFalse(back.fromCache); assertFalse(back.text.contains("A projection"));                    // tampered cache rebuilt

        db.execute("DELETE FROM memory_projections");                                                    // projection cache lost
        restart();
        Context rebuilt = memory.reconstruct("owner-1", "project-a", "article-preparation@1", b, 2048, NOW + 3);
        assertEquals(cb.text, rebuilt.text);
        db.execute("UPDATE memory_items SET content='改ざん' WHERE memory_id='tone'");
        assertEquals("MEMORY_RECORD_CORRUPT", assertThrows(IllegalStateException.class,
            () -> memory.reconstruct("owner-1", "project-a", "article-preparation@1", b, 2048, NOW + 4)).getMessage());
        memory.delete("owner-1", "project-a", "tone", NOW + 5);                                           // corrupt row can be deleted
        assertTrue(memory.export("owner-1", "project-a", NOW + 6).isEmpty());
    }
}
