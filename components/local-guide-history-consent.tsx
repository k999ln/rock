'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level navigation. */

export function LocalGuideHistoryConsent({ checked, disabled, onChange }: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="legal-runner-consent">
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(event) => onChange(event.target.checked)} />
      <span>
        端末内処理の実行履歴をSkyに保存する（任意・サインインが必要）
        <small>本文は送信せず、ツール名・日時・成否・処理時間・入出力のバイト数を保存します。オンライン調査とは別の設定です。</small>
      </span>
    </label>
  );
}

export function LocalGuideSignin({ tool }: {
  tool: 'rockstar-legal-intake' | 'rockstar-patent-assistant';
}) {
  return (
    <a href={`/signin-with-chatgpt?return_to=/sky/tools/${tool}`} target="_blank" rel="noreferrer">
      別タブでサインイン（この画面の入力を保持）
    </a>
  );
}
