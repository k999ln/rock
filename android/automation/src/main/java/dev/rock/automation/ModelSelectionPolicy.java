package dev.rock.automation;

import java.util.List;
import java.util.Locale;

/** Versioned capability policy, not a claim of universal benchmark superiority. */
final class ModelSelectionPolicy {
    static final String VERSION = "pixel-article-model-choice/1";
    static final class Candidate {
        final String id; final boolean cached, licensed, fits;
        Candidate(String id, boolean cached, boolean licensed, boolean fits) {
            this.id = id; this.cached = cached; this.licensed = licensed; this.fits = fits;
        }
        boolean available() { return cached && licensed && fits; }
    }
    static String select(String choice, String prompt, List<Candidate> candidates) {
        if (prompt == null || prompt.trim().isEmpty() || prompt.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 8_000) throw new IllegalArgumentException("INVALID_ZEMA_REQUEST");
        String text = prompt.toLowerCase(Locale.ROOT);
        if (!text.matches("(?s).*(記事|原稿|文章|下書き|article|draft|blog|writing).*"))
            throw new IllegalArgumentException("TASK_REQUIRES_OTHER_CAPABILITY");
        if ("auto".equals(choice)) {
            // 0.6B failed content trials. It remains an explicit diagnostic choice, never an auto fallback.
            for (Candidate candidate : candidates)
                if ("dev.rock.qwen25-15b-q4km".equals(candidate.id) && candidate.available()) return candidate.id;
            throw new IllegalStateException("NO_SUITABLE_INSTALLED_MODEL");
        }
        for (Candidate candidate : candidates) if (candidate.id.equals(choice)) {
            if (!candidate.available()) throw new IllegalStateException("SELECTED_MODEL_SETUP_REQUIRED");
            return candidate.id;
        }
        throw new IllegalArgumentException("MODEL_NOT_IN_TRUSTED_CATALOG");
    }
}
