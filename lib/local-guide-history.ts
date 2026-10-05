import { executeTracked, OperationRequestError, operationFailureCode } from './operations-client';

// Only pure, browser-local guides may use this fallback. Never wrap remote work.
export async function executeLocalGuide<T extends { output: string }>(options: {
  tool: 'rockstar-legal-intake' | 'rockstar-patent-assistant';
  saveHistory: boolean;
  inputBytes: number;
  task: () => T;
}): Promise<{ result: T; warning: string; needsSignin: boolean }> {
  let result: T | undefined;
  let attempted = false;
  const once = () => {
    if (!attempted) {
      attempted = true;
      result = options.task();
    }
    return result!;
  };
  if (!options.saveHistory)
    return { result: once(), warning: '', needsSignin: false };
  try {
    const tracked = await executeTracked({
      tool: options.tool,
      transport: 'browser',
      sample: false,
      inputBytes: options.inputBytes,
      task: once,
    });
    return { ...tracked, needsSignin: false };
  } catch (error) {
    // A failed local calculation is not a failed history request. Never repeat it.
    if (attempted && result === undefined) throw error;
    const needsSignin =
      error instanceof OperationRequestError && error.status === 401;
    return {
      result: once(),
      needsSignin,
      warning: needsSignin
        ? '端末内の結果を作成しました。履歴は未保存です。別タブでサインインし、この画面から再実行してください。'
        : `端末内の結果を作成しましたが、実行履歴の保存を確認できません。結果を保存し、履歴を確認してください。（保存確認: ${operationFailureCode(error)}）`,
    };
  }
}
