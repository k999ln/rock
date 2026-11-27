package si.avoado.noah.participant.test;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.lang.reflect.*;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

public final class Smoke extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
    }
    private static <T extends View> T find(View v, Class<T> type, String text) {
        if (type.isInstance(v) && (text == null || v instanceof TextView && ((TextView)v).getText().toString().equals(text))) return type.cast(v);
        if (v instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)v;
            for (int i=0; i<group.getChildCount(); i++) {
                T match = find(group.getChildAt(i), type, text);
                if (match != null) return match;
            }
        }
        return null;
    }
    private Bundle classify(String id) throws Exception {
        Context context = getTargetContext();
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Bundle> answer = new AtomicReference<>();
        Messenger reply = new Messenger(new Handler(Looper.getMainLooper(), result -> {
            if (result.what == 1) answer.set(result.getData());
            done.countDown(); return true;
        }));
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                Message request = Message.obtain(null, 1);
                request.replyTo = reply; request.getData().putString("sample", id);
                try { new Messenger(binder).send(request); } catch (RemoteException ex) { done.countDown(); }
            }
            @Override public void onServiceDisconnected(ComponentName name) { done.countDown(); }
            @Override public void onNullBinding(ComponentName name) { done.countDown(); }
        };
        Intent intent = new Intent().setClassName(context.getPackageName(), context.getPackageName() + ".InferenceService");
        check(context.bindIsolatedService(intent, Context.BIND_AUTO_CREATE, "t" + Long.toHexString(SystemClock.elapsedRealtimeNanos()),
                context.getMainExecutor(), connection), "bind isolated service");
        try { check(done.await(4, TimeUnit.SECONDS), "service response"); return answer.get(); }
        finally { context.unbindService(connection); }
    }
    private JSONObject eve(JSONObject recipe) throws Exception {
        Context c = getTargetContext();
        Class<?> client = c.getClassLoader().loadClass("si.avoado.noah.participant.EveAgentClient");
        Constructor<?> constructor = client.getDeclaredConstructor(Context.class);
        Method prepare = client.getDeclaredMethod("prepare"), run = client.getDeclaredMethod("run", JSONObject.class);
        constructor.setAccessible(true); prepare.setAccessible(true); run.setAccessible(true);
        Object instance = constructor.newInstance(c);
        try {
            check((Boolean)prepare.invoke(instance), "packaged agent renderer prepared in a separate process");
            try { return (JSONObject)run.invoke(instance, recipe); }
            catch (InvocationTargetException e) {
                if (e.getCause() instanceof java.io.IOException) return null;
                throw e;
            }
        } finally {
            ((AutoCloseable)instance).close();
        }
    }

    @Override public void onStart() {
        Bundle report = new Bundle();
        try {
            Context target = getTargetContext();
            Activity screen = startActivitySync(new Intent().setClassName(target.getPackageName(), target.getPackageName() + ".ParticipantActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            runOnMainSync(() -> {
                View root = screen.getWindow().getDecorView();
                check((screen.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0, "secret screen");
                check(!find(root, CheckBox.class, null).isChecked(), "opt-out by default");
                check(!find(root, Button.class, "今すぐ停止").isEnabled(), "idle by default");
                CheckBox eveConsent = find(root, CheckBox.class, "Eveで組み合わせたAgentにも参加する。他の利用者が送った公開原稿と記事の設定を受け取り、出典の整形、無料記事の作成、CSVの整理をこの端末で行います。");
                check(eveConsent != null && !eveConsent.isChecked(), "Eve is separately opt-in");
                find(root, Button.class, "端末参加を開始").performClick();
                check(find(root, TextView.class, "登録画面の端末ID・トークンを入力し、端末参加に同意してください。") != null, "requires explicit consent");
                TextView tokenLabel = find(root, TextView.class, "端末トークン");
                EditText tokenField = screen.findViewById(tokenLabel.getLabelFor());
                tokenField.setText("00000000-0000-0000-0000-000000000000");
                TextView idLabel = find(root, TextView.class, "端末ID");
                ((EditText)screen.findViewById(idLabel.getLabelFor())).setText("00000000-0000-0000-0000-000000000001");
                check(!target.getSystemService(BatteryManager.class).isCharging(), "test emulator must be unplugged");
                find(root, CheckBox.class, null).setChecked(true);
                find(root, Button.class, "端末参加を開始").performClick();
                check(find(root, TextView.class, "充電、非従量のWi-Fi、省電力オフ、温度計測の各条件を確認してください。") != null, "power loss prevents participation");
                check(!find(root, Button.class, "今すぐ停止").isEnabled(), "no lease while unplugged");
                callActivityOnPause(screen);
                check(tokenField.length() == 0, "token cleared on pause");
                screen.finish();
            });
            String[] ids = {"meeting-notes","inventory-update","research-summary","order-review","terms-0.15.1.2","terms-15.15.15.15"};
            String[] labels = {"meeting","inventory","research","inventory","inventory","research"};
            int[] scores = {18,17,22,18,62,90};
            for (int i=0; i<ids.length; i++) {
                Bundle result = classify(ids[i]);
                check(result != null && labels[i].equals(result.getString("label")) && result.getInt("score") == scores[i], "inference " + ids[i]);
            }
            for (String invalid : new String[]{"unknown", "terms-0.0.0.0", "terms-00.1.0.0", "terms-16.0.0.0", "terms-1.0.0.0\n", "terms-1..0.0"}) {
                check(classify(invalid) == null, "invalid input");
            }
            String csv = "market:tool:rockstar-csv-cleanup", citations = "market:tool:mr-citations";
            String literal = "<script>globalThis.noahEveReady=false</script>";
            JSONArray steps = new JSONArray().put(csv).put(csv);
            JSONObject cleaned = eve(new JSONObject().put("agents", steps).put("source", "id\n " + literal + " \n" + literal));
            check(cleaned != null && ("id\r\n" + literal + "\r\n").equals(cleaned.getString("text"))
                && steps.toString().equals(cleaned.getJSONArray("steps").toString()), "CSV handoff and literal source");
            JSONObject formatted = eve(new JSONObject().put("agents", new JSONArray().put(citations))
                .put("source", "本文。（出典: [例](https://example.org)）"));
            check(formatted != null && formatted.getString("text").contains("## 出典"), "citation agent");
            JSONArray articleSteps = new JSONArray().put(citations).put("market:tool:mr-free-article");
            JSONObject articleOptions = new JSONObject().put("afterChars", 1).put("price", 100)
                .put("summary","- 資料\n- 要点\n- 次回").put("paidContents","残りの説明").put("noteUrl","https://note.com/sample/n/test");
            JSONObject article = eve(new JSONObject().put("agents", articleSteps)
                .put("source", "# 例\n概要。詳しい説明。（出典: [例](https://example.org)）").put("options", articleOptions));
            check(article != null && articleSteps.toString().equals(article.getJSONArray("steps").toString())
                && article.getString("text").contains("## 出典") && article.getString("text").contains("## まとめ")
                && article.getString("text").contains("https://note.com/sample/n/test"), "citations to free article handoff");
            check(eve(new JSONObject().put("agents", new JSONArray().put("external")).put("source","id")) == null, "fixed agent allowlist");
            report.putString("result", "PASS consent, unplugged refusal, privacy flag, token cleared on pause, isolation, four built-in samples, public dictionary counts, rejected noncanonical inputs, Eve opt-in, sandboxed CSV and citation-to-free-article chains, rejected external agent");
            finish(Activity.RESULT_OK, report);
        } catch (Throwable error) {
            report.putString("error", android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, report);
        }
    }
}
