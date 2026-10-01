'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites authentication is a top-level gateway route. */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function useExecutionAccess() {
  const [needsSignin, setNeedsSignin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/jobs', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setNeedsSignin(response.status === 401);
      })
      .catch(() => {
        /* Execution reports an unavailable service through its own request. */
      });
    return () => controller.abort();
  }, []);
  return { needsSignin, setNeedsSignin };
}

export function ExecutionSignin() {
  const pathname = usePathname();
  return (
    <div className="rock-service-notice">
      <strong>サインインしてから、入力を始めてください。</strong>
      <p>
        自分の実行履歴を保存できるようになります。入力と結果はこのブラウザの一時セッションに最大10分保存され、サーバーには本文を保存しません。
      </p>
      <a
        className="rock-button rock-button-dark"
        href={`/signin-with-chatgpt?return_to=${encodeURIComponent(pathname)}`}
        target="_top"
      >
        サインインして使う
      </a>
    </div>
  );
}
