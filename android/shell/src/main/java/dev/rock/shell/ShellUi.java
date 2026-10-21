package dev.rock.shell;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Shared, density-aware presentation. No execution or persistence authority. */
final class ShellUi {
    static final int BACKGROUND = 0xff0a1019;
    static final int SURFACE = 0xff131e2b;
    static final int RAISED = 0xff1d2b3c;
    static final int LINE = 0xff304155;
    static final int INK = 0xfff4f6f8;
    static final int MUTED = 0xffa0a8b3;
    static final int ACCENT = 0xffb2ddff;
    static final int SUCCESS = 0xff9ce0c2;
    static final int WARNING = 0xffffd39b;
    private final Context context;

    ShellUi(Context context) { this.context = context; }
    int dp(float value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    LinearLayout column() {
        LinearLayout view = new LinearLayout(context);
        view.setOrientation(LinearLayout.VERTICAL);
        return view;
    }
    GradientDrawable surface(int color, int border, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color); shape.setCornerRadius(dp(radius));
        if (border != 0) shape.setStroke(dp(1), border);
        return shape;
    }
    LinearLayout card(LinearLayout parent) {
        LinearLayout card = column();
        card.setPadding(dp(20), dp(14), dp(20), dp(20));
        card.setBackground(surface(SURFACE, LINE, 22));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(12); params.bottomMargin = dp(4);
        parent.addView(card, params);
        return card;
    }
    TextView text(LinearLayout parent, String text, int size) {
        TextView view = new TextView(context);
        view.setText(text); view.setTextSize(size);
        view.setTextColor(size >= 18 ? INK : MUTED);
        view.setFontFeatureSettings("kern");
        view.setLineSpacing(dp(3), 1f);
        view.setPadding(0, dp(size >= 20 ? 12 : 6), 0, dp(8));
        if (size >= 18) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        if (size >= 20) view.setAccessibilityHeading(true);
        parent.addView(view, new LinearLayout.LayoutParams(-1, -2));
        return view;
    }
    void input(EditText input) {
        input.setTextColor(INK); input.setHintTextColor(MUTED); input.setTextSize(16);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setMinHeight(dp(52)); input.setGravity(Gravity.TOP | Gravity.START);
        input.setBackground(surface(BACKGROUND, LINE, 12));
        input.setBackgroundTintList(null);
    }
    Button button(LinearLayout parent, String text, Runnable action) {
        Button view = new Button(context);
        view.setText(text); view.setTextColor(INK); view.setTextSize(14);
        view.setAllCaps(false); view.setMinHeight(dp(52));
        view.setPadding(dp(14), dp(10), dp(14), dp(10));
        view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337f8b99), surface(RAISED, LINE, 14), null));
        view.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(8);
        parent.addView(view, params);
        return view;
    }
    void primary(Button view) {
        view.setTextColor(SURFACE);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337f8b99), surface(ACCENT, 0, 14), null));
    }
    TextView badge(LinearLayout parent, String text, int color) {
        TextView view = text(parent, text, 12);
        view.setTextColor(color); view.setPadding(dp(12), dp(6), dp(12), dp(6));
        view.setBackground(surface(RAISED, 0, 24));
        view.setLayoutParams(new LinearLayout.LayoutParams(-2, -2));
        return view;
    }
    TextView navigation(LinearLayout parent, String name, int index, Runnable action) {
        TextView view = new TextView(context);
        view.setText(name); view.setTextSize(11); view.setGravity(Gravity.CENTER);
        view.setPadding(dp(2), dp(10), dp(2), dp(8));
        view.setCompoundDrawablePadding(dp(5));
        view.setMinHeight(dp(68));
        view.setClickable(true); view.setFocusable(true);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337f8b99), null, surface(INK, 0, 10)));
        view.setOnClickListener(v -> action.run());
        view.setTag("nav-" + index);
        parent.addView(view, new LinearLayout.LayoutParams(0, -2, 1f));
        selectNavigation(view, index, false);
        return view;
    }
    void selectNavigation(TextView view, int index, boolean selected) {
        int color = selected ? INK : MUTED;
        view.setSelected(selected);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x337f8b99),
            surface(selected ? RAISED : BACKGROUND, selected ? LINE : 0, 8), null));
        view.setTextColor(color);
        view.setTypeface(Typeface.create(selected ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        view.setStateDescription(selected ? "選択中" : null);
        Drawable icon = new NavigationIcon(index, color);
        icon.setBounds(0, 0, dp(22), dp(22));
        view.setCompoundDrawables(null, icon, null, null);
    }
    private static final class NavigationIcon extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int index;
        NavigationIcon(int index, int color) {
            this.index = index; paint.setColor(color); paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.7f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
        }
        @Override public void draw(Canvas canvas) {
            canvas.save(); canvas.translate(getBounds().left, getBounds().top);
            canvas.scale(getBounds().width() / 24f, getBounds().height() / 24f);
            if (index == 0) {
                Path p = new Path(); p.moveTo(3, 10); p.lineTo(12, 3); p.lineTo(21, 10);
                p.lineTo(21, 21); p.lineTo(15, 21); p.lineTo(15, 14); p.lineTo(9, 14);
                p.lineTo(9, 21); p.lineTo(3, 21); p.close(); canvas.drawPath(p, paint);
            } else if (index == 1) {
                for (int x : new int[]{3, 14}) for (int y : new int[]{3, 14})
                    canvas.drawRoundRect(x, y, x + 7, y + 7, 2, 2, paint);
            } else if (index == 2) {
                canvas.drawRoundRect(3, 6, 21, 21, 3, 3, paint);
                canvas.drawRoundRect(8, 3, 16, 8, 2, 2, paint);
                canvas.drawLine(8, 13, 16, 13, paint); canvas.drawLine(8, 17, 13, 17, paint);
            } else {
                canvas.drawLine(4, 6, 20, 6, paint); canvas.drawLine(4, 12, 20, 12, paint);
                canvas.drawLine(4, 18, 20, 18, paint);
                paint.setStyle(Paint.Style.FILL); canvas.drawCircle(9, 6, 2.5f, paint);
                canvas.drawCircle(16, 12, 2.5f, paint); canvas.drawCircle(8, 18, 2.5f, paint);
                paint.setStyle(Paint.Style.STROKE);
            }
            canvas.restore();
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
