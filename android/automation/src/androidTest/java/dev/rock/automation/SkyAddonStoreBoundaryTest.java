package dev.rock.automation;
import android.content.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Isolated Android durable-admission tests, never touching the owner's real add-on store. */
@RunWith(AndroidJUnit4.class)
public final class SkyAddonStoreBoundaryTest {
    Context context;SharedPreferences prefs;SkyAddonStore store;
    @Before public void setup(){Context base=InstrumentationRegistry.getInstrumentation().getTargetContext();prefs=base.getSharedPreferences("isolated-sky-admission-"+java.util.UUID.randomUUID(),Context.MODE_PRIVATE);
        context=new ContextWrapper(base){@Override public SharedPreferences getSharedPreferences(String ignored,int mode){return prefs;}};store=new SkyAddonStore(context);}
    JSONObject definition()throws Exception{return SkyAddonStore.agent(new JSONObject().put("schema","rock-sky-agent/1").put("id","test.other.agent").put("version",1).put("name","Test Agent").put("instructions","Write a short useful note.").put("task","writing").put("licenseId","MIT").put("permissions",new JSONArray()).put("runner","local-text/1"),"https://github.com/test/repo/blob/"+"a".repeat(40)+"/sky-addon.json");}
    @After public void cleanup(){prefs.edit().clear().commit();}
    @Test public void exactDigestConsentOwnerExpiryAndImmutableContentAreEnforced()throws Exception {
        JSONObject proposal=new JSONObject(store.propose(definition()));String id=proposal.getString("proposalId"),digest=proposal.getString("digest");
        assertThrows(SecurityException.class,()->store.add(id,digest,false));assertThrows(SecurityException.class,()->store.add(id,"0".repeat(64),true));
        JSONObject wrongOwner=new JSONObject(prefs.getString("proposal",""));wrongOwner.put("owner","android-user:other");prefs.edit().putString("proposal",wrongOwner.toString()).commit();
        assertThrows(SecurityException.class,()->store.add(id,digest,true));
        wrongOwner.put("owner",AndroidOwner.current(context)).put("expiresAt",1);prefs.edit().putString("proposal",wrongOwner.toString()).commit();assertThrows(SecurityException.class,()->store.add(id,digest,true));
        proposal=new JSONObject(store.propose(definition()));assertEquals("added",new JSONObject(store.add(proposal.getString("proposalId"),digest,true)).getString("status"));assertNotNull(store.require(digest));
        JSONObject changed=definition().put("instructions","changed without version change");JSONObject update=new JSONObject(store.propose(changed));
        assertThrows(SecurityException.class,()->store.add(update.getString("proposalId"),update.getString("digest"),true));
    }
    @Test public void revocationAndStoredOwnerOrContentMutationFailClosed()throws Exception {
        JSONObject p=new JSONObject(store.propose(definition()));String digest=p.getString("digest");store.add(p.getString("proposalId"),digest,true);
        JSONObject original=new JSONObject(prefs.getString("records","{}")),bad=new JSONObject(original.toString());String key=SkyAddonStore.keys(bad).iterator().next();bad.getJSONObject(key).put("owner","other");prefs.edit().putString("records",bad.toString()).commit();assertThrows(SecurityException.class,()->store.require(digest));
        bad=new JSONObject(original.toString());bad.getJSONObject(key).getJSONObject("definition").put("instructions","tampered");prefs.edit().putString("records",bad.toString()).commit();assertThrows(SecurityException.class,()->store.require(digest));
        prefs.edit().putString("records",original.toString()).commit();assertEquals("revoked",new JSONObject(store.revoke(digest,true)).getString("status"));assertThrows(SecurityException.class,()->store.require(digest));
        assertEquals(1,new JSONObject(store.list()).getJSONArray("addons").length());
        JSONObject again=new JSONObject(store.propose(definition()));assertEquals("added",new JSONObject(store.add(again.getString("proposalId"),digest,true)).getString("status"));
        assertNotNull(store.require(digest));assertEquals(2,new JSONObject(store.list()).getJSONArray("addons").getJSONObject(0).getInt("admissionCount"));
    }
    @Test public void automaticParticipationNeedsExactOwnerModelTaskTrialAndConsent()throws Exception {
        JSONObject root;try(java.io.InputStream in=context.getAssets().open(LocalModelCatalog.ASSET)){root=new JSONObject(new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));}
        JSONObject entry=new JSONObject(root.getJSONArray("models").getJSONObject(0).toString()),profile=entry.getJSONObject("profile");
        profile.put("profileId","sky.model.synthetic").put("publisherId","owner-pin:"+dev.rock.core.Engine.digest(AndroidOwner.current(context))).put("signingKeyId","owner-consent").put("manifestSignatureBase64Url","");
        JSONObject d=new JSONObject().put("kind","model").put("id","sky.model.synthetic").put("entry",entry);
        JSONObject p=new JSONObject(store.propose(d));String digest=p.getString("digest");store.add(p.getString("proposalId"),digest,true);
        assertThrows(SecurityException.class,()->store.configureAutomatic(digest,0,"[\"code\"]",true));
        String exact=new LocalModelCatalog.Entry(entry).profile.digest();store.recordTrial(exact,"summary","synthetic","a".repeat(64),true);
        assertThrows(SecurityException.class,()->store.configureAutomatic(digest,0,"[\"code\"]",true));
        store.recordTrial(exact,"code","synthetic","a".repeat(64),true);
        assertThrows(SecurityException.class,()->store.configureAutomatic(digest,0,"[\"code\"]",false));
        assertEquals("configured",new JSONObject(store.configureAutomatic(digest,0,"[\"code\"]",true)).getString("status"));
        assertThrows(IllegalStateException.class,()->store.configureAutomatic(digest,0,"[\"code\"]",true));
        LocalModelCatalog catalog=store.catalog(new LocalModelCatalog(root.toString()));assertEquals(60,catalog.require("sky.model.synthetic").autoPriority);
        store.recordTrial(exact,"code","synthetic","b".repeat(64),false);
        assertEquals(0,store.catalog(new LocalModelCatalog(root.toString())).require("sky.model.synthetic").autoPriority);
    }
    @Test public void versionedToolAgentRequiresExactPureAdaptersAndUnchangedProvenance()throws Exception {
        JSONObject raw=new JSONObject().put("schema","rock-sky-agent/2").put("id","test.other.document").put("version",1).put("name","Document Agent")
            .put("instructions","Write a short document.").put("task","article").put("licenseId","MIT").put("permissions",new JSONArray()).put("runner","local-tools/1")
            .put("tools",new JSONArray().put("citations@1").put("free-article@1"));
        String source="https://github.com/test/repo/blob/"+"a".repeat(40)+"/document.json";
        JSONObject d=SkyAddonStore.agent(raw,source),p=new JSONObject(store.propose(d));String digest=p.getString("digest");
        assertThrows(SecurityException.class,()->store.add(p.getString("proposalId"),digest,false));store.add(p.getString("proposalId"),digest,true);
        JSONObject provenance=new JSONObject().put("schema","rock-sky-agent-use/1").put("addonDigest",digest).put("source",source).put("request","a document").put("recipe",raw);
        String rendered=SkyAddonStore.render(d,"a document");JSONObject input=new JSONObject().put("task","article").put("request",rendered)
            .put("prompt",dev.rock.sdk.LocalWorkDraft.prompt("article",rendered)).put("agentProvenance",provenance);
        assertTrue(SkyAddonStore.validWorkInput(input));
        JSONObject changed=new JSONObject(input.toString());changed.getJSONObject("agentProvenance").getJSONObject("recipe").put("tools",new JSONArray().put("citations@1"));assertFalse(SkyAddonStore.validWorkInput(changed));
        for(JSONArray bad:new JSONArray[]{new JSONArray(),new JSONArray().put("shell@1"),new JSONArray().put("wallet.transfer@1"),new JSONArray().put("free-article@1").put("citations@1")})
            assertThrows(Exception.class,()->SkyAddonStore.agent(new JSONObject(raw.toString()).put("tools",bad),source));
        assertThrows(SecurityException.class,()->SkyAddonStore.agent(new JSONObject(raw.toString()).put("permissions",new JSONArray().put("network")),source));
        assertThrows(SecurityException.class,()->SkyAddonStore.agent(new JSONObject(raw.toString()).put("schema","rock-sky-agent/1"),source));
        store.revoke(digest,true);assertThrows(SecurityException.class,()->store.agentFor(digest));
    }

    @Test public void revocationBetweenDispatchAndCommitHoldsWithoutSavingTheLateResult()throws Exception {
        JSONObject raw=new JSONObject().put("schema","rock-sky-agent/2").put("id","test.other.late").put("version",1).put("name","Late Agent")
            .put("instructions","Write a document.").put("task","article").put("licenseId","MIT").put("permissions",new JSONArray()).put("runner","local-tools/1").put("tools",new JSONArray().put("citations@1"));
        String source="https://github.com/test/repo/blob/"+"b".repeat(40)+"/late.json";
        JSONObject d=SkyAddonStore.agent(raw,source),proposal=new JSONObject(store.propose(d));String digest=proposal.getString("digest");store.add(proposal.getString("proposalId"),digest,true);
        java.io.File file=new java.io.File(context.getCacheDir(),"agent-boundary-"+java.util.UUID.randomUUID()+".db");
        Context isolated=new ContextWrapper(context){@Override public java.io.File getDatabasePath(String ignored){return file;}};
        AndroidDatabase db=new AndroidDatabase(isolated);
        try {
            dev.rock.core.Engine engine=new dev.rock.core.Engine(db);dev.rock.core.platform.PlatformStore platform=new dev.rock.core.platform.PlatformStore(db);String signer="a".repeat(64);
            dev.rock.core.platform.ComponentManifest component=new dev.rock.core.platform.ComponentManifest(dev.rock.core.platform.ComponentManifest.Kind.TOOL,"org.rockstar.runtime.localai","org.rockstar.runtime.localai",1,1,1,12003,"rock_tool_app",signer,java.util.List.of("local-ai.inference"),1,1);
            platform.register("fixture:runtime",component,1);platform.activate(component.componentId,1,false,2);
            platform.registerRuntimeManifest(new dev.rock.core.platform.RuntimeManifest(component.componentId,1,signer,1,1,java.util.List.of("GGUF"),java.util.List.of("local-work@1/output-v1")));
            dev.rock.core.platform.ModelProfileManifest profile=new dev.rock.core.platform.ModelProfileManifest("fixture.agent.model",1,signer,signer,signer,"MIT","fixture.publisher","fixture.key","A".repeat(86),component.componentId,1,1,1,"GGUF","Q4_K_M",2048,"local-work@1/output-v1",1000,2000);
            platform.registerModelProfile(profile);platform.activateModelProfile(profile.profileId,1,c->signer,3);
            String owner=AndroidOwner.current(context),request="fixture-request",rendered=SkyAddonStore.render(d,request);
            JSONObject provenance=new JSONObject().put("schema","rock-sky-agent-use/1").put("addonDigest",digest).put("source",source).put("request",request).put("recipe",raw);
            String input=new JSONObject().put("task","article").put("request",rendered).put("prompt",dev.rock.sdk.LocalWorkDraft.prompt("article",rendered)).put("agentProvenance",provenance).toString();
            dev.rock.core.Engine.ModelProfilePin pin=engine.prepareModelProfilePin(owner,"fixture-agent",signer,4);
            String id=engine.submitPinnedAgentTools(pin,"fixture-agent",input,java.util.List.of("citations@1"),true);
            dev.rock.core.Engine.Ticket ticket=engine.claim("fixture-boot",10,true);assertNotNull(SkyAgentExecution.recipe(context,engine,ticket));
            store.revoke(digest,true);SkyAgentExecution.finish(context,engine,ticket,"passed","synthetic late callback","fixture-boot",20);
            assertEquals("needs_review",engine.runs(id).get(0).get("state"));assertNull(engine.runs(id).get(0).get("output_digest"));
            assertEquals("AGENT_TOOL_AUTHORITY_INVALID",engine.runs(id).get(0).get("error"));assertEquals(input,engine.checkpoint(id));assertNull(engine.claim("fixture-boot",30,true));
            byte[] backup=platform.exportRecoverableState(owner);java.io.File restoredFile=new java.io.File(context.getCacheDir(),"agent-restore-"+java.util.UUID.randomUUID()+".db");
            Context restoreContext=new ContextWrapper(context){@Override public java.io.File getDatabasePath(String ignored){return restoredFile;}};
            try(AndroidDatabase restoredDb=new AndroidDatabase(restoreContext)){
                dev.rock.core.Engine restored=new dev.rock.core.Engine(restoredDb);new dev.rock.core.platform.PlatformStore(restoredDb).restoreRecoverableState(backup,owner,1000);
                assertTrue(restored.paused());assertEquals(input,restored.checkpoint(id));assertEquals(4,restored.runs(id).size());assertEquals("needs_review",restored.runs(id).get(0).get("state"));
            }finally{restoredFile.delete();new java.io.File(restoredFile+"-wal").delete();new java.io.File(restoredFile+"-shm").delete();}

        }finally{db.close();file.delete();new java.io.File(file+"-wal").delete();new java.io.File(file+"-shm").delete();}
    }

}
