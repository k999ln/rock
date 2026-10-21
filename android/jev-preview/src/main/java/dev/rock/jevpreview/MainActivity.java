package dev.rock.jevpreview;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Standalone developer preview activity; it has no Broker, Shell or Tool dependency. */
public final class MainActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(24, 24, 24, 24);
        label(form, "Jev Pixel Developer Preview", 22);
        TextView message = label(form, "固定公開fixtureのみ。Broker、Shell、Tool、端末API keyは使いません。", 16);
        attachDebugPreview(form, message);
        setContentView(form);
    }

    private static TextView label(LinearLayout form, String text, int size) {
        TextView value = new TextView(form.getContext());
        value.setText(text);
        value.setTextSize(size);
        value.setPadding(0, 12, 0, 8);
        form.addView(value);
        return value;
    }

    /** The client class is available only in the debug source set. */
    private void attachDebugPreview(LinearLayout form, TextView message) {
        try {
            Class<?> hook = Class.forName("dev.rock.jevpreview.PixelJevPreviewDebug");
            hook.getMethod("attach", Activity.class, LinearLayout.class, TextView.class)
                .invoke(null, this, form, message);
        } catch (ClassNotFoundException ignored) {
            message.setText("release build: Jev physical preview is unavailable");
        } catch (ReflectiveOperationException error) {
            message.setText("Jev preview: debug client unavailable");
        }
    }
}
