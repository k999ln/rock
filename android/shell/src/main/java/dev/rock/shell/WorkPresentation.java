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
    static String stageLabel(String tool) {
        switch (tool) {
            case "citations@1": return "出典を整理";
            case "free-article@1": return "記事を整える";
            case "local-generate@1": return "下書きを生成";
            case "local-text-validate@1": return "下書きの形式を確認";
            case "local-text-seal@1": return "成果物を保存";
            case "local-ideas-generate@1": return "次のアイデアを生成・保存";
            case "local-ideas-seal@1": return "全件を確認して成果物を保存";
            default: return "工程を確認";
        }
    }
    static String issue(String code) {
        if ("LOCAL_GENERATION_TIMED_OUT".equals(code)) return "生成に時間がかかったため停止しました。保存済みの内容は残っています。止まった工程から再試行できます。";
        if (java.util.Set.of("IDEA_BATCH_COUNT_MISMATCH", "IDEA_NUMBER_MISMATCH", "DUPLICATE_OR_INVALID_IDEA").contains(code))
            return "今回の案に件数・番号・重複の問題があり、保存前に停止しました。保存済みの案を残して、この工程を再試行できます。";
        if (code.startsWith("MODEL_PROFILE") || "LOCAL_AI_NOT_READY".equals(code))
            return "この仕事に固定したモデルを確認できません。保存済みの内容は残っています。モデルの接続を確認してください。";
        return "この工程を進められませんでした。保存済みの内容を残して停止しています。接続を確認して再試行できます。";
    }
    static boolean matches(String filter, String state) {
        if ("review".equals(filter)) return "review".equals(state);
        if ("active".equals(filter)) return "active".equals(state);
        if ("history".equals(filter)) return "completed".equals(state) || "cancelled".equals(state);
        return true;
    }
}
