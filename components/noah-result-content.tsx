'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Download,
  Copy,
  Share2,
  ExternalLink,
  FileText,
  ListChecks,
  UserRound,
  Image as ImageIcon,
} from 'lucide-react';
import { useNoahLocale } from './noah-locale';
import { noahLinkParts } from '@/lib/noah-ask-view';
import {
  noahResultPresentation,
  noahResultUrl,
  noahResultImageLinks,
} from '@/lib/noah-result-presentation';
import {
  noahImageFile,
  noahResultImage,
  noahRasterMime,
  type NoahReceivedResult,
  type NoahResultImage,
} from '@/lib/noah-result-media';
import styles from './noah-result-content.module.css';
function saveFile(file: Blob, name: string) {
  const url = URL.createObjectURL(file),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function Linked({ text }: { text: string }) {
  return (
    <>
      {noahLinkParts(text).map((p, i) =>
        'href' in p ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {p.href}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
function ImageResult({
  image,
  remote,
}: {
  image?: NoahResultImage;
  remote?: string;
}) {
  const { t } = useNoahLocale();
  const [notice, setNotice] = useState(''),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [broken, setBroken] = useState(false),
    [remoteFile, setRemoteFile] = useState<File | null>(null),
    [remoteSrc, setRemoteSrc] = useState<string | undefined>(),
    [loading, setLoading] = useState(Boolean(remote));
  const inlineFile = useMemo(() => {
    try {
      return image ? noahImageFile(image) : null;
    } catch {
      return null;
    }
  }, [image]);
  useEffect(() => {
    if (!remote) return;
    let mounted = true;
    let objectUrl: string | undefined;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15_000);
    void (async () => {
      try {
        const response = await fetch(remote, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          redirect: 'error',
          signal: controller.signal,
        });
        if (
          !response.ok ||
          !response.body ||
          Number(response.headers.get('content-length')) > 8 * 1024 * 1024
        )
          throw Error();
        const reader = response.body.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.length;
            if (size > 8 * 1024 * 1024) throw Error();
            chunks.push(next.value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const mime = noahRasterMime(bytes);
        if (!mime) throw Error();
        if (!controller.signal.aborted) {
          const prepared = new File(
            [bytes],
            `noah-image.${mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`,
            { type: mime },
          );
          objectUrl = URL.createObjectURL(prepared);
          setRemoteSrc(objectUrl);
          setRemoteFile(prepared);
        }
      } catch {
        if (mounted) setError(true);
      } finally {
        clearTimeout(timer);
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      controller.abort();
      clearTimeout(timer);
    };
  }, [remote]);
  const file = inlineFile ?? remoteFile,
    src = image ? `data:${image.mimeType};base64,${image.data}` : remoteSrc;
  if (!image && !remote) return null;
  async function save(download = false) {
    if (!file || busy) return;
    setBusy(true);
    setNotice('');
    setError(false);
    try {
      // The File is prepared before the tap, so native share retains user activation.
      if (
        !download &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        setNotice('写真への保存先を選んでください');
        await navigator.share({ files: [file] });
        setNotice('端末の保存メニューを閉じました');
      } else {
        saveFile(file, file.name);
        setNotice('保存を開始しました');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') setNotice('');
      else {
        setError(true);
        setNotice('保存できませんでした。画像を開いて保存してください');
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <figure className={styles.imageResult}>
      {!broken && src ? (
        <Image
          unoptimized
          width={1200}
          height={1200}
          src={src}
          alt={t('届いた画像')}
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
          crossOrigin={remote ? 'anonymous' : undefined}
        />
      ) : (
        !loading && <p>{t('画像を表示できませんでした')}</p>
      )}
      <figcaption>
        <button
          className={styles.primary}
          disabled={busy || !file}
          onClick={() => void save()}
        >
          <Download size={18} />
          {t('画像を保存')}
        </button>
        {error && (
          <button
            className={styles.secondary}
            disabled={busy || !file}
            onClick={() => void save(true)}
          >
            {t('画像をダウンロード')}
          </button>
        )}
        {remote && (!file || error) && (
          <a href={remote} target="_blank" rel="noopener noreferrer nofollow">
            {t('画像を開く')}
          </a>
        )}
      </figcaption>
      {loading && <output>{t('読み込んでいます…')}</output>}
      {remote && !loading && !file && (
        <p>{t('保存できませんでした。画像を開いて保存してください')}</p>
      )}
      {notice && <p role={error ? 'alert' : 'status'}>{t(notice)}</p>}
    </figure>
  );
}
export function NoahResultPreview({ result }: { result: NoahReceivedResult }) {
  const { t } = useNoahLocale(),
    view = noahResultPresentation(result);
  const image = result.images?.find((img, i) =>
    noahResultImage({ type: 'image', ...img }, i),
  );
  const remote = image
    ? undefined
    : (result.imageUrls ?? noahResultImageLinks(result.text))[0];
  const Icon =
    view.kind === 'account'
      ? UserRound
      : view.kind === 'list'
        ? ListChecks
        : view.kind === 'image'
          ? ImageIcon
          : FileText;
  return (
    <div className={styles.preview}>
      {image || remote ? (
        <Image
          unoptimized
          width={1200}
          height={1200}
          className={styles.thumbnail}
          src={image ? `data:${image.mimeType};base64,${image.data}` : remote!}
          referrerPolicy="no-referrer"
          crossOrigin={remote ? 'anonymous' : undefined}
          alt={t('届いた画像')}
          loading="lazy"
        />
      ) : (
        <div className={styles.previewIcon}>
          <Icon size={26} />
        </div>
      )}
      <strong>{t(result.delivery==='missing_image'?'画像が未受取':view.title)}</strong>
      {view.count !== undefined && (
        <span className={styles.badge}>
          {t(view.kind === 'image' ? '{count}枚' : '{count}件', {
            count: view.count,
          })}
        </span>
      )}
      {view.summary && (
        <p className={styles.previewText}>
          {[
            '成果の一部を表示しています',
            '詳細を開いて内容を確認できます',
          ].includes(view.summary)
            ? t(view.summary)
            : view.summary}
        </p>
      )}
      {view.kind === 'list' && (
        <ul>
          {view.cards.slice(0, 3).map((card, i) => (
            <li key={i}>{card.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default function NoahResultContent({
  result,
  id,
  compact = false,
}: {
  result: NoahReceivedResult;
  id: string;
  compact?: boolean;
}) {
  const { t } = useNoahLocale(),
    view = useMemo(() => noahResultPresentation(result), [result]);
  const [limit, setLimit] = useState(8),
    [notice, setNotice] = useState('');
  // 「一部」の注記は、下の注記（result.truncated）が出すので、ここでは二度出さない。
  const summary =
    view.summary === '成果の一部を表示しています'
      ? ''
      : view.summary === '詳細を開いて内容を確認できます'
        ? t(view.summary)
        : view.summary;
  function save() {
    saveFile(
      new Blob([result.text], { type: 'text/plain;charset=utf-8' }),
      `noah-${id}.txt`,
    );
    setNotice('保存を開始しました');
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ text: result.text });
      else await copy();
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError'))
        setNotice('通信できませんでした。もう一度試してください。');
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      setNotice('コピーしました');
    } catch {
      setNotice('通信できませんでした。もう一度試してください。');
    }
  }
  if (compact) return <NoahResultPreview result={result} />;
  return (
    <section className={styles.content} aria-label={t('成果')}>
      {result.delivery==='missing_image'&&<output>{t('画像は届いていません。届いた文章を確認できます。再実行は自動では行いません。')}</output>}
      <header className={styles.heading}>
        <h2>{t(view.title)}</h2>
        {view.count !== undefined && (
          <span className={styles.badge}>
            {t(view.kind === 'image' ? '{count}枚' : '{count}件', {
              count: view.count,
            })}
          </span>
        )}
      </header>
      {view.kind === 'text' && (
        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => void copy()}>
            <Copy size={17} />
            {t('本文をコピー')}
          </button>
          <button className={styles.secondary} onClick={save}>
            <Download size={17} />
            {t('本文を保存')}
          </button>
        </div>
      )}
      {summary && (
        <div
          className={
            view.kind === 'account' ? styles.accountName : styles.prose
          }
          dir="auto"
        >
          <Linked text={summary} />
        </div>
      )}
      {view.fields.length > 0 && (
        <dl className={styles.fields}>
          {view.fields.map((field, i) => (
            <div key={i}>
              <dt>{t(field.label)}</dt>
              <dd dir="auto">
                {noahResultUrl(field.value) ? (
                  <a
                    href={noahResultUrl(field.value)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {t('リンク')} <ExternalLink size={14} />
                  </a>
                ) : field.label === '状態' && field.value === 'active' ? (
                  t('利用中')
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {view.kind === 'image' && (
        <div className={styles.gallery}>
          {result.images?.map((image, i) => (
            <ImageResult key={`${i}:${image.name}`} image={image} />
          ))}
          {(
            result.imageUrls ??
            (result.images?.length ? [] : noahResultImageLinks(result.text))
          ).map((url) => (
            <ImageResult key={url} remote={url} />
          ))}
        </div>
      )}
      {view.kind === 'list' && (
        <>
          <ul className={styles.cards}>
            {view.cards.slice(0, limit).map((card, i) => (
              <li key={i}>
                <span className={styles.number}>{i + 1}</span>
                <div>
                  <h3 dir="auto">{card.title}</h3>
                  {card.text && <p dir="auto">{card.text}</p>}
                  {card.href && (
                    <a
                      href={card.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {t('提供元を開く')} <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {limit < view.cards.length && (
            <button
              className={styles.secondary}
              onClick={() => setLimit((n) => n + 12)}
            >
              {t('続きを表示')}
            </button>
          )}
        </>
      )}
      {result.truncated && (
        <p className={styles.muted}>{t('成果の一部を表示しています')}</p>
      )}
      {result.attachments >
        (result.images?.length ?? 0) + (result.imageUrls?.length ?? 0) && (
        <p className={styles.muted}>{t('添付の内容は保存されていません')}</p>
      )}
      {view.kind !== 'image' && (
        <button className={styles.secondary} onClick={() => void share()}>
          <Share2 size={17} />
          {t('共有')}
        </button>
      )}
      {view.raw && (
        <details className={styles.raw}>
          <summary>{t('元のデータ')}</summary>
          <button className={styles.secondary} onClick={save}>
            <Download size={17} />
            {t('保存')}
          </button>
          <pre dir="auto">{result.text}</pre>
        </details>
      )}
      {notice && <output>{t(notice)}</output>}
    </section>
  );
}
