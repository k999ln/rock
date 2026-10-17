package dev.rock.automation;

import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/** Serializes stop with the final model-plan commit, without holding a lock during inference. */
final class LocalPlanningFence {
    static final class Attempt {
        private boolean stopped;
        private final Runnable cancel;
        Attempt(Runnable cancel) { this.cancel = cancel; }
    }
    private Attempt active;
    synchronized Attempt begin(BooleanSupplier paused, Runnable cancel) {
        if (paused.getAsBoolean()) throw new IllegalStateException("LOCAL_EXECUTION_PAUSED");
        if (active != null) throw new IllegalStateException("LOCAL_PLANNING_BUSY");
        active = new Attempt(cancel); return active;
    }
    synchronized void changePause(boolean paused, Runnable persist) {
        persist.run();
        if (paused && active != null) {
            active.stopped = true;
            active.cancel.run();
        }
    }
    synchronized String commit(Attempt attempt, BooleanSupplier paused, Supplier<String> submit) {
        if (active != attempt || attempt.stopped || paused.getAsBoolean())
            throw new IllegalStateException("LOCAL_EXECUTION_PAUSED");
        return submit.get();
    }
    synchronized boolean stopped(Attempt attempt) { return attempt.stopped; }
    synchronized void finish(Attempt attempt) { if (active == attempt) active = null; }
}
