package dev.rock.xsession;
import android.app.Application;
import android.webkit.WebView;
/** Select a dedicated profile before any WebView is initialized in this process. */
public final class XSessionApplication extends Application {
    @Override public void onCreate() { super.onCreate();WebView.setDataDirectorySuffix("x-account"); }
}
