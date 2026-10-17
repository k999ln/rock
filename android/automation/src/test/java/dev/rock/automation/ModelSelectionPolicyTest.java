package dev.rock.automation;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;
public final class ModelSelectionPolicyTest {
    private final String large = "dev.rock.qwen25-15b-q4km", small = "dev.rock.qwen3-06b-q8";
    private ModelSelectionPolicy.Candidate ready(String id) { return new ModelSelectionPolicy.Candidate(id, true, true, true); }
    private void denied(String code, String choice, String prompt, List<ModelSelectionPolicy.Candidate> models) {
        try { ModelSelectionPolicy.select(choice, prompt, models); fail("must refuse"); }
        catch (IllegalArgumentException | IllegalStateException expected) { assertEquals(code, expected.getMessage()); }
    }
    @Test public void automaticSelectsTaskCompatibleLargerModelRegardlessOfListOrder() {
        assertEquals(large, ModelSelectionPolicy.select("auto", "記事の下書き", List.of(ready(small), ready(large))));
        denied("NO_SUITABLE_INSTALLED_MODEL", "auto", "write article", List.of(ready(small)));
    }
    @Test public void autoDoesNotUseMissingConsentCacheOrResources() {
        for (int i = 0; i < 3; i++) denied("NO_SUITABLE_INSTALLED_MODEL", "auto", "article", List.of(
            new ModelSelectionPolicy.Candidate(large, i != 0, i != 1, i != 2), ready(small)));
    }
    @Test public void manualChoiceIsExactAndUnknownOrUnavailableCannotFallBack() {
        assertEquals(small, ModelSelectionPolicy.select(small, "draft article", List.of(ready(large), ready(small))));
        denied("MODEL_NOT_IN_TRUSTED_CATALOG", "github/unknown", "article", List.of(ready(large)));
        denied("SELECTED_MODEL_SETUP_REQUIRED", small, "article", List.of(ready(large), new ModelSelectionPolicy.Candidate(small, false, true, true)));
    }
    @Test public void unsupportedAndOversizeRequestsDoNotBecomeGeneralAgentWork() {
        denied("TASK_REQUIRES_OTHER_CAPABILITY", "auto", "deploy a server", List.of(ready(large)));
        denied("INVALID_ZEMA_REQUEST", "auto", "記事".repeat(2000), List.of(ready(large)));
        denied("INVALID_ZEMA_REQUEST", "auto", " ", List.of(ready(large)));
    }
}
