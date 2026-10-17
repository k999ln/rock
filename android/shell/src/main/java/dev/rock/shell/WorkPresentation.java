package dev.rock.shell;

/** Presentation only. The Broker remains the authority for every action. */
final class WorkPresentation {
    static boolean validId(String value) {
        return value != null && value.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}");
    }
    static String state(String state, boolean failed, boolean paused) {
        if ("completed".equals(state)) return "完了";
        if ("cancelled".equals(state)) return "中止";
        if (failed || "failed".equals(state)) return "対応が必要";
        if ("review".equals(state)) return "あなたの確認待ち";
        if ("active".equals(state)) return paused ? "一時停止中" : "進行中";
        return "待機中";
    }
    static int priority(String state, boolean failed) {
        if ("review".equals(state)) return 0;
        if ("active".equals(state)) return failed ? 1 : 2;
        return 3;
    }
    static boolean matches(String filter, String state) {
        if ("review".equals(filter)) return "review".equals(state);
        if ("active".equals(filter)) return "active".equals(state);
        if ("history".equals(filter)) return "completed".equals(state) || "cancelled".equals(state);
        return true;
    }
}
