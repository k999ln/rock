package dev.rock.xsession;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Official X top-level view. No scraping, script injection, account-cookie export or Broker access. */
public final class XSessionActivity extends Activity {
    private static final String HOME = "https://x.com/home";
    private WebView web;
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // This companion has its own app UID/data directory, separate from the OS Shell.
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(249,248,245));
        LinearLayout bar = new LinearLayout(this); bar.setPadding(16,14,16,8);bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);logo.setImageResource(R.drawable.company_mark);logo.setContentDescription("RockstarOS");bar.addView(logo,new LinearLayout.LayoutParams(32,32));
        TextView title = new TextView(this);title.setText("RockstarOS · X");title.setTextSize(18);title.setPadding(12,0,8,0);bar.addView(title,new LinearLayout.LayoutParams(0,48,1));
        Button close = new Button(this);close.setText("閉じる");close.setOnClickListener(v -> finish());bar.addView(close);root.addView(bar);
        status = new TextView(this);status.setText("本人のX画面を開きます。ログイン情報はこの端末のX表示領域に保存されます。");status.setTextSize(12);status.setPadding(18,8,18,12);root.addView(status);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback) { callback.invoke(origin,false,false); }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) { callback.onReceiveValue(null);return true; }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();String host=uri.getHost();
                if(!"https".equals(uri.getScheme()))return true;
                if("x.com".equals(host)||"twitter.com".equals(host)||"www.x.com".equals(host)||"www.twitter.com".equals(host))return false;
                // Ordinary user-clicked links leave the X session; no arbitrary automatic destinations.
                if(request.isForMainFrame()&&request.hasGesture())try { startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE)); }catch(android.content.ActivityNotFoundException ignored) { status.setText("このリンクを開くブラウザがありません。"); }
                return true;
            }
            @Override public void onPageCommitVisible(WebView view,String url) {
                String host=Uri.parse(url).getHost();status.setText("X公式画面 · "+(host==null?"接続を確認中":host)+" · 操作は本人が行います");
            }
        });
        root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));setContentView(root);
        // Intent input never controls the destination or supplies account credentials.
        web.loadUrl(HOME);
    }
    @Override public void onBackPressed() { if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed(); }
    @Override protected void onPause() { if(web!=null)web.onPause();CookieManager.getInstance().flush();super.onPause(); }
    @Override protected void onResume() { super.onResume();if(web!=null)web.onResume(); }
    @Override protected void onDestroy() { if(web!=null){web.stopLoading();((ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}super.onDestroy(); }
}
