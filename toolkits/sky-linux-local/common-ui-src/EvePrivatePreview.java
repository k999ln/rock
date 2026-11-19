package dev.rock.shell;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.util.AtomicFile;
import java.io.File;
import org.json.JSONObject;

/** Explicit USB-only development realm. The existing production session is never copied. */
final class EvePrivatePreview {
    static final String ORIGIN = "http://localhost:5199";
    static final String NORMAL = "https://avoado.si";
    static boolean privateOrigin(boolean debug, String origin) { return debug && ORIGIN.equals(origin); }
    static boolean finished(String status) {
        return java.util.Arrays.asList("review", "completed", "stopped", "failed", "cancelled").contains(status);
    }
    static boolean allowed(Context c) {
        return (c.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }
    static boolean selected(Context c) {
        return privateOrigin(allowed(c), EveAccountSync.endpoint(c));
    }
    static AtomicFile session(Context c, String origin) {
        if (!ORIGIN.equals(origin)) return null;
        if (!allowed(c)) throw new IllegalStateException("この接続は本人用の試験版だけで使えます。");
        File directory = new File(c.getNoBackupFilesDir(), "private-eve-preview");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("試用の接続を保存できません。");
        return new AtomicFile(new File(directory, "session-v2.bin"));
    }
    static void select(Context c, boolean preview) throws Exception {
        if (!allowed(c)) throw new IllegalStateException("この接続は本人用の試験版だけで使えます。");
        c.stopService(new Intent(c, EvePixelHostService.class));
        long until = android.os.SystemClock.elapsedRealtime() + 3000;
        while (EvePixelHostService.running() && android.os.SystemClock.elapsedRealtime() < until) Thread.sleep(25);
        if (EvePixelHostService.running()) throw new IllegalStateException("同期の終了を待って、もう一度お試しください。");
        synchronized (EveAccountSync.class) {
            EvePortableStopHandles handles = new EvePortableStopHandles(new File(c.getNoBackupFilesDir(), "portable-stops").toPath());
            if (handles.pending()) throw new IllegalStateException("前の仕事の停止確認が残っています。同じ接続で停止を確認してください。");
            JSONObject state = SkyLinuxBridge.request(c, new JSONObject().put("action", "status"));
            if ("preparing".equals(state.optString("phase"))) throw new IllegalStateException("AIの準備が終わってから接続を切り替えてください。");
            org.json.JSONArray runs = state.getJSONArray("runs");
            for (int i = 0; i < runs.length(); i++) {
                String status = runs.getJSONObject(i).getJSONObject("job").getString("status");
                if (!finished(status))
                    throw new IllegalStateException("実行中か結果を確認できていない仕事があります。元の接続で確認してください。");
            }
            String destination = preview ? ORIGIN : NORMAL;
            // No credential or job metadata is written here. Each realm reads its own encrypted session.
            if (!EveAccountSync.prefs(c).edit().putString("origin", destination).commit())
                throw new IllegalStateException("接続先を保存できませんでした。");
            EveAccountSync.notice = preview ? "このPCとの接続をWeb画面で確認してください。" : "通常サイトの接続へ戻しました。";
        }
    }
}
