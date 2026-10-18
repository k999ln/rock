package dev.rock.core;

import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;

/** Supported pure Tool adapters, not an author/Agent allowlist or shell execution API. */
public final class AgentToolChain {
    public static final String RECIPE = "sky-agent-tools@1";
    public static final String INPUT = "agent-tool-input@1", SEAL = "agent-tool-seal@1";
    private AgentToolChain() { }
    public static String[] stages(List<String> tools) {
        if (tools == null || tools.isEmpty() || tools.size() > 2 || new HashSet<>(tools).size() != tools.size())
            throw new IllegalArgumentException("AGENT_TOOLS_UNSUPPORTED");
        for (int i=0;i<tools.size();i++) {
            String tool=tools.get(i);
            if (!("citations@1".equals(tool) || "free-article@1".equals(tool))
                    || ("free-article@1".equals(tool) && i != tools.size()-1))
                throw new IllegalArgumentException("AGENT_TOOLS_UNSUPPORTED");
        }
        List<String> stages=new ArrayList<>();stages.add("local-generate@1");stages.add(INPUT);
        stages.addAll(tools);stages.add(SEAL);return stages.toArray(new String[0]);
    }
}
