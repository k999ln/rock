import Link from 'next/link';
import previewData from '../data/rockstaros-preview.json';
import releaseReadiness from '../data/release-readiness.json';
import { releaseProgress } from '../lib/release-progress';
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
const qemuRelease = releaseProgress(releaseReadiness, 'qemu-developer-preview');

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
            {download.reviewCandidate.version} は公開条件{qemuRelease.text}の候補です。
            製品ライセンス、正式署名、署名後の同一候補受入、公開承認は未完了です。
            リポジトリを管理する方のGitHubアカウントで、配布候補の一覧からこの版を選んでください。
            一般向けの配布はまだ始めていません。
          </p>
          <p><a className={styles.textLink} href={download.reviewCandidate.url}>管理者向けの配布候補一覧を開く ↗</a></p>
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
