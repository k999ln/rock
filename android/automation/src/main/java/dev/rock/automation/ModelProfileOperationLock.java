package dev.rock.automation;

/** Serializes profile replacement against Zema's pre-inference pin and local inference start. */
final class ModelProfileOperationLock {
    static final Object LOCK = new Object();
    private ModelProfileOperationLock() {}
}
