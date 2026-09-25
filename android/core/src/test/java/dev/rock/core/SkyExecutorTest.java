package dev.rock.core;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import dev.rock.core.ExternalWriteOutbox.Effect;
import dev.rock.core.SkyExecutor.Connectivity;
import dev.rock.core.SkyExecutor.Range;
import dev.rock.core.SkyExecutor.Selection;
import dev.rock.core.SkyExecutor.ToolRequirement;
import dev.rock.core.platform.PlatformStore;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** AI05 host/fixture acceptance: capability intersection, re-checks, single executor, persistent selection, snapshot restore. */
public class SkyExecutorTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private static final JSONObject fixture = load();
    private static final String OWNER = "owner:alice", DEVICE = "device-1";
    private static final long NOW = 1_000_000L;
    private JdbcDatabase db; private Engine engine; private ModelProfiles models; private SkyExecutor sky; private String file;
    private ModelProfile a;

    private static JSONObject load() {
        try (InputStream in = SkyExecutorTest.class.getResourceAsStream("/model-profiles-fixture.json")) {
            return new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (java.io.IOException e) { throw new IllegalStateException(e); }
    }
    private static ModelProfile profile(int index) {
        JSONObject p = fixture.getJSONArray("profiles").getJSONObject(index);
        return new ModelProfile(p.getString("modelId"), p.getString("version"), p.getString("weightsSha256"),
            p.getString("tokenizerSha256"), p.getString("chatTemplateSha256"), p.getString("license"),
            p.getInt("runtimeApiMin"), p.getInt("runtimeApiMax"), p.getString("quantization"), p.getString("format"),
            p.getInt("contextTokens"), p.getString("planSchema"), p.getLong("requiredRamBytes"),
            p.getLong("requiredStorageBytes"), p.getString("measuredOn"), p.getString("qualityResult"));
    }
    private static ModelProfiles models(Database db, Engine engine) {
        JSONObject adapter = fixture.getJSONObject("runtimeAdapter");
        Set<String> formats = new LinkedHashSet<>();
        JSONArray f = adapter.getJSONArray("formats");
        for (int i = 0; i < f.length(); i++) formats.add(f.getString(i));
        return new ModelProfiles(db, engine, adapter.getInt("apiVersion"), formats, adapter.getString("planSchema"));
    }
    private static String plan() { return fixture.getJSONObject("runtimeAdapter").getString("planSchema"); }
    private static ToolRequirement req(String id, Range core, Set<Effect> effects, Range storage, long maxInput, String... required) {
        return new ToolRequirement(id, 1, core, new HashSet<>(Engine.toolIds()), plan(), effects, storage, null, maxInput,
            new HashSet<>(Arrays.asList(required)));
    }
    private static final Range CORE = new Range(1, 1), STORAGE = new Range(Engine.SCHEMA_VERSION, Engine.SCHEMA_VERSION);
    private static final ToolRequirement ARTICLE = req(Engine.RECIPE, CORE, EnumSet.of(Effect.LOCAL_PURE), STORAGE, Engine.MAX_BYTES,
        "planSchemas", "modelProfiles", "effects");
    private static List<ToolRequirement> manifests(ToolRequirement article) {
        return Arrays.asList(article,
            req("fixture-camera@1", CORE, EnumSet.of(Effect.LOCAL_PURE), STORAGE, 1024, "camera"),
            req("fixture-future@1", new Range(2, 3), EnumSet.of(Effect.LOCAL_PURE), STORAGE, 1024),
            req("fixture-storage@1", CORE, EnumSet.of(Effect.LOCAL_PURE), new Range(Engine.SCHEMA_VERSION + 1, Engine.SCHEMA_VERSION + 2), 1024),
            req("fixture-writer@1", CORE, EnumSet.of(Effect.EXTERNAL_WRITE), STORAGE, 1024),
            req("fixture-large@1", CORE, EnumSet.of(Effect.LOCAL_PURE), STORAGE, Engine.MAX_BYTES + 1L));
    }
    private SkyExecutor sky(Database d, Engine e, ModelProfiles m, String device, boolean outbox) {
        return new SkyExecutor(d, e, m, device, manifests(ARTICLE), outbox);
    }
    private void activate(ModelProfiles m, ModelProfile p) {
        m.stage(p); m.recordIsolationTest(p.id(), true); m.activate(p.id()); assertEquals(p.id(), m.confirmHealth(true));
    }
    @Before public void setup() throws Exception {
        file = temp.newFile("work.db").getPath(); db = new JdbcDatabase(file); engine = new Engine(db); models = models(db, engine);
        sky = sky(db, engine, models, DEVICE, false); a = profile(0);
    }
    @After public void close() { db.close(); }
    private Selection ready() {
        activate(models, a);
        assertEquals(1, sky.designate(OWNER, DEVICE, 0, NOW));
        sky.observe(OWNER, Connectivity.OFFLINE, NOW);
        return sky.select(OWNER, Engine.RECIPE, 0, NOW);
    }

    @Test public void onlyTheIntersectionIsExecutableAndEveryMismatchHasAReason() {
        assertEquals(Collections.singletonList("CAPABILITY_MISSING"), sky.evaluate(OWNER, Engine.RECIPE, NOW).reasons);
        sky.observe(OWNER, Connectivity.OFFLINE, NOW);                                        // no healthy model yet
        assertEquals(Collections.singletonList("MODEL_PROFILE_MISSING"), sky.evaluate(OWNER, Engine.RECIPE, NOW).reasons);
        activate(models, a);
        SkyExecutor.Capability cap = sky.observe(OWNER, Connectivity.OFFLINE, NOW);
        assertEquals(2, cap.generation);
        assertEquals(1, sky.executableTools(OWNER, NOW).size());
        assertEquals(Engine.RECIPE, sky.executableTools(OWNER, NOW).get(0));
        assertEquals(Collections.singleton(a.id()), cap.modelProfiles);
        assertEquals(Collections.singletonList("UNKNOWN_REQUIRED_CAPABILITY:camera"), sky.evaluate(OWNER, "fixture-camera@1", NOW).reasons);
        assertEquals(Collections.singletonList("CORE_API_RANGE_MISMATCH"), sky.evaluate(OWNER, "fixture-future@1", NOW).reasons);
        assertEquals(Collections.singletonList("STORAGE_SCHEMA_RANGE_MISMATCH"), sky.evaluate(OWNER, "fixture-storage@1", NOW).reasons);
        assertEquals(Collections.singletonList("EFFECT_NOT_OFFERED"), sky.evaluate(OWNER, "fixture-writer@1", NOW).reasons);
        assertEquals(Collections.singletonList("LIMIT_EXCEEDED"), sky.evaluate(OWNER, "fixture-large@1", NOW).reasons);
        assertEquals(Collections.singletonList("UNKNOWN_TOOL"), sky.evaluate(OWNER, "not-in-manifest@1", NOW).reasons);
        assertEquals(Collections.singletonList("CAPABILITY_STALE"),
            sky.evaluate(OWNER, Engine.RECIPE, NOW + SkyExecutor.OBSERVATION_TTL_MS).reasons);
        assertEquals(Collections.singletonList("CAPABILITY_STALE"), sky.evaluate(OWNER, Engine.RECIPE, NOW - 1).reasons);   // clock moved back
        assertEquals(2, sky.observe(OWNER, Connectivity.OFFLINE, NOW + 1).generation);             // same offer, same generation

        SkyExecutor online = sky(db, engine, models, DEVICE, true);                               // outbox present and online
        assertEquals(3, online.observe(OWNER, Connectivity.ONLINE, NOW + 2).generation);
        assertTrue(online.evaluate(OWNER, "fixture-writer@1", NOW + 2).executable);
        assertFalse(online.evaluate(OWNER, "fixture-writer@1", NOW + 2 + SkyExecutor.OBSERVATION_TTL_MS).executable);
        online.observe(OWNER, Connectivity.OFFLINE, NOW + 3);                                    // offline: external write is not offered
        assertEquals(Collections.singletonList("EFFECT_NOT_OFFERED"), online.evaluate(OWNER, "fixture-writer@1", NOW + 3).reasons);

        db.execute("UPDATE sky_capabilities SET tool_versions='citations@1,free-article@1,article-preparation@1,extra@9'");
        assertEquals("CAPABILITY_RECORD_CORRUPT", assertThrows(IllegalStateException.class,
            () -> sky.evaluate(OWNER, Engine.RECIPE, NOW + 3)).getMessage());
    }

    @Test public void selectionSubmitAndClaimEachRecheckTheObservation() {
        Selection s = ready();
        assertEquals(DEVICE, s.deviceRef); assertEquals(ARTICLE.digest(), s.recipeHash); assertEquals(1, s.revision);
        assertTrue(assertThrows(IllegalStateException.class, () -> sky.select(OWNER, "fixture-camera@1", 1, NOW + 1))
            .getMessage().startsWith("TOOL_NOT_EXECUTABLE:UNKNOWN_REQUIRED_CAPABILITY:camera"));
        assertEquals(1, sky.selection(OWNER, s.token).revision);                                  // refused selection changed nothing

        String work = sky.submit(OWNER, s.token, "work-1", "原稿", true, NOW + 2);
        assertEquals(DEVICE, sky.binding(work).get("device_ref")); assertEquals("1", sky.binding(work).get("writer_epoch"));
        assertEquals(a.id(), models.pinnedProfile(work).id());
        assertTrue(assertThrows(IllegalStateException.class, () -> sky.submit(OWNER, s.token, "work-2", "原稿2", true,
            NOW + SkyExecutor.OBSERVATION_TTL_MS)).getMessage().contains("CAPABILITY_STALE"));    // submit re-check
        assertNull(engine.existingWorkId("work-2"));

        // claim re-check: a stale observation claims nothing and changes nothing
        assertEquals("CAPABILITY_STALE", assertThrows(IllegalStateException.class,
            () -> sky.claim(OWNER, "boot-1", 10, true, NOW + SkyExecutor.OBSERVATION_TTL_MS)).getMessage());
        assertEquals("queued", engine.runs(work).get(0).get("state"));
        sky.observe(OWNER, Connectivity.OFFLINE, NOW + 10);
        ModelProfiles.PinnedTicket t = sky.claim(OWNER, "boot-1", 10, true, NOW + 10);
        assertEquals(work, t.ticket.workId);
        assertTrue(models.finish(t, a.id(), "passed", "整理済み", "boot-1", 20));

        // the Tool manifest changed after submit: the next claim holds the run for review instead of running it
        SkyExecutor updated = new SkyExecutor(db, engine, models, DEVICE,
            manifests(req(Engine.RECIPE, CORE, EnumSet.of(Effect.LOCAL_PURE), STORAGE, 1024, "planSchemas")), false);
        assertNull(updated.claim(OWNER, "boot-1", 30, true, NOW + 11));
        assertEquals("needs_review", engine.runs(work).get(1).get("state"));
        assertEquals("CAPABILITY_MISMATCH", engine.runs(work).get(1).get("error"));
        assertEquals("SELECTION_REVALIDATION_REQUIRED", assertThrows(IllegalStateException.class,
            () -> updated.submit(OWNER, s.token, "work-3", "原稿3", true, NOW + 12)).getMessage());

        // a model switch is pending (no healthy model offered): a fresh observation no longer offers the Tool,
        // so the claim re-check stops the run for review instead of running it
        String w5 = sky.submit(OWNER, s.token, "work-5", "原稿5", true, NOW + 12);
        ModelProfile b = profile(1);
        models.stage(b); models.recordIsolationTest(b.id(), true); models.activate(b.id());
        assertEquals(2, sky.observe(OWNER, Connectivity.OFFLINE, NOW + 12).generation);
        assertNull(sky.claim(OWNER, "boot-1", 40, true, NOW + 12));
        assertEquals("CAPABILITY_MISMATCH", engine.runs(w5).get(0).get("error"));
        assertEquals(a.id(), models.confirmHealth(false));                                       // rolled back to a
        assertEquals(3, sky.observe(OWNER, Connectivity.OFFLINE, NOW + 13).generation);
        assertEquals("SELECTION_REVALIDATION_REQUIRED", assertThrows(IllegalStateException.class,
            () -> sky.submit(OWNER, s.token, "work-6", "原稿6", true, NOW + 13)).getMessage());
        Selection s2 = sky.select(OWNER, Engine.RECIPE, 1, NOW + 13);

        // the model went away: the observation changes generation, the old selection must be re-made and now fails
        models.revoke(a.id());
        assertEquals(4, sky.observe(OWNER, Connectivity.OFFLINE, NOW + 14).generation);
        assertEquals("SELECTION_REVALIDATION_REQUIRED", assertThrows(IllegalStateException.class,
            () -> sky.submit(OWNER, s2.token, "work-4", "原稿4", true, NOW + 14)).getMessage());
        assertTrue(assertThrows(IllegalStateException.class, () -> sky.select(OWNER, Engine.RECIPE, 2, NOW + 14))
            .getMessage().contains("MODEL_PROFILE_MISSING"));
    }

    @Test public void oneExecutorDeviceAndWorkNeverMovesToAnotherDeviceAutomatically() {
        Selection s = ready();
        assertEquals("REVISION_CONFLICT", assertThrows(IllegalStateException.class, () -> sky.designate(OWNER, "device-2", 0, NOW)).getMessage());
        String w1 = sky.submit(OWNER, s.token, "work-1", "原稿", true, NOW + 1);
        assertEquals(2, sky.designate(OWNER, "device-2", 1, NOW + 2));                         // owner moves the executor
        assertEquals("2", sky.executor().get("writer_epoch"));
        assertEquals("NOT_DESIGNATED_EXECUTOR", assertThrows(SecurityException.class,
            () -> sky.submit(OWNER, s.token, "work-2", "原稿2", true, NOW + 3)).getMessage());
        assertEquals("NOT_DESIGNATED_EXECUTOR", assertThrows(SecurityException.class,
            () -> sky.select(OWNER, Engine.RECIPE, 1, NOW + 3)).getMessage());
        assertEquals(DEVICE, sky.binding(w1).get("device_ref"));                                  // the existing work stays
        assertEquals("1", sky.binding(w1).get("writer_epoch"));
        SkyExecutor other = sky(db, engine, models, "device-2", false);                           // another device cannot write it
        other.observe(OWNER, Connectivity.OFFLINE, NOW + 4);
        assertNull(other.claim(OWNER, "boot-2", 10, true, NOW + 4));
        assertEquals("needs_review", engine.runs(w1).get(0).get("state"));
        assertEquals("AUTHORITY_DEVICE_MISMATCH", engine.runs(w1).get(0).get("error"));
    }

    @Test public void invalidTokenOwnerAndDuplicatesAreRefusedAndIdenticalResendIsStable() {
        Selection s = ready();
        assertEquals("SKY_SELECTION_REQUIRED", assertThrows(SecurityException.class,
            () -> sky.submit(OWNER, null, "work-1", "原稿", true, NOW)).getMessage());
        assertEquals("SKY_SELECTION_MISMATCH", assertThrows(SecurityException.class,
            () -> sky.submit(OWNER, UUID.randomUUID().toString(), "work-1", "原稿", true, NOW)).getMessage());
        assertEquals("OWNER_MISMATCH", assertThrows(SecurityException.class,
            () -> sky.submit("owner:mallory", s.token, "work-1", "原稿", true, NOW)).getMessage());
        assertEquals("OWNER_MISMATCH", assertThrows(SecurityException.class, () -> sky.observe("owner:mallory", Connectivity.OFFLINE, NOW)).getMessage());
        assertEquals("OWNER_MISMATCH", assertThrows(SecurityException.class, () -> sky.designate("owner:mallory", DEVICE, 1, NOW)).getMessage());
        assertEquals("OWNER_MISMATCH", assertThrows(SecurityException.class, () -> sky.select("owner:mallory", Engine.RECIPE, 1, NOW)).getMessage());
        String w = sky.submit(OWNER, s.token, "work-1", "原稿", true, NOW);
        assertEquals(w, sky.submit(OWNER, s.token, "work-1", "原稿", true, NOW + 1));
        assertEquals("REQUEST_CONFLICT", assertThrows(IllegalStateException.class,
            () -> sky.submit(OWNER, s.token, "work-1", "別の原稿", true, NOW + 1)).getMessage());
        assertEquals("REVISION_CONFLICT", assertThrows(IllegalStateException.class, () -> sky.select(OWNER, Engine.RECIPE, 0, NOW + 1)).getMessage());
        assertEquals(2, sky.select(OWNER, Engine.RECIPE, 1, NOW + 1).revision);
        assertEquals(s.token, sky.select(OWNER, Engine.RECIPE, 2, NOW + 1).token);               // Engine keeps one token per Tool
        String outside = models.submit("outside", "Broker外の仕事", false, true);                 // made without the Sky path
        assertEquals("SKY_BINDING_MISSING", assertThrows(IllegalStateException.class,
            () -> sky.submit(OWNER, s.token, "outside", "Broker外の仕事", true, NOW + 2)).getMessage());
        ModelProfiles.PinnedTicket t = sky.claim(OWNER, "boot-1", 10, true, NOW + 3);
        assertEquals(w, t.ticket.workId);
        assertTrue(models.finish(t, a.id(), "passed", "整理済み", "boot-1", 11));
        ModelProfiles.PinnedTicket next = sky.claim(OWNER, "boot-1", 12, true, NOW + 4);
        assertEquals(w, next.ticket.workId);                                                      // w step 1 before outside
        assertTrue(models.finish(next, a.id(), "passed", "無料版", "boot-1", 13));
        assertNull(sky.claim(OWNER, "boot-1", 14, true, NOW + 5));                                // unbound work is held, not run
        assertEquals("SKY_BINDING_MISSING", engine.runs(outside).get(0).get("error"));
    }

    @Test public void snapshotRestoreKillsOldTokenAndNeedsOwnerConfirmationAndReselection() throws Exception {
        Selection s = ready();
        String w = sky.submit(OWNER, s.token, "work-1", "原稿", true, NOW);
        byte[] platform = new PlatformStore(db).exportRecoverableState(OWNER);
        String snapshot = sky.exportSnapshot(OWNER);
        assertFalse(snapshot.contains(s.token));
        assertFalse(snapshot.contains("capability"));

        JdbcDatabase db2 = new JdbcDatabase(temp.newFile("restored.db").getPath());
        try {
            Engine engine2 = new Engine(db2);
            ModelProfiles models2 = models(db2, engine2);
            SkyExecutor sky2 = sky(db2, engine2, models2, "device-2", false);
            assertEquals("RESTORE_REQUIRES_PAUSED_ENGINE", assertThrows(IllegalStateException.class,
                () -> sky2.restoreSnapshot(snapshot, OWNER, NOW + 1)).getMessage());
            new PlatformStore(db2).restoreRecoverableState(platform, OWNER, NOW + 1);
            assertEquals("SNAPSHOT_OWNER_MISMATCH", assertThrows(SecurityException.class,
                () -> sky2.restoreSnapshot(snapshot, "owner:mallory", NOW + 1)).getMessage());
            assertEquals("SNAPSHOT_CORRUPT", assertThrows(SecurityException.class,
                () -> sky2.restoreSnapshot(snapshot.replace("|device-1|", "|device-9|"), OWNER, NOW + 1)).getMessage());
            sky2.restoreSnapshot(snapshot, OWNER, NOW + 1);
            assertEquals("RESTORE_TARGET_NOT_EMPTY", assertThrows(IllegalStateException.class,
                () -> sky2.restoreSnapshot(snapshot, OWNER, NOW + 1)).getMessage());
            String rotated = engine2.skySelection().token;
            assertNotEquals(s.token, rotated);
            assertEquals("SKY_SELECTION_MISMATCH", assertThrows(SecurityException.class,
                () -> sky2.submit(OWNER, s.token, "work-2", "原稿2", true, NOW + 2)).getMessage());
            assertEquals("restored", sky2.executor().get("state"));
            assertEquals("EXECUTOR_CONFIRMATION_REQUIRED", assertThrows(IllegalStateException.class,
                () -> sky2.submit(OWNER, rotated, "work-2", "原稿2", true, NOW + 2)).getMessage());
            activate(models2, a);
            sky2.observe(OWNER, Connectivity.OFFLINE, NOW + 2);
            assertEquals("EXECUTOR_CONFIRMATION_REQUIRED", assertThrows(IllegalStateException.class,
                () -> sky2.claim(OWNER, "boot-9", 1, true, NOW + 2)).getMessage());

            int rev = Integer.parseInt(sky2.executor().get("revision"));
            assertEquals(rev + 1, sky2.designate(OWNER, "device-2", rev, NOW + 3));             // owner confirms the new device
            assertEquals("device-2", sky2.binding(w).get("device_ref"));
            assertEquals("2", sky2.binding(w).get("writer_epoch"));
            assertEquals("SELECTION_REVALIDATION_REQUIRED", assertThrows(IllegalStateException.class,
                () -> sky2.submit(OWNER, rotated, "work-2", "原稿2", true, NOW + 3)).getMessage());
            Selection again = sky2.select(OWNER, Engine.RECIPE, sky2.selection(OWNER, rotated).revision, NOW + 3);
            assertEquals(rotated, again.token);
            String w2 = sky2.submit(OWNER, rotated, "work-2", "原稿2", true, NOW + 4);
            assertEquals("device-2", sky2.binding(w2).get("device_ref"));
            assertTrue(engine2.paused());                                                          // restore leaves work paused
            assertNull(sky2.claim(OWNER, "boot-9", 1, true, NOW + 4));
        } finally {
            db2.close();
        }
    }
}
