package si.avoado.noah.participant;

import android.app.Service;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONObject;

/** Hosts one bundled ES module in a system Chromium renderer, separate from the session with the device credential. */
public final class EveAgentService extends Service {
    static final String WORKLOAD = "eve-agent-chain-v1";
    static final String DIGEST = "f55ce73ace6e469e945e223d5533afac296228ecfb9deced2f811c93c0e7b066";
    static final int PREPARE = 1, RUN = 2, FAILED = 0;
    private static final Uri ORIGIN = Uri.parse("https://participant.invalid");
    private WebView view;
    private WebMessagePort answer;
    private Messenger listener;
    private boolean ready, used;
    private String pageUrl;

    @Override public void onCreate() {
        super.onCreate();
        WebView.setDataDirectorySuffix("noah_eve_participant");
        WebView.setWebContentsDebuggingEnabled(false);
    }

    private byte[] asset(String name) throws IOException {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] part = new byte[4096];
            int n;
            while ((n = in.read(part)) != -1) {
                if (out.size() + n > 128 * 1024) throw new IOException("asset length");
                out.write(part, 0, n);
            }
            return out.toByteArray();
        }
    }

    private String program() throws Exception {
        byte[] bytes = asset("eve-agents.mjs");
        StringBuilder hex = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes))
            hex.append(String.format(Locale.ROOT, "%02x", b & 255));
        if (!DIGEST.contentEquals(hex)) throw new IOException("unrecognized module");
        String script = new String(bytes, StandardCharsets.UTF_8);
        if (script.toLowerCase(Locale.ROOT).contains("</script")) throw new IOException("module envelope");
        return script;
    }

    private void notifyClient(int type, String result) {
        if (listener == null) return;
        Message m = Message.obtain(null, type);
        if (result != null) m.getData().putString("result", result);
        try { listener.send(m); } catch (RemoteException ignored) {}
    }

    private void prepare(Messenger reply) throws Exception {
        if (view != null) throw new IOException("used");
        listener = reply;
        String script = program(), nonce = UUID.randomUUID().toString();
        pageUrl = ORIGIN + "/" + nonce;
        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setBlockNetworkLoads(true);
        settings.setBlockNetworkImage(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setGeolocationEnabled(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                ready = false;
                notifyClient(FAILED, null);
                v.destroy(); view = null;
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!pageUrl.equals(url) || v.getWebViewRenderProcess() == null) { notifyClient(FAILED, null); return; }
                v.evaluateJavascript("globalThis.noahEveReady === true", result -> {
                    ready = "true".equals(result);
                    notifyClient(ready ? PREPARE : FAILED, null);
                });
            }
        });
        // Both resources are packaged in the APK. Recipes enter only via a WebMessage.
        String html = new String(asset("eve-renderer.html"), StandardCharsets.UTF_8)
            .replace("{{NONCE}}", nonce).replace("{{PROGRAM}}", script);
        view.loadDataWithBaseURL(pageUrl, html, "text/html", "UTF-8", null);
    }

    private void execute(Messenger reply, String recipe) throws Exception {
        listener = reply;
        if (!ready || used || view == null || view.getWebViewRenderProcess() == null || recipe == null
                || recipe.getBytes(StandardCharsets.UTF_8).length > 32768) throw new IOException("unavailable");
        used = true;
        WebMessagePort[] ports = view.createWebMessageChannel();
        answer = ports[0];
        answer.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort port, WebMessage message) {
                String raw = message.getData();
                try {
                    if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > 32768) throw new IOException();
                    JSONObject result = new JSONObject(raw);
                    if (result.length() != 2 || result.getString("text").getBytes(StandardCharsets.UTF_8).length > 12288
                        || result.getJSONArray("steps").length() > 4) throw new IOException();
                    notifyClient(RUN, raw);
                } catch (Exception e) { notifyClient(FAILED, null); }
                port.close(); answer = null;
            }
        });
        view.postWebMessage(new WebMessage(recipe, new WebMessagePort[]{ports[1]}), ORIGIN);
    }

    @Override public IBinder onBind(Intent intent) {
        return new Messenger(new Handler(Looper.getMainLooper(), m -> {
            if (m.replyTo == null) return true;
            try {
                if (m.what == PREPARE) prepare(m.replyTo);
                else if (m.what == RUN) execute(m.replyTo, m.getData().getString("recipe"));
            } catch (Exception e) { listener = m.replyTo; notifyClient(FAILED, null); }
            return true;
        })).getBinder();
    }

    @Override public boolean onUnbind(Intent intent) {
        listener = null;
        if (answer != null) answer.close();
        if (view != null) {
            WebViewRenderProcess renderer = view.getWebViewRenderProcess();
            if (renderer != null) renderer.terminate();
            view.destroy(); view = null;
        }
        android.os.Process.killProcess(android.os.Process.myPid());
        return false;
    }
}
