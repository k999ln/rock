package dev.rock.shell;

import org.junit.Test;
import static org.junit.Assert.*;

public final class WorkPresentationTest {
    @Test public void incompleteReviewIsAnIssueInsteadOfACompletedArtifact() {
        assertEquals("対応が必要", WorkPresentation.state("review", true, false));
        assertEquals("あなたの確認待ち", WorkPresentation.state("review", false, false));
        assertEquals("一時停止中", WorkPresentation.state("active", false, true));
    }
    @Test public void attentionIsSortedBeforeOldHistoryAndRunningWork() {
        assertTrue(WorkPresentation.priority("review", false) < WorkPresentation.priority("active", false));
        assertTrue(WorkPresentation.priority("active", true) < WorkPresentation.priority("completed", false));
        assertTrue(WorkPresentation.matches("history", "cancelled"));
        assertFalse(WorkPresentation.matches("active", "review"));
        assertFalse(WorkPresentation.matches("history", "active"));
    }
    @Test public void notificationIdentityCannotContainCommandsOrOtherSchemes() {
        assertTrue(WorkPresentation.validId("2bfefd11-a0a9-358f-8262-216b13f52d6d"));
        for (String invalid : new String[]{null, "", "https://example.test", "../../file", "approve;job", "2bfefd11-a0a9-358f-8262-216b13f52d6d/approve"})
            assertFalse(WorkPresentation.validId(invalid));
    }
}
