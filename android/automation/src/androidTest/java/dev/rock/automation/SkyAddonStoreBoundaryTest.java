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
        JSONObject entry=root.getJSONArray("models").getJSONObject(0),profile=entry.getJSONObject("profile");
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
}
