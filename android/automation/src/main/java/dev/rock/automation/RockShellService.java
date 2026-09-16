package dev.rock.automation;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.IBinder;
import dev.rock.core.Engine;
import dev.rock.sdk.ArticlePayload;
import dev.rock.shellapi.IShellApi;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Exact-package UI bridge. The shell never opens the Broker database or Keystore directly. */
public final class RockShellService extends Service {
    static final String SHELL_PACKAGE = "dev.rock.shell";
    private static final int MAX_SNAPSHOT_WORKS = 25;
    private final Object zemaLock = new Object();

    private final IShellApi.Stub binder = new IShellApi.Stub() {
        @Override public int getApiVersion() { enforceShellCaller(); return 2; }
        @Override public String snapshot() throws android.os.RemoteException {
            enforceShellCaller();
            try { return snapshotJson(); }
            catch (RuntimeException error) { throw new android.os.RemoteException("SNAPSHOT_FAILED"); }
        }
        @Override public String submit(String requestId, String inputJson, boolean sample, boolean consent) {
            enforceShellCaller(); ArticlePayload.parse(inputJson);
            String id = engine().submit(requestId, inputJson, sample, consent); Scheduler.schedule(RockShellService.this); return id;
        }
        @Override public void setPaused(boolean paused) {
            enforceShellCaller(); engine().setPaused(paused);
            if (paused) Scheduler.stop(RockShellService.this); else Scheduler.schedule(RockShellService.this);
        }
        @Override public String result(String workId) { enforceShellCaller(); validWorkId(workId); return engine().result(workId); }
        @Override public void complete(String workId, String note) { enforceShellCaller(); validWorkId(workId); engine().complete(workId, note); }
        @Override public void retry(String workId) { enforceShellCaller(); validWorkId(workId); engine().retry(workId); Scheduler.schedule(RockShellService.this); }
        @Override public void cancel(String workId) { enforceShellCaller(); validWorkId(workId); engine().cancel(workId); }
        @Override public String localAiStatus() throws android.os.RemoteException {
            enforceShellCaller();
            try { return new LocalAiConnection(RockShellService.this).status(); }
            catch (Exception error) { throw new android.os.RemoteException("LOCAL_AI_UNAVAILABLE"); }
        }
        @Override public String submitZema(String requestId, String toolId, String prompt,
                String contextJson, boolean consent) {
            enforceShellCaller();
            try {
                synchronized (zemaLock) {
                    String id = new ZemaOrchestrator(RockShellService.this, engine())
                        .submit(requestId, toolId, prompt, contextJson, consent);
                    Scheduler.schedule(RockShellService.this);
                    return zemaResponse("queued", null, id);
                }
            } catch (SecurityException denied) {
                String reason = denied.getMessage();
                String code;
                if ("LOCAL_ARTIFACT_CONSENT_REQUIRED".equals(reason)) code = "DENIED";
                else if ("ZEMA_TOOL_SUBSTITUTION".equals(reason)
                        || "LOCAL_AI_MAY_NOT_EXECUTE_SELECTED_TOOL".equals(reason))
                    code = "INVALID_PLAN";
                else code = "LOCAL_AI_UNAVAILABLE";
                return zemaResponse("blocked", code, null);
            } catch (IllegalArgumentException invalid) {
                return zemaResponse("blocked", "INVALID_PLAN", null);
            } catch (Exception failed) {
                return zemaResponse("blocked", "LOCAL_AI_UNAVAILABLE", null);
            }
        }
    };

    @Override public IBinder onBind(Intent intent) { return binder; }
    private Engine engine() { return ((RockApplication) getApplication()).engine(); }

    private void enforceShellCaller() {
        int uid = Binder.getCallingUid();
        String[] names = getPackageManager().getPackagesForUid(uid);
        if (names == null || names.length != 1 || !SHELL_PACKAGE.equals(names[0]))
            throw new SecurityException("UNTRUSTED_SHELL_UID");
        if (getPackageManager().checkSignatures(getPackageName(), SHELL_PACKAGE) != PackageManager.SIGNATURE_MATCH)
            throw new SecurityException("UNTRUSTED_SHELL_SIGNER");
        try {
            if (getPackageManager().getPackageInfo(SHELL_PACKAGE, 0).getLongVersionCode() != 1)
                throw new SecurityException("UNAPPROVED_SHELL_VERSION");
        } catch (PackageManager.NameNotFoundException missing) {
            throw new SecurityException("SHELL_NOT_INSTALLED");
        }
    }

    private String snapshotJson() {
        try {
            JSONObject root = new JSONObject(); root.put("apiVersion", 1); root.put("paused", engine().paused());
            List<Map<String,String>> workItems = engine().list();
            root.put("totalWorkCount", workItems.size());
            root.put("truncated", workItems.size() > MAX_SNAPSHOT_WORKS);
            JSONArray works = new JSONArray();
            for (int index = 0; index < Math.min(workItems.size(), MAX_SNAPSHOT_WORKS); index++) {
                Map<String,String> work = workItems.get(index);
                JSONObject item = new JSONObject();
                item.put("id", work.get("id")); item.put("state", work.get("state")); item.put("sample", "1".equals(work.get("sample")));
                JSONArray runs = new JSONArray();
                for (Map<String,String> run : engine().runs(work.get("id"))) {
                    JSONObject step = new JSONObject();
                    step.put("tool", run.get("tool")); step.put("state", run.get("state"));
                    step.put("attempt", Integer.parseInt(run.get("attempt")));
                    step.put("error", run.get("error") == null ? JSONObject.NULL : run.get("error"));
                    runs.put(step);
                }
                item.put("runs", runs); works.put(item);
            }
            root.put("works", works); String result = root.toString(); Engine.bounded(result); return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("SNAPSHOT_JSON", invalid);
        }
    }

    private static void validWorkId(String value) {
        if (value == null || !value.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("INVALID_WORK_ID");
    }

    private static String zemaResponse(String status, String code, String workId) {
        try {
            JSONObject response = new JSONObject();
            response.put("status", status);
            response.put("code", code == null ? JSONObject.NULL : code);
            response.put("workId", workId == null ? JSONObject.NULL : workId);
            String result = response.toString();
            Engine.bounded(result);
            return result;
        } catch (JSONException invalid) {
            throw new IllegalStateException("ZEMA_RESPONSE_JSON", invalid);
        }
    }
}
