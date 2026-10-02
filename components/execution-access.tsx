'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites authentication is a top-level gateway route. */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';

const accessCheckEvent = 'sky-execution-access-check';

export function useExecutionAccess() {
  const [needsSignin, setNeedsSignin] = useState(false);
  useEffect(() => {
    let active = true;
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const jobs = await operationRequest<unknown[]>('/api/jobs');
        if (!Array.isArray(jobs)) return;
        if (active) setNeedsSignin(false);
      } catch (error) {
        if (active && error instanceof OperationRequestError && error.status === 401)
          setNeedsSignin(true);
        // An unavailable service does not prove that authentication succeeded.
      } finally {
        checking = false;
      }
    }
    void check();
    const recheck = () => { void check(); };
    window.addEventListener(accessCheckEvent, recheck);
    return () => {
      active = false;
      window.removeEventListener(accessCheckEvent, recheck);
    };
  }, []);
  return { needsSignin, setNeedsSignin };
}

export function ExecutionSignin() {
  const pathname = usePathname();
  return (
    <div className="rock-service-notice">
      <strong>サインインを確認してください。</strong>
      <p>
        この画面を開いたまま、別タブでサインインしてください。戻ったら接続を確認し、実行ボタンを押してください。この画面を再読み込みすると、未保存の入力が失われる場合があります。接続確認だけでは処理を実行しません。
      </p>
      <a
        className="rock-button rock-button-dark"
        href={`/signin-with-chatgpt?return_to=${encodeURIComponent(pathname)}`}
        target="_blank"
        rel="noreferrer"
      >
        別タブでサインイン
      </a>
      <button
        type="button"
        className="rock-button"
        onClick={() => window.dispatchEvent(new Event(accessCheckEvent))}
      >
        サインイン後に接続を確認
      </button>
    </div>
  );
}
