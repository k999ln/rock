'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites authentication is a top-level gateway route. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';

const accessCheckEvent = 'sky-execution-access-check';
export function requestExecutionAccessCheck() {
  window.dispatchEvent(new Event(accessCheckEvent));
}

export type ExecutionAccessState = 'checking' | 'ready' | 'signin' | 'unavailable';

export function useExecutionAccess() {
  const [accessState, setAccessState] = useState<ExecutionAccessState>('checking');
  const requestVersion = useRef(0);
  const pendingVersion = useRef<number | null>(null);
  const setNeedsSignin = useCallback((value: boolean) => {
    requestVersion.current++;
    pendingVersion.current = null;
    setAccessState(value ? 'signin' : 'ready');
  }, []);
  useEffect(() => {
    let active = true;
    const requestVersionRef = requestVersion;
    const pendingVersionRef = pendingVersion;
    async function check() {
      if (pendingVersion.current !== null) return;
      const version = ++requestVersion.current;
      pendingVersion.current = version;
      if (active && version === requestVersion.current) setAccessState('checking');
      try {
        const jobs = await operationRequest<unknown[]>('/api/jobs');
        if (active && version === requestVersion.current) setAccessState(Array.isArray(jobs) ? 'ready' : 'unavailable');
      } catch (error) {
        if (active && version === requestVersion.current) setAccessState(
          error instanceof OperationRequestError && error.status === 401
            ? 'signin' : 'unavailable',
        );
      } finally {
        if (pendingVersion.current === version) pendingVersion.current = null;
      }
    }
    void check();
    const recheck = () => { void check(); };
    window.addEventListener(accessCheckEvent, recheck);
    return () => {
      active = false;
      requestVersionRef.current++;
      pendingVersionRef.current = null;
      window.removeEventListener(accessCheckEvent, recheck);
    };
  }, []);
  return {
    needsSignin: accessState === 'signin',
    executionBlocked: accessState !== 'ready',
    accessState,
    setNeedsSignin,
  };
}

export function ExecutionSignin({ state = 'signin' }: { state?: ExecutionAccessState }) {
  const pathname = usePathname();
  if (state === 'ready') return null;
  if (state !== 'signin') return (
    <div className="rock-service-notice" role={state === 'checking' ? 'status' : 'alert'}>
      <strong>{state === 'checking' ? '接続を確認しています…' : '接続を確認できませんでした。'}</strong>
      <p>{state === 'checking'
        ? '処理はまだ実行していません。'
        : '入力はこの画面に残っています。通信を確認して、もう一度接続を確認してください。再確認だけでは処理を実行しません。'}</p>
      <button
        type="button"
        className="rock-button"
        disabled={state === 'checking'}
        onClick={requestExecutionAccessCheck}
      >
        {state === 'checking' ? '接続を確認中…' : '接続を再確認'}
      </button>
    </div>
  );
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
        onClick={requestExecutionAccessCheck}
      >
        サインイン後に接続を確認
      </button>
    </div>
  );
}
