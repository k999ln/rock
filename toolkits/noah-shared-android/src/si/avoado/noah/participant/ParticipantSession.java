package si.avoado.noah.participant;

import android.content.*;
import android.net.Network;
import android.os.*;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.net.ssl.HttpsURLConnection;

final class ParticipantSession {
    interface Listener { void ended(String reason); }
    private final Context context;
    private final DeviceConditions conditions;
    private final String deviceId;
    private final String token;
    private final boolean eveEnabled;
    private final Listener listener;
    private final long end;
    private final AtomicBoolean stopped = new AtomicBoolean();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile HttpsURLConnection current;
    private int remainingBytes = 256 * 1024;

    ParticipantSession(Context ctx, DeviceConditions conditions, String deviceId, String token, int minutes, boolean eveEnabled, Listener listener) {
        this.context = ctx.getApplicationContext();
        this.conditions = conditions;
        this.deviceId = deviceId;
        this.token = token;
        this.eveEnabled = eveEnabled;
        this.listener = listener;
        end = SystemClock.elapsedRealtime() + minutes * 60_000L;
    }

    void stop() {
        stopped.set(true);
        executor.shutdownNow(); // also interrupts a wait for the isolated process.
        HttpsURLConnection connection = current;
        if (connection != null) {
            if (Looper.myLooper() == Looper.getMainLooper()) new Thread(connection::disconnect, "noah-disconnect").start();
            else connection.disconnect();
        }
    }

    private Network check() throws IOException {
        if (stopped.get() || SystemClock.elapsedRealtime() >= end || Thread.currentThread().isInterrupted())
            throw new IOException("端末参加を終了しました。");
        Network network = conditions.allowedNetwork();
        if (network == null) throw new IOException("充電・通信・温度の参加条件から外れました。");
        return network;
    }

    private JSONObject api(String action, JSONObject body) throws Exception {
        Network network = check();
        body.put("action", action).put("deviceId", deviceId).put("deviceToken", token);
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        final int maxReply = action.equals("claim") && body.has("workloads") ? 32768 : 4096;
        if (payload.length > 32768 || remainingBytes < payload.length + maxReply) throw new IOException("通信量の上限に達しました。");
        remainingBytes -= payload.length + maxReply;
        URL url = new URL("https://avoado.si/api/noah/shared-compute");
        HttpsURLConnection conn = (HttpsURLConnection) network.openConnection(url);
        current = conn;
        try {
            if (!network.equals(check())) throw new IOException("接続先が変わりました。");
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(1200);
            conn.setReadTimeout(1200);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = conn.getOutputStream()) { out.write(payload); }
            if (conn.getResponseCode() != 200) throw new IOException("参加受付が停止しました。");
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[512];
                int n;
                while ((n = in.read(chunk)) != -1) {
                    if (buf.size() + n > maxReply) throw new IOException("応答の上限に達しました。");
                    check();
                    buf.write(chunk, 0, n);
                }
                remainingBytes += maxReply - buf.size();
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            conn.disconnect();
            current = null;
        }
    }

    private Bundle compute(String sample) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Bundle> result = new AtomicReference<>();
        Messenger reply = new Messenger(new Handler(Looper.getMainLooper(), m -> {
            if (m.what == 1) result.set(m.getData());
            done.countDown();
            return true;
        }));
        ServiceConnection binding = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                if (stopped.get()) { done.countDown(); return; }
                Message req = Message.obtain(null, 1);
                req.getData().putString("sample", sample);
                req.replyTo = reply;
                try { new Messenger(binder).send(req); } catch (RemoteException ex) { done.countDown(); }
            }
            @Override public void onServiceDisconnected(ComponentName name) { done.countDown(); }
            @Override public void onNullBinding(ComponentName name) { done.countDown(); }
            @Override public void onBindingDied(ComponentName name) { done.countDown(); }
        };
        Intent intent = new Intent(context, InferenceService.class);
        if (!context.bindIsolatedService(intent, Context.BIND_AUTO_CREATE,
                "j" + Long.toHexString(SystemClock.elapsedRealtimeNanos()), context.getMainExecutor(), binding))
            throw new IOException("計算用プロセスを開始できません。");
        try {
            if (!done.await(750, TimeUnit.MILLISECONDS) || result.get() == null || stopped.get())
                throw new IOException("端末の計算を停止しました。");
            return result.get();
        } finally { context.unbindService(binding); }
    }

    private static JSONObject ids(JSONObject lease) throws Exception {
        return new JSONObject().put("jobId", lease.getString("jobId")).put("leaseId", lease.getString("leaseId"));
    }

    boolean validLease(JSONObject data) throws Exception {
        long ms = data.getLong("expiresAt") - System.currentTimeMillis();
        return ms > 900 && ms <= 4500;
    }

    void start() {
        executor.execute(() -> {
            String status = "参加時間が終了しました。";
            EveAgentClient eve = null;
            try {
                for (int jobs = 0; jobs < 30 && SystemClock.elapsedRealtime() < end;) {
                    check();
                    JSONObject claim = new JSONObject();
                    if (eveEnabled) {
                        if (eve == null) {
                            eve = new EveAgentClient(context);
                            if (!eve.prepare()) {
                                status = "この端末のWebViewでAgentの隔離実行を確認できません。WebViewを更新して再度お試しください。";
                                break;
                            }
                        }
                        claim.put("workloads", new JSONArray().put(EveAgentService.WORKLOAD));
                    }
                    JSONObject lease = api("claim", claim).optJSONObject("lease");
                    if (lease != null) {
                        jobs++;
                        boolean isEve = EveAgentService.WORKLOAD.equals(lease.optString("workload"));
                        boolean supported = isEve ? eveEnabled && eve != null && EveAgentService.DIGEST.equals(lease.optString("artifactSha256"))
                                && lease.optJSONObject("recipe") != null
                                : "public-topic-v1".equals(lease.optString("workload")) && InferenceService.acceptsInput(lease.optString("sampleId"))
                                && InferenceService.DIGEST.equals(lease.optString("artifactSha256"));
                        if (!supported || !validLease(lease))
                            throw new IOException("対応する割り当てを確認できません。");
                        JSONObject heartbeat = api("heartbeat", ids(lease));
                        if (!validLease(heartbeat)) throw new IOException("割り当て期限が終了しました。");
                        check();
                        long start = SystemClock.elapsedRealtime();
                        JSONObject output;
                        if (isEve) {
                            output = eve.run(lease.getJSONObject("recipe"));
                            eve.close(); eve = null;
                        } else {
                            Bundle result = compute(lease.getString("sampleId"));
                            output = new JSONObject().put("label", result.getString("label")).put("score", result.getInt("score"));
                        }
                        long elapsed = Math.max(1, SystemClock.elapsedRealtime() - start);
                        if (elapsed > 750 || !validLease(heartbeat)) throw new IOException("計算期限が終了しました。");
                        api("complete", ids(lease).put("result", output).put("elapsedMs", elapsed));
                        if (jobs == 30) { status = "30件の上限に達しました。"; break; }
                    }
                    Thread.sleep(5000);
                }
            } catch (Exception ex) {
                status = "端末参加を停止しました。通信、参加許可、充電・温度の条件を確認してください。";
            } finally {
                if (eve != null) eve.close();
                stop();
                listener.ended(status);
            }
        });
    }
}
