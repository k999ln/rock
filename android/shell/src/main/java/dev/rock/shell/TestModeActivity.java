package dev.rock.shell;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import dev.rock.core.OutputTestTools;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native offline test UI. No ShellConnection, authenticated state or network permission. */
public final class TestModeActivity extends Activity {
    private static final int EXPORT_RESULTS=301;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private Session session;
    private ShellUi ui;
    private Spinner selector;
    private EditText input,option;
    private TextView inputLabel,optionLabel,scope,output,status;
    private Button run,all,copy,save,reset;
    private boolean binding,busy;
    private String pendingExport;

    private static final class Session {
        int selected;
        final String[] inputs=new String[OutputTestTools.SCENARIOS.size()];
        final String[] options=new String[inputs.length];
        final String[] outputs=new String[inputs.length];
        final String[] errors=new String[inputs.length];
        Session() { for(int i=0;i<inputs.length;i++) { inputs[i]=OutputTestTools.SCENARIOS.get(i).sample; options[i]=OutputTestTools.SCENARIOS.get(i).option; } }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Object retained=getLastNonConfigurationInstance(); session=retained instanceof Session?(Session)retained:new Session();
        ui=new ShellUi(this);
        getWindow().setStatusBarColor(ShellUi.BACKGROUND); getWindow().setNavigationBarColor(ShellUi.BACKGROUND);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        LinearLayout root=ui.column(); root.setBackgroundColor(ShellUi.BACKGROUND);
        root.setOnApplyWindowInsetsListener((view,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom)); return WindowInsets.CONSUMED;
        });
        LinearLayout header=new LinearLayout(this); header.setPadding(ui.dp(20),ui.dp(8),ui.dp(20),ui.dp(8));
        TextView title=new TextView(this);title.setText("✳  RockstarOS  /  テスト");title.setTextColor(ShellUi.INK);title.setTextSize(17);
        header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button close=new Button(this);close.setText("閉じる");close.setOnClickListener(v->finish());header.addView(close);root.addView(header);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setTag("test-scroll");
        LinearLayout content=ui.column();content.setPadding(ui.dp(20),0,ui.dp(20),ui.dp(28));scroll.addView(content);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        ui.text(content,"このPixelで、すぐ試す。",26);
        ui.text(content,"登録・通信なし。17項目の入力から出力まで。AIや外部サービスは模擬と明示します。",14);
        ui.text(content,"テスト専用 · 料金・送金・外部投稿なし\n入力と結果はこの画面のメモリだけに保持。閉じると消えます。",12);
        all=ui.button(content,"全17項目をサンプル実行",()->execute(true));all.setTag("test-run-all");ui.primary(all);
        ui.text(content,"一括実行は各入力をサンプルに戻します。",12);
        status=ui.text(content,"0 / 17 確認済み",14);status.setTag("test-status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        ui.text(content,"機能を選ぶ",14);
        selector=new Spinner(this);selector.setTag("test-selector");
        String[] names=new String[OutputTestTools.SCENARIOS.size()];
        for(int i=0;i<names.length;i++) { OutputTestTools.Scenario s=OutputTestTools.SCENARIOS.get(i);names[i]=(i+1)+". "+s.title+" · "+s.mode(); }
        ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,names);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);selector.setAdapter(adapter);content.addView(selector,new LinearLayout.LayoutParams(-1,ui.dp(56)));
        LinearLayout card=ui.card(content); scope=ui.text(card,"",13);scope.setTag("test-scope");
        inputLabel=ui.text(card,"入力",14);input=edit(card,"test-input");
        optionLabel=ui.text(card,"補足",14);option=edit(card,"test-option");option.setMinLines(1);
        run=ui.button(card,"この入力で実行",()->execute(false));run.setTag("test-run");ui.primary(run);
        ui.text(card,"出力",20);output=ui.text(card,"入力を変えて実行すると、ここに結果が出ます。",15);output.setTextColor(ShellUi.INK);output.setTag("test-output");output.setTextIsSelectable(true);
        copy=ui.button(card,"結果をコピー",()->{
            String value=session.outputs[session.selected];
            if(value!=null) { getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("RockstarOS テスト結果",value));status.setText("コピーしました · テスト結果"); }
        });copy.setTag("test-copy");
        save=ui.button(content,"全結果をファイルに保存",this::saveResults);save.setTag("test-save");
        reset=ui.button(content,"テスト入力と結果をリセット",()->{int selected=session.selected;session=new Session();session.selected=selected;render();});reset.setTag("test-reset");
        ui.text(content,"本番の仕事・残高・権限は変更しません。本物のAI推論、外部サービス連携は別途接続が必要です。",12);
        TextWatcher watcher=new TextWatcher() {
            public void beforeTextChanged(CharSequence s,int start,int count,int after) {}
            public void onTextChanged(CharSequence s,int start,int before,int count) { if(!binding&&!busy) { int i=session.selected;session.inputs[i]=input.getText().toString();session.options[i]=option.getText().toString();session.outputs[i]=null;session.errors[i]=null;renderOutput(); } }
            public void afterTextChanged(Editable text) {}
        };
        input.addTextChangedListener(watcher);option.addTextChangedListener(watcher);
        selector.setSelection(session.selected);
        selector.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){
            public void onItemSelected(AdapterView<?> parent,View view,int position,long id) { session.selected=position;render(); }
            public void onNothingSelected(AdapterView<?> parent) {}
        });
        setContentView(root);root.requestApplyInsets();render();
    }
    private EditText edit(LinearLayout parent,String tag) {
        EditText value=new EditText(this);value.setTag(tag);value.setMinLines(4);value.setMaxLines(8);
        value.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        value.setFilters(new InputFilter[]{new InputFilter.LengthFilter(OutputTestTools.INPUT_LIMIT)});
        value.setSaveEnabled(false);value.setAutofillHints((String[])null);value.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        ui.input(value);parent.addView(value,new LinearLayout.LayoutParams(-1,-2));return value;
    }
    private void render() {
        binding=true;OutputTestTools.Scenario s=OutputTestTools.SCENARIOS.get(session.selected);
        scope.setText(s.mode()+"\n"+s.scope);inputLabel.setText(s.inputLabel);optionLabel.setText(s.optionLabel);
        input.setContentDescription(s.inputLabel);option.setContentDescription(s.optionLabel);
        input.setText(session.inputs[session.selected]);option.setText(session.options[session.selected]);
        option.setVisibility(s.optionLabel.isEmpty()?View.GONE:View.VISIBLE);optionLabel.setVisibility(option.getVisibility());
        binding=false;renderOutput();
    }
    private void renderOutput() {
        int completed=0,errors=0;for(String result:session.outputs) if(result!=null) completed++;for(String error:session.errors) if(error!=null) errors++;
        String error=session.errors[session.selected],result=session.outputs[session.selected];
        output.setText(error!=null?"入力を確認してください\n"+error:result!=null?result:"入力を変えて実行すると、ここに結果が出ます。");
        status.setText(completed+" / 17 確認済み"+(errors>0?" · "+errors+"件 要確認":"")+(busy?" · 実行中":""));
        selector.setEnabled(!busy);input.setEnabled(!busy);option.setEnabled(!busy);run.setEnabled(!busy);all.setEnabled(!busy);reset.setEnabled(!busy);
        copy.setEnabled(!busy&&result!=null);save.setEnabled(!busy&&completed>0);
    }
    private void execute(boolean runAll) {
        if(busy) return;
        InputMethodManager keyboard=getSystemService(InputMethodManager.class);keyboard.hideSoftInputFromWindow(input.getWindowToken(),0);input.clearFocus();option.clearFocus();
        if(runAll) { int selected=session.selected;session=new Session();session.selected=selected;render(); }
        busy=true;renderOutput();final Session target=session;final int selected=session.selected;
        worker.execute(()->{
            int first=runAll?0:selected,last=runAll?target.inputs.length:selected+1;
            for(int i=first;i<last;i++) {
                if(Thread.currentThread().isInterrupted()) return;
                String result=null,error=null;
                try { result=OutputTestTools.run(OutputTestTools.SCENARIOS.get(i).id,target.inputs[i],target.options[i]); }
                catch(IllegalArgumentException e) { error="NO_PAID_REMAINDER".equals(e.getMessage())?"原稿を長くするか、複数の文で入力してください。":e.getMessage(); }
                final int index=i;final String value=result,problem=error;
                handler.post(()->{if(!isDestroyed()&&session==target){target.outputs[index]=value;target.errors[index]=problem;renderOutput();}});
            }
            handler.post(()->{if(!isDestroyed()){busy=false;renderOutput();}});
        });
    }
    String exportResults() throws org.json.JSONException {
        JSONArray results=new JSONArray();
        for(int i=0;i<session.outputs.length;i++) if(session.outputs[i]!=null||session.errors[i]!=null) {
            OutputTestTools.Scenario s=OutputTestTools.SCENARIOS.get(i);
            results.put(new JSONObject().put("id",s.id).put("mode",s.simulated?"simulation":"local_processing").put("scope",s.scope).put("output",session.outputs[i]==null?JSONObject.NULL:session.outputs[i]).put("error",session.errors[i]==null?JSONObject.NULL:session.errors[i]));
        }
        return new JSONObject().put("schema","rockstaros-native-output-tests/1").put("testOnly",true).put("externalCalls",false).put("results",results).toString(2);
    }
    private void saveResults() {
        try { pendingExport=exportResults();Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,"rockstar-pixel-test-results.json");startActivityForResult(intent,EXPORT_RESULTS); }
        catch(org.json.JSONException|android.content.ActivityNotFoundException e) { pendingExport=null;status.setText("保存画面を開けません。結果のコピーを使ってください。"); }
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request!=EXPORT_RESULTS) return;
        String text=pendingExport;pendingExport=null;
        if(result!=RESULT_OK||data==null||data.getData()==null||text==null) return;
        try(java.io.OutputStream stream=getContentResolver().openOutputStream(data.getData(),"wt")) {
            if(stream==null) throw new java.io.IOException();stream.write(text.getBytes(StandardCharsets.UTF_8));status.setText("テスト結果を保存しました");
        } catch(java.io.IOException e) { status.setText("保存できませんでした。再試行するかコピーを使ってください。"); }
    }
    @Override public Object onRetainNonConfigurationInstance() { return session; }
    @Override public void onDestroy() { worker.shutdownNow();handler.removeCallbacksAndMessages(null);pendingExport=null;super.onDestroy(); }
}
