package dev.rock.automation;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Versioned, task/capability/resource policy; rankings are hypotheses, not universal benchmarks. */
final class ModelSelectionPolicy {
    static final String VERSION = "pixel-local-work-model-choice/4";
    static final class Candidate {
        final String id; final boolean cached, licensed, fits; final Set<String> tasks; final int priority;
        Candidate(String id, boolean cached, boolean licensed, boolean fits) {
            this(id, cached, licensed, fits, Set.of("article"), "dev.rock.qwen25-15b-q4km".equals(id) ? 50 : 0);
        }
        Candidate(String id, boolean cached, boolean licensed, boolean fits, Set<String> tasks, int priority) {
            this.id = id; this.cached = cached; this.licensed = licensed; this.fits = fits; this.tasks = tasks; this.priority = priority;
        }
        boolean available() { return cached && licensed && fits; }
    }
    static String task(String prompt) {
        if (prompt == null || prompt.isBlank() || prompt.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8000)
            throw new IllegalArgumentException("INVALID_ZEMA_REQUEST");
        String p = prompt.toLowerCase(Locale.ROOT);
        if (p.matches("(?s).*(アイデア|ideas|brainstorm).*")) return "planning";
        if (p.matches("(?s).*(要約|要点|summari[sz]e|summary).*")) return "summary";
        if (p.matches("(?s).*(翻訳|英語に|日本語に|translate|translation).*")) return "translation";
        if (p.matches("(?s).*(コード|プログラム|関数|実装|バグ|python|javascript|typescript|\\bcode\\b|coding|debug).*")) return "code";
        if (p.matches("(?s).*(記事|原稿|blog|article).*")) return "article";
        if (p.matches("(?s).*(計画|手順|予定|plan|checklist).*")) return "planning";
        return "writing";
    }
    static String select(String choice, String prompt, List<Candidate> candidates) {
        return selectTask(choice,task(prompt),candidates);
    }
    static String selectTask(String choice,String task,List<Candidate> candidates) {
        if(!dev.rock.sdk.LocalWorkDraft.TASKS.contains(task))throw new IllegalArgumentException("INVALID_TASK");
        if ("auto".equals(choice)) {
            Candidate best = null;
            for (Candidate candidate : candidates) if (candidate.available() && candidate.priority > 0 && candidate.tasks.contains(task)
                && (best == null || candidate.priority > best.priority || candidate.priority == best.priority && candidate.id.compareTo(best.id) < 0)) best = candidate;
            if (best == null) throw new IllegalStateException("NO_SUITABLE_INSTALLED_MODEL");
            return best.id;
        }
        for (Candidate candidate : candidates) if (candidate.id.equals(choice)) {
            if (!candidate.available()) throw new IllegalStateException("SELECTED_MODEL_SETUP_REQUIRED"); return candidate.id;
        }
        throw new IllegalArgumentException("MODEL_NOT_IN_TRUSTED_CATALOG");
    }
}
