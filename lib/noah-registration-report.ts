import { NoahAgentError } from './noah-agent-upload.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
import { resolveNoahProvider, NoahProviderInformationError } from './noah-provider-resolve.ts';

export type NoahRegistrationReport = {
  state: 'identified' | 'needs-information' | 'unavailable';
  title: string; items: { field: string; detail: string }[];
};
/** Read public connection definitions only. No handshake, registration, or Work is started. */
export async function noahRegistrationReport(entry: DirectoryEntry, fetcher: typeof fetch = fetch): Promise<NoahRegistrationReport> {
  try {
    await resolveNoahProvider(entry, fetcher);
    return { state: 'identified', title: '接続先の情報を確認しました', items: [{ field: '登録・接続', detail: '登録時に認証・実行環境・利用条件を確認します。接続はまだ開始していません。' }] };
  } catch (error) {
    if (error instanceof NoahProviderInformationError) return { state: 'needs-information', title: '登録に必要な情報が不足しています', items: [{ field: error.field, detail: error.message }] };
    return { state: 'unavailable', title: '接続情報を確認できませんでした', items: [{ field: '提供元への確認', detail: error instanceof NoahAgentError ? error.message : '通信に失敗しました。情報が不足しているかは未判定です。時間をおいて確認し直してください。' }] };
  }
}
