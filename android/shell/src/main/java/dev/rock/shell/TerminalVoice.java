package dev.rock.shell;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.widget.EditText;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Locale;

/** Explicit, on-device input/output only. Never submits a job or grants execution approval. */
final class TerminalVoice {
    private final Activity activity;
    private final EditText input;
    private final TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private String pendingSpeech;
    private long generation;
    private boolean closed;
    private final Runnable timeout = this::stop;

    TerminalVoice(Activity activity, EditText input, TextView status) {
        this.activity = activity; this.input = input; this.status = status;
    }

    private boolean unlocked() {
        KeyguardManager keys = activity.getSystemService(KeyguardManager.class);
        return !closed && !activity.isFinishing() && !activity.isDestroyed()
            && keys != null && !keys.isDeviceLocked();
    }

    void start() {
        stop();
        if (!unlocked()) { status.setText("解除後に、もう一度音声入力を開始してください。"); return; }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)) {
            status.setText("端末内の音声認識がありません。文字で入力してください。クラウドへは切り替えません。"); return;
        }
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            status.setText("マイクを許可した後、もう一度「話して入力」を押してください。");
            activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 710); return;
        }
        final long attempt = ++generation;
        final String before = input.getText().toString();
        try {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);
            recognizer.setRecognitionListener(new RecognitionListener() {
                private boolean current() { return generation == attempt && unlocked(); }
                public void onReadyForSpeech(Bundle params) { if (current()) status.setText("聞いています。停止ボタンでいつでも中止できます。"); }
                public void onBeginningOfSpeech() { }
                public void onRmsChanged(float rmsdB) { }
                public void onBufferReceived(byte[] buffer) { }
                public void onEndOfSpeech() { if (current()) status.setText("端末内で文字へ変換中…"); }
                public void onError(int error) {
                    if (!current()) return;
                    stop(); status.setText(error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED
                        || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE
                        ? "日本語の端末内音声認識が未準備です。文字で入力してください。"
                        : "音声入力を確認できませんでした。文字で入力するか、もう一度開始してください。");
                }
                public void onResults(Bundle results) {
                    if (!current()) return;
                    ArrayList<String> values = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    boolean unchanged = before.equals(input.getText().toString());
                    String text = values == null || values.isEmpty() ? "" : values.get(0);
                    stop();
                    if (unchanged && text != null && !text.trim().isEmpty() && text.length() <= 8000) {
                        input.setText(before.isEmpty() ? text : before + "\n" + text);
                        status.setText("文字にしました。内容を確認・修正してください。まだ依頼は実行していません。");
                    } else status.setText("入力中の下書きを保護しました。必要なら、もう一度音声入力してください。");
                }
                public void onPartialResults(Bundle partialResults) { }
                public void onEvent(int eventType, Bundle params) { }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP")
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
            status.setText("端末内の音声入力を開始します…");
            handler.postDelayed(timeout, 20_000);
        } catch (RuntimeException unavailable) {
            stop(); status.setText("端末内の音声入力を開始できません。文字で入力してください。");
        }
    }

    void speak(String text) {
        stop();
        if (!unlocked() || text == null || text.trim().isEmpty()) {
            status.setText("画面を解除し、読み上げる依頼文を入力してください。"); return;
        }
        pendingSpeech = text.substring(0, Math.min(text.length(), 2000));
        long attempt = ++generation;
        try {
            tts = new TextToSpeech(activity, result -> {
                if (generation != attempt || !unlocked()) return;
                if (result != TextToSpeech.SUCCESS || tts == null || tts.getVoices() == null) {
                    stop(); status.setText("端末内の読み上げを利用できません。"); return;
                }
                Voice selected = null;
                for (Voice candidate : tts.getVoices()) if (candidate != null && !candidate.isNetworkConnectionRequired()
                        && (candidate.getFeatures() == null || !candidate.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
                        && Locale.JAPANESE.getLanguage().equals(candidate.getLocale().getLanguage())) {
                    selected = candidate; break;
                }
                if (selected == null || tts.setVoice(selected) != TextToSpeech.SUCCESS) {
                    stop(); status.setText("日本語の端末内音声がありません。読み上げ用の音声をAndroid側で準備してください。"); return;
                }
                String speech = pendingSpeech; pendingSpeech = null;
                if (speech == null || !unlocked()) { stop(); return; }
                int accepted = tts.speak(speech, TextToSpeech.QUEUE_FLUSH, null, "terminal-request");
                status.setText(accepted == TextToSpeech.SUCCESS ? "依頼文を端末内で読み上げます。停止ボタンで止められます。"
                    : "読み上げを開始できませんでした。");
            });
        } catch (RuntimeException unavailable) { stop(); status.setText("端末内の読み上げを開始できません。"); }
    }

    void stop() {
        generation++; pendingSpeech = null; handler.removeCallbacks(timeout);
        if (recognizer != null) {
            SpeechRecognizer old = recognizer; recognizer = null;
            try { old.cancel(); } catch (RuntimeException ignored) { }
            try { old.destroy(); } catch (RuntimeException ignored) { }
        }
        if (tts != null) {
            TextToSpeech old = tts; tts = null;
            try { old.stop(); } catch (RuntimeException ignored) { }
            try { old.shutdown(); } catch (RuntimeException ignored) { }
        }
        if (!closed) status.setText("音声は停止中です。文字でも操作できます。");
    }

    void close() { stop(); closed = true; }
}
