package dev.rock.automation;

import android.content.Context;
import dev.rock.core.AgentToolChain;
import dev.rock.core.Engine;
import dev.rock.sdk.AgentToolPayload;
import org.json.JSONObject;

/** Rechecks the immutable owner-admitted recipe before every Tool-chain dispatch. */
final class SkyAgentExecution {
    static JSONObject recipe(Context context,Engine engine,Engine.Ticket ticket) throws Exception {
        boolean adapter=AgentToolChain.INPUT.equals(ticket.tool)||AgentToolChain.SEAL.equals(ticket.tool);
        JSONObject input;
        try {input=new JSONObject(engine.initialInput(ticket.workId));}
        catch(org.json.JSONException invalid){if(adapter)throw invalid;return null;}
        if(!input.has("agentProvenance")) {
            if(adapter)throw new SecurityException("AGENT_TOOL_PROVENANCE_REQUIRED");
            return null;
        }
        if(!SkyAddonStore.validWorkInput(input))throw new SecurityException("AGENT_TOOL_PROVENANCE_INVALID");
        JSONObject provenance=input.getJSONObject("agentProvenance"),recipe=provenance.getJSONObject("recipe");
        if(!"local-tools/1".equals(recipe.getString("runner"))) {
            if(adapter)throw new SecurityException("AGENT_TOOL_PROVENANCE_REQUIRED");
            return null;
        }
        // Revoke blocks pending Tool steps; existing artifacts stay in the Engine.
        new SkyAddonStore(context).agentFor(provenance.getString("addonDigest"));
        String[] stages=AgentToolChain.stages(AgentToolPayload.operations(recipe));
        if(ticket.step<0||ticket.step>=stages.length||!ticket.tool.equals(stages[ticket.step]))
            throw new SecurityException("AGENT_TOOL_STAGE_CHANGED");
        return recipe;
    }
    static void finish(Context context,Engine engine,Engine.Ticket ticket,String outcome,String output,String boot,long elapsed) {
        synchronized(SkyAddonStore.LOCK) {
            try {recipe(context,engine,ticket);}
            catch(Exception invalid){engine.hold(ticket,"AGENT_TOOL_AUTHORITY_INVALID");return;}
            engine.finish(ticket,outcome,output,boot,elapsed);
        }
    }

}
