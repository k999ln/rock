package dev.rock.shell;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

/** Owner preview entry. Browser authentication stays in the browser; no cookie/token bridge. */
public final class RockstarOsActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextView status, cacheStatus;
    private Button cacheInspect, cachePrepare, cacheCancel, cacheRead;
    private JSONObject cacheInventory, cacheOperation;
    private String cacheSession="";
    private boolean cacheBusy, destroyed, visible;
    private boolean settingsScreen;
    private long cachePollUntil;

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            status.setText(EvePixelHostService.notice());
            if(!cacheSession.isEmpty()&&!EvePortableAccountSync.cacheSessionCurrent(RockstarOsActivity.this,cacheSession)){
                cacheInventory=null;cacheOperation=null;cacheSession="";
                cacheStatus.setText("アカウント接続が変わりました。前の選択は破棄しました。もう一度照合・確認してください。");cacheControls();
            }
            main.postDelayed(this, 1500);
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        settingsScreen = getIntent().getBooleanExtra("deviceSettings", false);
        int ink = Color.rgb(21, 21, 21), paper = Color.WHITE;
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(paper);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(body);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.company_mark);
        mark.setContentDescription("RockstarOS 虹色ロゴ");
        header.addView(mark, new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView title = new TextView(this);
        title.setText(settingsScreen ? "端末の設定" : "RockstarOS");
        title.setTextSize(20); title.setTextColor(ink);
        title.setPadding(dp(10), 0, 0, 0);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(56), 1));
        title.setGravity(Gravity.CENTER_VERTICAL);
        body.addView(header);
        status = new TextView(this);
        cacheStatus = new TextView(this);
        if (!settingsScreen) {
            section(body, "Eveで、仕事を進める");
            TextView intro = new TextView(this);
            intro.setText("依頼、進捗、成果を同じEveで。端末の接続や診断は設定で確認できます。");
            intro.setTextColor(Color.rgb(89, 89, 89)); intro.setTextSize(16);
            intro.setPadding(0, dp(8), 0, dp(24)); body.addView(intro);
            button(body, "Eveを開く", () -> open("/os/eve"));
            button(body, "端末の設定", () -> startActivity(new Intent(this, RockstarOsActivity.class).putExtra("deviceSettings", true)));
            body.addView(status);
        } else {
            button(body, "Eveへ戻る", () -> open("/os/eve"));
            button(body, "Noahを開く", () -> open("/#timeline"));
            button(body, "コミュニティーを開く", () -> open("/#communities"));
            button(body, "Webの設定", () -> open("/settings"));
            section(body, "接続と同期");
        status.setTextSize(15); status.setTextColor(ink);
        status.setPadding(0, dp(24), 0, dp(12)); body.addView(status);
        button(body, "このPixelの同期を開始", this::startHost);
        button(body, "このPixelの同期を止める", () -> {
            stopService(new Intent(this, EvePixelHostService.class));
            status.setText(EvePixelHostService.notice());
            if(!cacheSession.isEmpty()&&!EvePortableAccountSync.cacheSessionCurrent(RockstarOsActivity.this,cacheSession)){
                cacheInventory=null;cacheOperation=null;cacheSession="";
                cacheStatus.setText("アカウント接続が変わりました。前の選択は破棄しました。もう一度照合・確認してください。");cacheControls();
            }
        });
        section(body, "端末内AIの準備");
        cacheStatus.setTextSize(14); cacheStatus.setTextColor(ink);
        cacheStatus.setText("担当が使う保存済みAIを選んで準備します。同期は自動で一時停止し、準備完了後に再開します。取得や推論は行いません。");
        body.addView(cacheStatus);
        cacheInspect = cacheButton(body, "担当のAIを照合して選ぶ", this::inspectCachedModels);
        cachePrepare = cacheButton(body, "照合したAIを準備する", this::chooseCachedModel);
        cacheCancel = cacheButton(body, "このAI準備だけを停止する", () -> cacheAction("cancel", cacheOperation));
        cacheRead = cacheButton(body, "AI準備の状態を再照会する", () -> cacheAction("status", cacheStatusSelection()));
        cacheControls();
        section(body, "アカウントと診断");
        TextView limit = new TextView(this);
        limit.setText("本人用Developer Preview · 30分での自動停止はありません。ロック中は保留し、解除後に再確認します。Androidの時間制限で停止した場合は、この画面で再開できます。Terminalは戻るで終了せず、アプリ切替でEveへ移動してください。同期停止とLinuxの仕事の停止は別です。仕事の停止はEveで確認してください。");
        limit.setTextSize(13); limit.setTextColor(ink); limit.setPadding(0, dp(12), 0, dp(18)); body.addView(limit);
        button(body, "Eveで依頼・成果・停止を開く", () -> open("/os/eve"));
        button(body, "Linuxを開く（Terminal）", this::openTerminal);
        button(body, "アカウント接続と保存済み履歴", () -> startActivity(new Intent(this, EveAccountActivity.class)));
        // Retired work screens remain outside the owner preview entry.
        }
        setContentView(scroll);
        android.view.WindowInsetsController bars = getWindow().getInsetsController();
        if (bars != null) {
            int light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            bars.setSystemBarsAppearance(light, light);
        }
        if (saved == null && !settingsScreen) open("/os/eve");
    }

    private Button cacheButton(LinearLayout body,String label,Runnable action) {
        Button button = new Button(this); button.setAllCaps(false); button.setText(label); button.setMinHeight(dp(52));
        button.setOnClickListener(view -> action.run()); styleButton(button);
        LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1,-2); row.setMargins(0,dp(6),0,dp(6)); body.addView(button,row); return button;
    }
    private void cacheControls() {
        cacheInspect.setEnabled(!cacheBusy); cacheRead.setEnabled(!cacheBusy);
        cachePrepare.setEnabled(!cacheBusy && freshInventory());
        cacheCancel.setEnabled(!cacheBusy && cacheOperation != null);
    }
    private boolean freshInventory() {
        return cacheInventory!=null && android.os.SystemClock.elapsedRealtime()<cacheInventory.optLong("expiresAtElapsed",0);
    }
    private void inspectCachedModels() {
        if(cacheBusy)return;
        cacheBusy=true;cacheControls();stopService(new Intent(this,EvePixelHostService.class));
        cacheStatus.setText("同期を一時停止しています。進行中の照会が完了してから保存済みAIを照合します。");
        awaitSyncIdle("inventory",null,android.os.SystemClock.elapsedRealtime()+30000);
    }
    private void awaitSyncIdle(String action,JSONObject selected,long deadline) {
        if(destroyed)return;
        if(EvePixelHostService.idle()) {cacheBusy=false;cacheAction(action,selected);return;}
        if(android.os.SystemClock.elapsedRealtime()>=deadline){cacheBusy=false;cacheControls();cacheStatus.setText("同期がまだ処理中です。少し待ってから照合してください。仕事や接続は保持しています。");return;}
        main.postDelayed(()->awaitSyncIdle(action,selected,deadline),200);
    }
    private void chooseCachedModel() {
        if(cacheBusy || !freshInventory()){
            cacheInventory=null;cacheControls();cacheStatus.setText("照合の有効期限が切れました。保存済みAIをもう一度照合してください。");return;
        }
        try {
            final JSONObject inventoryAtSelection=new JSONObject(cacheInventory.toString());
            JSONArray rows=inventoryAtSelection.getJSONArray("inventory");java.util.ArrayList<JSONObject> verified=new java.util.ArrayList<>();
            java.util.ArrayList<String> labels=new java.util.ArrayList<>();
            for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if("verified".equals(row.getString("state"))){
                JSONArray names=row.optJSONArray("agentNames");
                if(names==null||names.length()==0){verified.add(row);labels.add("未割当の保存済みAI\nAI: "+row.getString("id"));}
                else for(int j=0;j<names.length();j++){verified.add(row);labels.add(names.getString(j)+"\nAI: "+row.getString("id"));}}}
            if(verified.isEmpty()){cacheStatus.setText("照合できる既存キャッシュがありません。取得や追加は行いません。");return;}
            new AlertDialog.Builder(this).setTitle("Eveで選んだ担当のAIを選択")
                .setItems(labels.toArray(new String[0]),(dialog,index)->{
                    try {JSONObject row=verified.get(index);JSONObject selected=new JSONObject().put("modelId",row.getString("id"))
                        .put("modelSha256",row.getString("sha256")).put("requestId",java.util.UUID.randomUUID().toString())
                        .put("sessionBinding",inventoryAtSelection.getString("sessionBinding")).put("inventoryId",inventoryAtSelection.getString("inventoryId"))
                        .put("expiresAtElapsed",inventoryAtSelection.getLong("expiresAtElapsed"));
                        new AlertDialog.Builder(this).setTitle("既存キャッシュだけを準備しますか？")
                            .setMessage(row.getString("id")+"\nSHA-256: "+row.getString("sha256")+"\nモデルや実行環境を取得せず、保存済みファイルと依存機能だけを照合します。仕事は実行しません。")
                            .setPositiveButton("準備する",(confirm,which)->{
                                if(!freshInventory()
                                    ||!selected.optString("inventoryId").equals(cacheInventory.optString("inventoryId"))
                                    ||!EvePortableAccountSync.cacheSessionCurrent(this,selected.optString("sessionBinding"))){
                                    cacheInventory=null;cacheOperation=null;cacheSession="";cacheControls();cacheStatus.setText("照合の期限か接続が変わりました。再照合してください。");return;}
                                cachePollUntil=android.os.SystemClock.elapsedRealtime()+120000;cacheAction("prepare",selected);
                            }).setNegativeButton("取り消す",null).show();
                    }catch(Exception invalid){cacheStatus.setText("選択したAIを確認できません。再照合してください。");}
                }).setNegativeButton("閉じる",null).show();
        }catch(Exception invalid){cacheInventory=null;cacheControls();cacheStatus.setText("保存済みAIの照合結果が不正です。準備は行いません。");}
    }
    private JSONObject cacheStatusSelection() {
        try {
            if(cacheOperation!=null)return cacheOperation;
            return cacheSession.isEmpty()?null:new JSONObject().put("sessionBinding",cacheSession);
        }catch(Exception invalid){return null;}
    }
    private void cacheAction(String action,JSONObject selected) {
        if(cacheBusy)return;
        if(("prepare".equals(action)||"cancel".equals(action))&&selected==null)return;
        if(!EvePixelHostService.idle()){
            cacheBusy=true;cacheControls();stopService(new Intent(this,EvePixelHostService.class));
            cacheStatus.setText("同期を一時停止して、同じAI準備の状態を確認します。");
            awaitSyncIdle(action,selected,android.os.SystemClock.elapsedRealtime()+30000);return;
        }
        cacheBusy=true;cacheInventory=null;cacheControls();
        final JSONObject selection;
        try {
            if(selected==null)selection=null;
            else if("prepare".equals(action))selection=new JSONObject(selected.toString());
            else if(selected.has("requestId"))selection=new JSONObject().put("modelId",selected.getString("modelId"))
                .put("modelSha256",selected.getString("modelSha256")).put("requestId",selected.getString("requestId"))
                .put("sessionBinding",selected.getString("sessionBinding"));
            else selection=new JSONObject().put("sessionBinding",selected.getString("sessionBinding"));
        }
        catch(Exception invalid){cacheBusy=false;cacheControls();return;}
        cacheStatus.setText("保存済みAIの状態を確認しています。重ねて依頼しないでください。");
        new Thread(()->{
            try {
                JSONObject response=EvePortableAccountSync.cachedModels(this,action,selection);
                main.post(()->{
                    if(destroyed)return;cacheBusy=false;
                    try {
                        if(!EvePortableAccountSync.cacheSessionCurrent(this,response.getString("sessionBinding"))){
                            cacheInventory=null;cacheOperation=null;cacheSession="";cacheControls();cacheStatus.setText("接続が変わりました。前の選択を破棄し再照合してください。");return;
                        }
                        cacheSession=response.getString("sessionBinding");cacheOperation=response.optJSONObject("operation");
                        if("inventory".equals(action))cacheInventory=response;
                        String operation=cacheOperation==null?"未準備":cacheOperation.getString("state");
                        StringBuilder inventoryText=new StringBuilder();JSONArray entries=response.optJSONArray("inventory");
                        if(entries!=null)for(int i=0;i<entries.length();i++){JSONObject row=entries.getJSONObject(i);
                            inventoryText.append("\n").append(row.getString("id")).append(" · ").append("verified".equals(row.getString("state"))?"照合済み":"要確認");
                            if(!row.optString("reason").isEmpty())inventoryText.append("\n").append(row.getString("reason"));}
                        cacheStatus.setText("今回の照会: "+new java.util.Date(response.getLong("observedAt"))+"\nLinux: "+response.getString("phase")+
                            " · 準備: "+operation+"\nモデル "+response.getInt("modelCount")+" / 担当 "+response.getInt("agentCount")+" / 保存仕事 "+response.getInt("jobCount")+inventoryText+
                            "\n選択の照合期限は5分です。取得・新しい鍵・新しい承認・推論は行っていません。Eveの接続状態は同期で更新します。");
                        if("inventory".equals(action)&&visible)chooseCachedModel();
                        if("ready".equals(operation)&&!"inventory".equals(action)&&visible){cachePollUntil=0;startHost();cacheStatus.append("\n準備完了。同期の再開を依頼しました。Eveで同じ担当を選んでください。");}
                        else if("preparing".equals(operation)&&android.os.SystemClock.elapsedRealtime()<cachePollUntil){
                            main.postDelayed(()->{if(!destroyed&&visible&&!cacheBusy)cacheAction("status",cacheStatusSelection());},1500);
                        }
                    }catch(Exception invalid){cacheInventory=null;cacheOperation=null;cacheSession="";cacheStatus.setText("結果を確認できません。同じ準備を再送せず、状態を再照会してください。");}
                    cacheControls();
                });
            }catch(Exception unavailable){main.post(()->{if(destroyed)return;cacheBusy=false;cacheInventory=null;cacheOperation=null;cacheSession="";
                cacheStatus.setText(EvePortableAccountSync.cacheFailure(unavailable)+"\n仕事・モデル・接続は保持しています。取得や推論は行いません。");cacheControls();});}
        },"pixel-existing-cache").start();
    }

    private void openTerminal() {
        try { startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage("com.android.virtualization.terminal").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)); }
        catch(android.content.ActivityNotFoundException unavailable){status.setText("Terminalが見つかりません。AndroidのLinux開発環境を確認してください。既存データは変更していません。");}
    }

    private void startHost() {
        if (!PixelHostPrerequisites.available(this) || !EveAccountSync.linked(this)) {
            new AlertDialog.Builder(this).setTitle("端末の接続を確認してください")
                .setMessage("ロックを解除し、既存のアカウント接続とLinuxの接続を確認してください。新しい端末の承認や鍵の作成は自動では行いません。")
                .setPositiveButton("接続を確認", (dialog, which) -> startActivity(new Intent(this, EveAccountActivity.class)))
                .setNegativeButton("閉じる", null).show();
            return;
        }
        try { startForegroundService(new Intent(this, EvePixelHostService.class)); }
        catch (RuntimeException unavailable) { EvePixelHostService.startUnavailable(); status.setText(EvePixelHostService.notice()); }
    }

    private void open(String path) {
        // An existing device session is never converted into a browser login.
        if (PixelHostPrerequisites.available(this) && EveAccountSync.linked(this)) startHost();
        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse("https://avoado.si" + path));
        browser.addCategory(Intent.CATEGORY_BROWSABLE);
        try { startActivity(browser); }
        catch (android.content.ActivityNotFoundException unavailable) { status.setText("ブラウザを有効にして、https://avoado.si を開いてください。"); }
    }

    private void tab(LinearLayout navigation, String label, String path) {
        Button tab = new Button(this); tab.setAllCaps(false); tab.setText(label);
        tab.setMinHeight(dp(56)); tab.setTextSize(12); tab.setGravity(Gravity.CENTER);
        tab.setContentDescription(label + "を開く"); tab.setTag("os-tab:" + path);
        tab.setOnClickListener(view -> open(path));
        navigation.addView(tab, new LinearLayout.LayoutParams(0, -2, 1));
    }

    private void button(LinearLayout body, String text, Runnable action) {
        Button b = new Button(this); b.setAllCaps(false); b.setText(text); b.setMinHeight(dp(52));
        b.setGravity(Gravity.CENTER); b.setOnClickListener(view -> action.run());
        styleButton(b);
        LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, -2);
        row.setMargins(0, dp(6), 0, dp(6)); body.addView(b, row);
    }
    private void section(LinearLayout body, String label) {
        TextView heading = new TextView(this); heading.setText(label);
        heading.setTextColor(Color.rgb(21,21,21)); heading.setTextSize(18);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        heading.setPadding(0,dp(24),0,dp(10)); body.addView(heading);
    }
    private void styleButton(Button button) {
        button.setTextSize(15); button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setPadding(dp(16),dp(12),dp(16),dp(12)); button.setMinHeight(dp(52));
        android.graphics.drawable.GradientDrawable surface = new android.graphics.drawable.GradientDrawable();
        surface.setColor(Color.WHITE); surface.setCornerRadius(dp(6)); surface.setStroke(dp(1),Color.rgb(216,216,216));
        button.setBackgroundTintList(null); button.setBackground(surface);
        button.setTextColor(new android.content.res.ColorStateList(new int[][] {new int[] {-android.R.attr.state_enabled},new int[] {}},new int[] {Color.rgb(138,138,138),Color.rgb(21,21,21)}));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override protected void onResume() { super.onResume(); visible=true; main.removeCallbacks(refresh); if(settingsScreen) main.post(refresh); }
    @Override protected void onDestroy() { destroyed=true; main.removeCallbacks(refresh); super.onDestroy(); }
    @Override protected void onPause() { visible=false; main.removeCallbacks(refresh); super.onPause(); }
}
