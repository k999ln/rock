import Link from 'next/link';
import previewData from '../data/rockstaros-preview.json';
import styles from '../app/rockstaros/preview.module.css';

type DownloadConfiguration = {
  publicDownloadUrl: string | null;
  reviewCandidate: null | {
    version: string;
    sourceCommit: string;
    url: string;
  };
};

const download: DownloadConfiguration = previewData;

export function PreviewDownload() {
  return (
    <div className={styles.notice}>
      {download.publicDownloadUrl ? (
        <>
          <strong>Mac向けDeveloper Previewをダウンロード</strong>
          <p>配布ページの版・署名・ハッシュを確認してから導入してください。</p>
          <p><a className={styles.textLink} href={download.publicDownloadUrl}>配布ページを開く ↗</a></p>
        </>
      ) : download.reviewCandidate ? (
        <>
          <strong>最新候補を、公開前に確認しています。</strong>
          <p>
            {download.reviewCandidate.version} は正式署名と配布準備を進めている候補です。
            候補ファイルは、リポジトリを管理する方のGitHubアカウントで開けます。
            一般向けの配布はまだ始めていません。
          </p>
          <p><a className={styles.textLink} href={download.reviewCandidate.url}>管理者向けの候補ファイルを開く ↗</a></p>
          <p className={styles.scope}>
            未署名の候補をそのままインストールすることはできません。
          </p>
        </>
      ) : (
        <><strong>配布を準備しています。</strong><p>導入できる版が用意できたら、このページで案内します。</p></>
      )}
      <p className={styles.scope}>このページの動画・従来の検証記録は9abf78a版です。</p>
      <Link className={styles.textLink} href="/rockstaros/guide#install">
        導入・初回実行・復旧の手順 ↗
      </Link>
    </div>
  );
}
