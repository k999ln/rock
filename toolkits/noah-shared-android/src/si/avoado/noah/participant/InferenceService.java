package si.avoado.noah.participant;

import android.app.Service;
import android.content.Intent;
import android.os.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

public final class InferenceService extends Service {
    static final String DIGEST = "c76d26657b9dc9697400af2b6cc063fe44448df227427c6b8b7a426b992bcfdb";
    static Bundle infer(JSONObject model, String id) throws Exception {
        JSONArray samples = model.getJSONArray("samples");
        String input = null;
        for (int i = 0; i < samples.length(); i++) {
            JSONObject sample = samples.getJSONObject(i);
            if (sample.getString("id").equals(id)) input = sample.getString("text");
        }
        if (input == null) throw new IOException("sample");
        String[] words = input.toLowerCase(Locale.ROOT).split("[^a-z]+");
        int[] features = new int[4];
        JSONArray groups = model.getJSONArray("terms");
        for (int g = 0; g < 4; g++) {
            JSONArray terms = groups.getJSONArray(g);
            for (String word : words) {
                for (int i = 0; i < terms.length(); i++) {
                    if (word.equals(terms.getString(i))) { features[g]++; break; }
                }
            }
        }
        int best = Integer.MIN_VALUE;
        String label = "";
        JSONArray classes = model.getJSONArray("classes");
        for (int i = 0; i < classes.length(); i++) {
            JSONObject candidate = classes.getJSONObject(i);
            JSONArray weights = candidate.getJSONArray("weights");
            int score = 0;
            for (int g = 0; g < 4; g++) score += weights.getInt(g) * features[g];
            if (score > best) { best = score; label = candidate.getString("label"); }
        }
        Bundle value = new Bundle();
        value.putString("label", label);
        value.putInt("score", best);
        return value;
    }

    private Bundle classify(String sample) throws Exception {
        // This isolated process receives only a sample identifier. Its sole input file is an APK asset.
        byte[] data = new byte[8192];
        int total = 0;
        try (InputStream in = getAssets().open("model.json")) {
            int n;
            while (total < data.length && (n = in.read(data, total, data.length - total)) != -1) total += n;
        }
        if (total == data.length) throw new IOException("model length");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update(data, 0, total);
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
        if (!DIGEST.contentEquals(hex)) throw new IOException("model integrity");
        return infer(new JSONObject(new String(data, 0, total, StandardCharsets.UTF_8)), sample);
    }

    @Override public IBinder onBind(Intent intent) {
        if (!android.os.Process.isIsolated()) return null;
        return new Messenger(new Handler(Looper.getMainLooper(), message -> {
            if (message.what == 1 && message.replyTo != null) {
                Message result = Message.obtain(null, 1);
                try { result.setData(classify(message.getData().getString("sample"))); }
                catch (Exception ignored) { result.what = 0; }
                try { message.replyTo.send(result); } catch (RemoteException ignored) { }
            }
            return true;
        })).getBinder();
    }

    @Override public boolean onUnbind(Intent intent) {
        android.os.Process.killProcess(android.os.Process.myPid());
        return false;
    }
}
