package dev.rock.core;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

/** AI02 host/fixture acceptance: two compatible ModelProfiles, old-work pin, switch, rollback, revoke/replan. */
public class ModelProfilesTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private static JSONObject fixture;
    private JdbcDatabase db; private Engine engine; private ModelProfiles models; private String file;
    private ModelProfile a, b;

    @BeforeClass public static void load() throws Exception {
        try (InputStream in = ModelProfilesTest.class.getResourceAsStream("/model-profiles-fixture.json")) {
            fixture = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }
    private static ModelProfile profile(JSONObject p) {
        return new ModelProfile(p.getString("modelId"), p.getString("version"), p.getString("weightsSha256"),
            p.getString("tokenizerSha256"), p.getString("chatTemplateSha256"), p.getString("license"),
            p.getInt("runtimeApiMin"), p.getInt("runtimeApiMax"), p.getString("quantization"), p.getString("format"),
            p.getInt("contextTokens"), p.getString("planSchema"), p.getLong("requiredRamBytes"),
            p.getLong("requiredStorageBytes"), p.getString("measuredOn"), p.getString("qualityResult"));
    }
    private static JSONObject copy(int index) { return new JSONObject(fixture.getJSONArray("profiles").getJSONObject(index).toString()); }
    private ModelProfiles open() {
        JSONObject adapter = fixture.getJSONObject("runtimeAdapter");
        Set<String> formats = new LinkedHashSet<>();
        JSONArray f = adapter.getJSONArray("formats");
        for (int i = 0; i < f.length(); i++) formats.add(f.getString(i));
        return new ModelProfiles(db, engine, adapter.getInt("apiVersion"), formats, adapter.getString("planSchema"));
    }
    private void reopen() { db.close(); db = new JdbcDatabase(file); engine = new Engine(db); models = open(); }
    private void ready(ModelProfile p) { models.stage(p); models.recordIsolationTest(p.id(), true); }
    private void switchTo(ModelProfile p) { models.activate(p.id()); assertEquals(p.id(), models.confirmHealth(true)); }
    /** Fixture runtime: output names the profile that produced it, so the test sees which version ran. */
    private static String run(ModelProfiles.PinnedTicket t) { return t.ticket.input + " via " + t.profile.id(); }

    @Before public void setup() throws Exception {
        file = temp.newFile("work.db").getPath(); db = new JdbcDatabase(file); engine = new Engine(db); models = open();
        a = profile(copy(0)); b = profile(copy(1));
        assertNotEquals(a.id(), b.id());
    }
    @After public void close() { db.close(); }

    @Test public void oldWorkStaysPinnedAcrossSwitchAndRestartWhileNewWorkUsesNewProfile() {
        ready(a); switchTo(a);
        String oldWork = models.submit("old-work", "原稿A", false, true);
        ModelProfiles.PinnedTicket first = models.claim("boot-1", 10, true);
        assertEquals(a.id(), first.profile.id());
        assertTrue(models.finish(first, a.id(), "passed", run(first), "boot-1", 20));

        ready(b); switchTo(b);                       // switch while the old work still has a queued step
        String newWork = models.submit("new-work", "原稿B", false, true);
        assertEquals(b.id(), models.pinnedProfile(newWork).id());
        assertEquals(oldWork, models.submit("old-work", "原稿A", false, true));   // idempotent resubmit keeps pin
        assertEquals(a.id(), models.pinnedProfile(oldWork).id());

        assertNotNull(models.claim("boot-1", 30, true));   // process dies after claiming the old work's second step
        reopen();
        ModelProfiles.PinnedTicket resumed = models.claim("boot-2", 1, true);
        assertEquals(oldWork, resumed.ticket.workId); assertEquals(1, resumed.ticket.step);
        assertEquals(a.id(), resumed.profile.id());
        assertEquals(b.id(), models.activeProfileId());
        assertThrows(SecurityException.class, () -> models.finish(resumed, b.id(), "passed", "x", "boot-2", 2));
        assertEquals("running", engine.runs(oldWork).get(1).get("state"));      // refused result changed nothing
        assertTrue(models.finish(resumed, a.id(), "passed", run(resumed), "boot-2", 2));
        assertEquals("原稿A via " + a.id() + " via " + a.id(), engine.result(oldWork));

        ModelProfiles.PinnedTicket next = models.claim("boot-2", 3, true);
        assertEquals(newWork, next.ticket.workId); assertEquals(b.id(), next.profile.id());
        assertTrue(models.finish(next, b.id(), "passed", run(next), "boot-2", 4));
        ModelProfiles.PinnedTicket last = models.claim("boot-2", 5, true);
        assertTrue(models.finish(last, b.id(), "passed", run(last), "boot-2", 6));
        assertEquals("原稿B via " + b.id() + " via " + b.id(), engine.result(newWork));
    }

    @Test public void unknownIncompatibleAndConflictingProfilesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> models.activate("fixture-local-planner@9.9"));
        assertThrows(IllegalStateException.class, () -> models.submit("no-model", "x", false, true));
        JSONObject api = copy(0); api.put("version", "2.0"); api.put("runtimeApiMin", 3); api.put("runtimeApiMax", 3);
        JSONObject format = copy(0); format.put("version", "2.1"); format.put("format", "SAFETENSORS");
        JSONObject schema = copy(0); schema.put("version", "2.2"); schema.put("planSchema", "article-preparation@2/input-v1");
        for (JSONObject bad : new JSONObject[]{api, format, schema}) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> models.stage(profile(bad)));
            assertEquals("INCOMPATIBLE_MODEL_PROFILE", e.getMessage());
        }
        JSONObject noHash = copy(0); noHash.put("weightsSha256", "not-a-hash");
        assertThrows(IllegalArgumentException.class, () -> profile(noHash));
        JSONObject noLicense = copy(0); noLicense.put("license", "");
        assertThrows(IllegalArgumentException.class, () -> profile(noLicense));
        models.stage(a); models.stage(a);                       // same content is idempotent
        JSONObject changed = copy(0); changed.put("weightsSha256", b.weightsSha256);
        IllegalStateException conflict = assertThrows(IllegalStateException.class, () -> models.stage(profile(changed)));
        assertEquals("MODEL_PROFILE_CONFLICT", conflict.getMessage());
        assertThrows(IllegalStateException.class, () -> models.activate(a.id()));   // staged, isolation test missing
        models.recordIsolationTest(a.id(), false);
        assertThrows(IllegalStateException.class, () -> models.activate(a.id()));   // rejected stays unusable
        ready(b);
        db.execute("UPDATE model_profiles SET context_tokens=999999 WHERE profile_id=?", b.id());   // tampered row
        IllegalStateException corrupt = assertThrows(IllegalStateException.class, () -> models.activate(b.id()));
        assertEquals("MODEL_PROFILE_CORRUPT", corrupt.getMessage());
    }

    @Test public void compatibleUpdateRulesSwitchRollbackAndRetire() {
        ready(a); switchTo(a); ready(b);
        assertTrue(b.compatibleWith(2, Set.of("GGUF"), "article-preparation@1/input-v1"));
        int generation = models.generation();
        models.activate(b.id());
        assertEquals("PENDING", models.health());
        assertThrows(IllegalStateException.class, () -> models.submit("during-switch", "x", false, true));
        assertThrows(IllegalStateException.class, () -> models.activate(a.id()));
        assertEquals(a.id(), models.confirmHealth(false));              // health failure rolls back to checked A
        assertEquals("REJECTED", models.profileState(b.id()));
        assertTrue(models.generation() > generation);
        String pinned = models.submit("pinned-to-a", "x", false, true);
        assertEquals(a.id(), models.pinnedProfile(pinned).id());

        JSONObject c = copy(1); c.put("version", "1.2");
        ModelProfile third = profile(c); ready(third); switchTo(third);
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> models.retire(a.id()));
        assertEquals("MODEL_PROFILE_PINNED", e.getMessage());
        assertThrows(IllegalStateException.class, () -> models.retire(third.id()));   // active
        engine.cancel(pinned);
        models.retire(a.id());
        assertEquals("RETIRED", models.profileState(a.id()));

        models.revoke(third.id());                                        // no automatic fallback to anything
        assertNull(models.activeProfileId());
        assertThrows(IllegalStateException.class, () -> models.submit("after-revoke", "x", false, true));
    }

    @Test public void revokedPinStopsWorkAndExplicitReplanCreatesNewRevision() {
        ready(a); switchTo(a);
        String work = models.submit("work", "原稿", false, true);
        ready(b); switchTo(b);
        models.revoke(a.id());
        assertEquals(b.id(), models.activeProfileId());
        assertNull(models.claim("boot-1", 10, true));                    // the only run is stopped, not executed
        assertEquals("needs_review", engine.runs(work).get(0).get("state"));
        assertEquals("MODEL_PROFILE_UNAVAILABLE", engine.runs(work).get(0).get("error"));
        engine.retry(work);                                               // human retry cannot resume a revoked pin
        assertNull(models.claim("boot-1", 20, true));
        assertEquals("needs_review", engine.runs(work).get(0).get("state"));

        String replanned = models.replan(work, "work-r2", "原稿", true);
        assertEquals("cancelled", engine.work(work).get("state"));
        assertEquals(2, models.revision(replanned));
        assertEquals(b.id(), models.pinnedProfile(replanned).id());
        assertThrows(IllegalStateException.class, () -> models.replan(replanned, "work-r3", "原稿", true));
        ModelProfiles.PinnedTicket t = models.claim("boot-1", 30, true);
        assertEquals(replanned, t.ticket.workId); assertEquals(b.id(), t.profile.id());
    }

    @Test public void revocationBetweenClaimAndFinishStopsTheRun() {
        ready(a); switchTo(a);
        String work = models.submit("work", "原稿", false, true);
        ModelProfiles.PinnedTicket t = models.claim("boot-1", 10, true);
        models.revoke(a.id());
        assertFalse(models.finish(t, a.id(), "passed", run(t), "boot-1", 20));
        assertEquals("needs_review", engine.runs(work).get(0).get("state"));
    }

    @Test public void unpinnedLegacyWorkIsStoppedInsteadOfRunningUnderTheActiveProfile() {
        ready(a); switchTo(a);
        String legacy = engine.submit("legacy", "原稿", false, true);    // created without the Broker registry
        assertNull(models.claim("boot-1", 10, true));
        assertEquals("MODEL_PIN_MISSING", engine.runs(legacy).get(0).get("error"));
    }
}
