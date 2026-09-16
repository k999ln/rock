package dev.rock.automation;

import android.content.Context;
import android.content.ContextWrapper;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import dev.rock.core.Engine;
import java.io.File;
import java.util.Map;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Two-phase physical acceptance. Run seed, reboot the device, then run recover. */
@RunWith(AndroidJUnit4.class)
public final class PhysicalRebootRecoveryTest {
    private static final String DATABASE = "sky-zema-physical-reboot.db";
    private static final String REQUEST = "sky-zema-physical-reboot-v1";

    private static String phase() {
        return InstrumentationRegistry.getArguments().getString("avocadoPhase", "");
    }

    private static Context databaseContext(Context target) {
        return new ContextWrapper(target) {
            @Override public File getDatabasePath(String ignored) {
                return target.getDatabasePath(DATABASE);
            }
        };
    }

    @Test public void seedSelectedToolAndLeaveFirstStepRunning() throws Exception {
        Assume.assumeTrue("seed".equals(phase()));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue(target.deleteDatabase(DATABASE) || !target.getDatabasePath(DATABASE).exists());
        assertEquals("ready", new LocalAiConnection(target).status());
        try (AndroidDatabase db = new AndroidDatabase(databaseContext(target))) {
            Engine engine = new Engine(db);
            Engine.SkySelection selection = engine.selectSkyTool(Engine.RECIPE);
            String workId = new ZemaOrchestrator(target, engine).submit(
                REQUEST, selection.token,
                "再起動復旧を検証する記事原稿と要約を準備して", "[]", true);
            int boot = Settings.Global.getInt(target.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
            assertTrue(boot >= 0);
            Engine.Ticket running = engine.claim(Integer.toString(boot), SystemClock.elapsedRealtime(), true);
            assertNotNull(running); assertEquals(workId, running.workId);
            assertEquals(0, running.step); assertEquals(1, running.attempt);
            assertEquals("running", engine.runs(workId).get(0).get("state"));
            System.out.println("AVOCADO_REBOOT_SEED=RUNNING_FIRST_STEP");
        }
    }

    @Test public void recoverSelectedToolAndFinishAfterPhysicalReboot() throws Exception {
        Assume.assumeTrue("recover".equals(phase()));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (AndroidDatabase db = new AndroidDatabase(databaseContext(target))) {
            Engine engine = new Engine(db);
            Engine.SkySelection selection = engine.skySelection();
            assertNotNull(selection);
            assertEquals(Engine.RECIPE, engine.requireSkySelection(selection.token));
            String workId = engine.existingWorkId(REQUEST); assertNotNull(workId);
            Map<String,String> interrupted = engine.runs(workId).get(0);
            assertEquals("running", interrupted.get("state"));
            int boot = Settings.Global.getInt(target.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
            assertTrue(boot >= 0); assertNotEquals(Integer.toString(boot), interrupted.get("boot"));

            Engine.Ticket recovered = engine.claim(Integer.toString(boot), SystemClock.elapsedRealtime(), true);
            assertNotNull(recovered); assertEquals(0, recovered.step); assertEquals(2, recovered.attempt);
            ToolConnection.Result first = new ToolConnection(target).execute(recovered);
            assertEquals("passed", first.outcome);
            assertTrue(engine.finish(recovered, first.outcome, first.output,
                Integer.toString(boot), SystemClock.elapsedRealtime()));

            Engine.Ticket second = engine.claim(Integer.toString(boot), SystemClock.elapsedRealtime(), true);
            assertNotNull(second); assertEquals(1, second.step);
            ToolConnection.Result last = new ToolConnection(target).execute(second);
            assertEquals("passed", last.outcome);
            assertTrue(engine.finish(second, last.outcome, last.output,
                Integer.toString(boot), SystemClock.elapsedRealtime()));
            assertEquals("review", engine.work(workId).get("state"));
            assertFalse(engine.result(workId).trim().isEmpty());
            assertEquals(7, engine.events(workId).size());
            System.out.println("AVOCADO_REBOOT_RECOVERY=SELECTED_TOOL_RESULT_HISTORY_REVIEW");
        } finally {
            target.deleteDatabase(DATABASE);
        }
    }
}
