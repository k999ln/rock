package dev.rock.automation;

import android.app.ActivityManager;
import android.content.Context;
import dev.rock.core.platform.ModelProfileManifest;
import dev.rock.core.platform.PlatformStore;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Preparation is read-only; a selected cached model loads only after explicit execution consent. */
final class LocalModelChoice {
    private final Context context;
    private final PlatformStore platform;
    LocalModelChoice(Context context, PlatformStore platform) { this.context = context; this.platform = platform; }

    static boolean accepted(Context context, ModelProfileManifest profile) {
        try {
            String receipt = context.getSharedPreferences("local-model-license", Context.MODE_PRIVATE).getString(profile.digest(), null);
            if (receipt == null) return false;
            JSONObject value = new JSONObject(receipt);
            return AndroidOwner.current(context).equals(value.getString("owner"))
                && profile.digest().equals(value.getString("profileDigest")) && profile.licenseId.equals(value.getString("licenseId"))
                && value.getLong("acceptedAt") > 0;
        } catch (Exception invalid) { return false; }
    }
    static boolean cached(Context context, ModelProfileManifest profile) {
        try {
            java.nio.file.Path root = new java.io.File(context.getNoBackupFilesDir(), "verified-models").toPath();
            java.nio.file.Path folder = root.resolve(profile.profileId + "-" + profile.version + "-" + profile.digest());
            java.nio.file.Path file = folder.resolve(profile.weightsSha256 + ".gguf");
            return !Files.isSymbolicLink(root) && !Files.isSymbolicLink(folder)
                && Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) && Files.size(file) == profile.artifactBytes;
        } catch (Exception unavailable) { return false; }
    }
    String prepare(String choice, String prompt) throws Exception {
        dev.rock.sdk.LocalWorkDraft.prompt(ModelSelectionPolicy.task(prompt), prompt);
        int ideas = dev.rock.sdk.LocalIdeaBatch.requestedCount(prompt);
        LocalModelCatalog catalog = new LocalModelInstaller(context, platform).catalog();
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo(); context.getSystemService(ActivityManager.class).getMemoryInfo(memory);
        List<ModelSelectionPolicy.Candidate> candidates = new ArrayList<>();
        for (LocalModelCatalog.Entry entry : catalog.entries.values()) candidates.add(new ModelSelectionPolicy.Candidate(entry.profile.profileId,
            cached(context, entry.profile), accepted(context, entry.profile), !memory.lowMemory && memory.totalMem >= entry.profile.minRamBytes, entry.tasks, entry.autoPriority));
        String id = ModelSelectionPolicy.select(choice, prompt, candidates);
        LocalModelCatalog.Entry entry = catalog.require(id);
        return new JSONObject().put("status", "prepared").put("profileId", id).put("manifestDigest", entry.profile.digest())
            .put("name", entry.name).put("choice", choice).put("policyVersion", ModelSelectionPolicy.VERSION)
            .put("ideaTarget", ideas).put("task", ModelSelectionPolicy.task(prompt)).put("reason", "auto".equals(choice)
                ? "作業の種類、対応能力、導入・同意・端末資源を照合して選びました。世界全体の性能順位や内容品質の保証ではありません。"
                : "指定したモデルを固定しました。別モデルへ自動で切り替えません。")
            .put("warning", "dev.rock.qwen25-15b-q4km".equals(id)&&java.util.Set.of("planning","writing").contains(ModelSelectionPolicy.task(prompt)) ? "1.5Bは発想の内容品質試験に不合格です。指定を優先しますが、作業に合う上位モデルを推奨します。" : "dev.rock.qwen3-06b-q8".equals(id) ? "0.6Bは文章品質の試験に不合格。診断用の明示選択です。" : entry.tasks.contains(ModelSelectionPolicy.task(prompt)) ? "生成内容は確認して利用してください。外部操作やコード実行は行いません。" : "このモデルと作業の組合せは未検証です。指定を優先します。")
            .put("executionStarted", false).put("network", false).toString();
    }
    LocalModelCatalog.Entry requireDigest(String digest) throws Exception {
        if (digest == null || !digest.matches("[a-f0-9]{64}")) throw new SecurityException("MODEL_SELECTION_REQUIRED");
        for (LocalModelCatalog.Entry entry : new LocalModelInstaller(context, platform).catalog().entries.values())
            if (entry.profile.digest().equals(digest)) return entry;
        throw new SecurityException("MODEL_SELECTION_CHANGED");
    }
    void ensureLoaded(String digest) throws Exception {
        LocalModelCatalog.Entry selected = requireDigest(digest);
        if (!accepted(context, selected.profile) || !cached(context, selected.profile)) throw new SecurityException("MODEL_SELECTION_SETUP_REQUIRED");
        ModelProfileManifest active = platform.activeModelProfile();
        LocalAiConnection runtime = new LocalAiConnection(context);
        String signer = runtime.trustedInstalledSigningDigest();
        if (active != null && active.digest().equals(digest)) {
            try { runtime.requireReadyForProfile(selected.profile, signer); return; }
            catch (SecurityException stateChanged) {
                if (!"MODEL_PROFILE_RUNTIME_MISMATCH".equals(stateChanged.getMessage())) throw stateChanged;
            }
        }
        // Reuses owner-scoped, exact-license consent and the original activation/pin/resource gates.
        new LocalModelInstaller(context, platform).reloadAccepted(selected.profile.profileId);
    }
}
