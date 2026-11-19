package dev.rock.shell;

import android.content.Context;
import org.json.JSONObject;

/** Captured native account. The credential never enters the journal or guest frames. */
final class EvePortableAccountBinding implements EvePortableController.Account, EvePortableAgentPreparation.Account {
    private final Context context;
    final String origin,owner,stopSessionHash;
    private final String authorization;
    private final EvePortableHttpClient client;
    EvePortableAccountBinding(Context c)throws Exception{
        context=c.getApplicationContext();origin=EveAccountSync.endpoint(context);
        EveAccountSessionStore store=new EveAccountSessionStore(context,origin);owner=store.ownerUserId();authorization=store.authorizationHeader();
        EvePortableCommands.require(EvePortableCommands.owner(owner)&&authorization!=null);check();
        stopSessionHash=EvePortableCommands.sha(origin+"\n"+owner+"\n"+authorization);
        client=new EvePortableHttpClient(origin,authorization,new EvePortableHttpClient.Guard(){
            public void check()throws Exception{EvePortableAccountBinding.this.check();}
            public void unauthorized()throws Exception{new EveAccountSessionStore(context,origin).clearIfAuthorizationMatches(authorization);}
        });
    }
    void check()throws Exception{
        if(!origin.equals(EveAccountSync.endpoint(context)))throw new EvePortableController.Stopped();
        EveAccountSessionStore store=new EveAccountSessionStore(context,origin);
        if(!owner.equals(store.ownerUserId())||!authorization.equals(store.authorizationHeader()))throw new EvePortableController.Stopped();
    }
    boolean active(){try{check();return true;}catch(Exception unavailable){return false;}}
    String cacheKey()throws Exception{return "portable_device_"+EvePortableCommands.sha(origin+"\n"+owner+"\n"+authorization);}
    public JSONObject preparations()throws Exception{return client.preparations();}
    public JSONObject inspect()throws Exception{return client.inspect();}
    public JSONObject put(JSONObject body)throws Exception{return client.put(body);}
    public JSONObject read(String id)throws Exception{return client.read(id);}
}
