package dev.rock.automation;

import android.app.Application;
import dev.rock.core.Engine;

public final class RockApplication extends Application {
    private Engine engine;
    public synchronized Engine engine() {
        if (engine == null) engine = new Engine(new AndroidDatabase(this));
        return engine;
    }
}
