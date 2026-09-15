package dev.rock.automation;

import android.app.Application;
import dev.rock.core.Engine;
import dev.rock.core.platform.PlatformStore;

public final class RockApplication extends Application {
    private AndroidDatabase database;
    private Engine engine;
    private PlatformStore platform;

    private synchronized AndroidDatabase database() {
        if (database == null) database = new AndroidDatabase(this);
        return database;
    }

    public synchronized Engine engine() {
        if (engine == null) engine = new Engine(database());
        return engine;
    }

    public synchronized PlatformStore platform() {
        if (platform == null) platform = new PlatformStore(database());
        return platform;
    }
}
