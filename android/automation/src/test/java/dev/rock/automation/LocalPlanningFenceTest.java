package dev.rock.automation;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public final class LocalPlanningFenceTest {
    @Test public void stopThenResumeCannotCommitALateModelPlan() {
        LocalPlanningFence fence = new LocalPlanningFence();
        AtomicBoolean paused = new AtomicBoolean(); AtomicInteger cancels = new AtomicInteger(), writes = new AtomicInteger();
        LocalPlanningFence.Attempt attempt = fence.begin(paused::get, cancels::incrementAndGet);
        fence.changePause(true, () -> paused.set(true));
        fence.changePause(false, () -> paused.set(false));
        assertEquals(1, cancels.get());
        assertThrows(IllegalStateException.class, () -> fence.commit(attempt, paused::get, () -> { writes.incrementAndGet(); return "unexpected"; }));
        assertEquals(0, writes.get()); fence.finish(attempt);
        LocalPlanningFence.Attempt next = fence.begin(paused::get, () -> {});
        assertEquals("next-job", fence.commit(next, paused::get, () -> "next-job"));
        fence.finish(next);
    }
    @Test public void pausedOrStaleAttemptsCannotCreateJobs() {
        LocalPlanningFence fence = new LocalPlanningFence();
        assertThrows(IllegalStateException.class, () -> fence.begin(() -> true, () -> {}));
        LocalPlanningFence.Attempt first = fence.begin(() -> false, () -> {}); fence.finish(first);
        LocalPlanningFence.Attempt next = fence.begin(() -> false, () -> {});
        fence.finish(first);
        assertThrows(IllegalStateException.class, () -> fence.commit(first, () -> false, () -> "wrong"));
        assertEquals("valid", fence.commit(next, () -> false, () -> "valid"));
    }
}
