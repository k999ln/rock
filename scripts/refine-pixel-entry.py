"""Refine existing owner UI; keep realm, auth, sync and cache handlers intact."""
from pathlib import Path

def refine(text):
    if 'private boolean settingsScreen;' in text:
        raise ValueError('entry already refined; review instead of overwriting')
    def replace(old,new):
        nonlocal text
        if text.count(old)!=1: raise ValueError('source anchor mismatch: '+old[:70])
        text=text.replace(old,new,1)
    replace('    private boolean cacheBusy, destroyed;', '    private boolean cacheBusy, destroyed;\n    private boolean settingsScreen;')
    replace('        super.onCreate(saved);', '        super.onCreate(saved);\n        settingsScreen = getIntent().getBooleanExtra("deviceSettings", false);')
    replace('int ink = Color.rgb(36, 45, 39), paper = Color.rgb(255, 253, 247);', 'int ink = Color.rgb(21, 21, 21), paper = Color.WHITE;')
    first=text.index('        ImageView mark = new ImageView(this);')
    end=text.index('        status = new TextView(this);',first)
    old=text[first:end]
    preview=''
    if '        if (EvePrivatePreview.allowed(this)) {' in old:
        preview=old[old.index('        if (EvePrivatePreview.allowed(this)) {'):]
    replacement='''        LinearLayout header = new LinearLayout(this);
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
            button(body, "Webの設定", () -> open("/settings"));
            section(body, "接続と同期");
'''+preview
    text=text[:first]+replacement+text[end:]
    # Initialize these on both paths; only settings attaches diagnostic widgets.
    replace('        status = new TextView(this);\n        status.setTextSize(15);', '        status.setTextSize(15);')
    replace('        cacheStatus = new TextView(this); cacheStatus.setTextSize(14);', '        section(body, "端末内AIの準備");\n        cacheStatus.setTextSize(14);')
    replace('        TextView limit = new TextView(this);', '        section(body, "アカウントと診断");\n        TextView limit = new TextView(this);')
    replace('        setContentView(scroll);', '        }\n        setContentView(scroll);')
    oldline=next(l for l in text.splitlines() if 'if (saved == null && !getIntent().getBooleanExtra' in l)
    replace(oldline, '        if (saved == null && !settingsScreen) open("/os/eve");')
    replace('        body.addView(b, new LinearLayout.LayoutParams(-1, -2));', '        styleButton(b);\n        LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, -2);\n        row.setMargins(0, dp(6), 0, dp(6)); body.addView(b, row);')
    replace('button.setOnClickListener(view -> action.run()); body.addView(button,new LinearLayout.LayoutParams(-1,-2)); return button;', 'button.setOnClickListener(view -> action.run()); styleButton(button);\n        LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1,-2); row.setMargins(0,dp(6),0,dp(6)); body.addView(button,row); return button;')
    replace('    private int dp(int value)', '''    private void section(LinearLayout body, String label) {
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
    private int dp(int value)''')
    replace('main.removeCallbacks(refresh); main.post(refresh);', 'main.removeCallbacks(refresh); if(settingsScreen) main.post(refresh);')
    return text

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('activity',type=Path);a=p.parse_args()
    a.activity.write_text(refine(a.activity.read_text()))
