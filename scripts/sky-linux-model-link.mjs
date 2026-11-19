import { parseLinuxModel } from '../lib/sky-linux-models.ts';

/** Only fixed Hugging Face metadata is read; no owner request or credential is sent. */
export async function inspectLinuxModelLink(link, { promptFormat = 'chatml', fetcher = fetch } = {}) {
  if (typeof link !== 'string' || link.length > 600) throw new Error('AIのファイルへのリンクを貼ってください。');
  let url;
  try { url = new URL(link); } catch { throw new Error('Hugging FaceのAIファイルへのリンクを貼ってください。'); }
  const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)\/(?:blob|resolve)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+\.gguf)$/u);
  if (url.origin !== 'https://huggingface.co' || url.username || url.password || url.hash || !match || match.some(part => part.includes('..')))
    throw new Error('Hugging Faceの「Files」で、使いたいGGUFファイルを開き、そのリンクを貼ってください。');
  if (!['chatml', 'llama3'].includes(promptFormat)) throw new Error('対応する文章形式を選んでください。');
  const [, author, repository, revision, filename] = match;
  let response;
  try { response = await fetcher(`https://huggingface.co/api/models/${author}/${repository}/revision/${revision}?blobs=true`, { redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('AIの配布情報を取得できませんでした。通信を確認して、もう一度お試しください。'); }
  if (!response.ok) throw new Error('AIの配布情報を読めません。ログイン不要の公開ファイルか確認してください。');
  let body = '', bytes = 0; const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) { await response.body.cancel?.().catch(() => {}); throw new Error('配布情報が大きいため、設定ファイルから追加してください。'); }
    body += decoder.decode(chunk, { stream: true });
  }
  body += decoder.decode();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('AIの配布情報を確認できませんでした。'); }
  const file = Array.isArray(data.siblings) ? data.siblings.find(f => f.rfilename === filename) : null;
  if (data.id !== `${author}/${repository}` || typeof file?.lfs?.sha256 !== 'string' || !file?.size || !data.cardData?.license)
    throw new Error('版・容量・利用条件を取得できませんでした。配布元を確認し、対応する設定ファイルから追加してください。');
  return parseLinuxModel({ schema: 'sky.local-model/1', id: `hf-${file.lfs.sha256.slice(0, 24)}-${promptFormat}`,
    name: repository.replace(/-GGUF$/u, '').slice(0, 100), repository: `${author}/${repository}`,
    revision: data.sha, file: filename, sha256: file.lfs.sha256, bytes: file.size,
    license: data.cardData.license, promptFormat, memoryMiB: 2048 });
}
