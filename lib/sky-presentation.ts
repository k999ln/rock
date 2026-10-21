/** Presentation only: never changes workflow states, approvals, stored output or charges. */
export type SkyProgress = { label: string; detail: string; next: string };
const progress: Record<string, SkyProgress> = {
  active: { label: '作業中', detail: 'この仕事はまだ完了していません。', next: '進み具合を確認できます。必要なら停止してください。' },
  running: { label: '作業中', detail: '処理を進めています。成果はまだ確定していません。', next: '結果を待つか、停止してください。' },
  sending: { label: '送信中', detail: '依頼を送っています。相手が受け取ったかはまだ確認できません。', next: '同じ依頼を重ねて送らず、状態を確認してください。' },
  queued: { label: '順番待ち', detail: 'まだ処理は始まっていません。', next: '開始を待つか、停止してください。' },
  prepared: { label: '実行待ち', detail: '実行の準備ができています。まだ成果はありません。', next: '内容と費用を確認して実行してください。' },
  awaiting_approval: { label: 'あなたの確認待ち', detail: '実行前の確認が必要です。', next: '送る内容、使う機能、費用の上限を確認してください。' },
  review: { label: '成果の確認待ち', detail: '下書きができました。まだ確認済みではありません。', next: '元の内容と比べて、合っていれば確認済みにしてください。' },
  completed: { label: '確認済み', detail: 'この仕事の成果を確認済みとして記録しています。', next: '必要な成果を手元に保存してください。外部での採用や支払いは別に確認します。' },
  remote_completed: { label: '相手側の処理が終了', detail: '相手から終了の連絡があります。成果の保存と内容の確認は別に必要です。', next: '成果を開き、保存されている内容を確認してください。' },
  cancelled: { label: '停止済み', detail: 'この仕事の停止を記録しています。', next: '外部で処理した内容や費用がある場合は、履歴も確認してください。' },
  remote_cancelled: { label: '相手側で停止済み', detail: '相手から停止の連絡があります。', next: '停止前の処理や費用は履歴で確認してください。' },
  failed: { label: '作業を完了できませんでした', detail: '成功した成果として扱えません。', next: '履歴と保存済みの成果を確認してから、やり直すか判断してください。' },
  remote_failed: { label: '相手側で作業が失敗', detail: '相手から失敗の連絡があります。', next: '履歴と費用を確認してください。同じ操作を重ねないでください。' },
  unknown: { label: '結果を確認できません', detail: '成功したか、停止したかをまだ確認できません。', next: '同じ操作を重ねず、最新の状態を読み直してください。' },
};
/** The caller must distinguish a job confirmation from a provider's terminal state. */
export function skyProgress(state: string, scope: 'work' | 'execution' = 'work'): SkyProgress {
  if (state === 'completed' && scope === 'execution') return {
    label: '処理が終了', detail: '処理の終了を記録しています。内容が正しいかは別に確認が必要です。',
    next: '保存された成果を開いて確認してください。',
  };
  return Object.hasOwn(progress, state) ? progress[state] : progress.unknown;
}

/** Only fixed system copy; never apply to the user's text, model answers, URLs or identifiers. */
export function skySystemWords(text: string): string {
  return text.replace(/Provider/gu, '提供元').replace(/usage receipt/gu, '利用明細')
    .replace(/\busage\b/gu, '利用量').replace(/\brevision\b/gu, '更新番号')
    .replace(/\bdigest\b|\bhash\b/gu, '照合用の値').replace(/\bfile\b/gu, 'ファイル')
    .replace(/\btext\b/gu, '文章').replace(/\bruntime\b/gu, '実行環境')
    .replace(/\bfixture\b/gu, '試験用データ').replace(/\bscope\b/gu, '許可する範囲')
    .replace(/\bcredential\b/gu, '接続用の認証情報').replace(/\bAgent\b/gu, 'エージェント')
    .replace(/\bTool\b/gu, 'ツール').replace(/\bLLM\b/gu, 'AIモデル');
}

export function skyError(value: unknown): { message: string; next: string; reference?: string } {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  const code = raw.trim();
  const status = value && typeof value === 'object' && 'status' in value ? value.status : undefined;
  const knownCodes = ['SIGNED_OUT', 'UNAUTHORIZED', 'authentication_required', 'sign_in_required',
    'REVISION_CONFLICT', 'revision_conflict', 'CONFLICT', 'accessibility_permission_required',
    'lease_expired', 'capture_expired', 'target_expired', 'EXPIRED', 'READ_FAILED', 'INVALID_OUTPUT',
    'NOT_FOUND', 'UNAVAILABLE', 'INVALID_INPUT', 'TOO_LARGE'];
  const reference = knownCodes.includes(code) ? code : undefined;
  if (status === 401 || /^(SIGNED_OUT|UNAUTHORIZED|authentication_required|sign_in_required)$/u.test(code))
    return { message: '本人の確認が必要です。', next: 'サインインしてから、最新の状態を読み直してください。', reference };
  if (status === 409 || /^(REVISION_CONFLICT|revision_conflict|CONFLICT)$/u.test(code))
    return { message: 'この画面を開いた後に、仕事の内容が変わりました。', next: '最新の状態を読み直し、内容を確認してから操作してください。', reference };
  if (code === 'accessibility_permission_required')
    return { message: '選んだアプリの文章を読む許可がありません。', next: 'Macの「システム設定」→「プライバシーとセキュリティ」→「アクセシビリティ」で、Skyを動かすアプリの許可を確認してください。', reference };
  if (/^(lease_expired|capture_expired|target_expired|EXPIRED)$/u.test(code))
    return { message: '接続または読み取った内容の有効時間が過ぎました。', next: '対象を選び直し、内容をもう一度確認してください。', reference };
  if (/^(AbortError|TimeoutError)$/u.test(value instanceof Error ? value.name : '') || /timeout|timed out|Failed to fetch|NetworkError|fetch failed/iu.test(code))
    return { message: '処理の結果を受け取れませんでした。', next: '同じ操作を重ねず、接続を確認して最新の状態を読み直してください。', reference };
  // Preserve actionable Japanese validation, but never echo raw payloads, paths or credentials.
  const readable = /[ぁ-んァ-ヶ一-龯]/u.test(code) && code.length <= 400
    && !/[{}<>]|https?:|file:|\/Users\/|\/Volumes\/|Bearer\s|sk-[a-z0-9]|token\s*[:=]|password\s*[:=]/iu.test(code)
    && !/[a-f0-9]{32}|\b[A-Za-z]+(?:_[A-Za-z0-9]+)+\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\d{3}[- ]\d{3,4}[- ]\d{4}/u.test(code);
  return { message: readable ? skySystemWords(code) : '操作の結果を確認できませんでした。',
    next: readable && /してください|確認できます|必要です/u.test(code) ? '' : '最新の状態を読み直してください。外部への送信や支払いは、結果を確認してからやり直してください。', reference };
}
