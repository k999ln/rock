'use client';
/**
 * Agent の詳細の、見ただけでやる事がわかる部分。上から「こんな事を頼めます」（道具ごとの説明と要る情報）・「使い方」（3 つ）・「安全のために」。
 * 本人 2026-11-28「ちゃんとした大手のサイトみたいに見ただけで特に説明なくともやることがわかるような UIUX にして」「そういうレポジトリない？」。
 * 並びの参考: Flathub のアプリの頁（flathub-infra/website、Apache-2.0）の「大きい操作 1 つ → 数字の札 → 中身」、
 * Docker MCP Hub の「Use cases」（道具を、する事の文で並べる）、Chrome ウェブストアの「プライバシー」。コードは借りていない。
 * 道具の説明は、提供者が書いた文のまま（spec-74）。日本語の道具名は、道具の札（0060）が本番に入った後、工程の名前として届く。
 */
import { useId } from 'react';
import type { NoahStep } from '@/lib/noah-steps';
import { noahPlainNeedsLine, noahPlainUses } from '@/lib/noah-detail-plain';
import { useNoahLocale } from './noah-locale';
import styles from './noah-detail-plain.module.css';

const SHOWN = 4;

function Needs({ needs }: { needs: readonly string[] }) {
  const { t } = useNoahLocale();
  const { required, optional } = noahPlainNeedsLine(needs);
  return <p className={styles.needs}>{t('要る情報')}: {required.length > 0
    ? <>{required.join('・')}{optional > 0 && t('（ほかに任意 {count} 個）', { count: optional })}</>
    : t('なし（任意 {count} 個）', { count: optional })}</p>;
}

export default function NoahDetailPlain({ steps, host, provider, signedIn, connected = false, uses: showUses = true }: {
  steps?: readonly NoahStep[]; host: string | null; provider: string; signedIn: boolean; connected?: boolean; uses?: boolean;
}) {
  const { t } = useNoahLocale();
  const id = useId();
  const uses = showUses ? noahPlainUses(steps) : [];
  return <>
    {uses.length > 0 && <section className={styles.section} aria-labelledby={`${id}-uses`}>
      <h2 id={`${id}-uses`}>{t('こんな事を頼めます')}</h2>
      <div className={styles.uses}>{uses.slice(0, SHOWN).map((use) => <article key={use.key} className={styles.use}>
        {use.name && <h3>{use.name}</h3>}
        {use.text && <p>{use.text}</p>}
        {use.needs.length > 0 && <Needs needs={use.needs} />}
      </article>)}</div>
      {uses.length > SHOWN && <a className={styles.more} href="#noah-detail-more">{t('ほかに {count} 個（下の「操作の流れと道具」）', { count: uses.length - SHOWN })}</a>}
    </section>}
    {!connected && <section className={styles.section} aria-labelledby={`${id}-how`}>
      <h2 id={`${id}-how`}>{t('使い方')}</h2>
      <ol className={styles.steps}>
        <li><strong>{t('「接続」を押す')}</strong><span>{t(signedIn ? 'すぐにつながります。' : '初めての時は、パスキーで登録します。')}</span></li>
        <li><strong>{t('やる事を選んで、要る情報を入れる')}</strong><span>{t('入れた内容だけが、この Agent へ送られます。')}</span></li>
        <li><strong>{t('結果がこの画面に出る')}</strong><span>{t('結果は「仕事」に残り、保存もできます。')}</span></li>
      </ol>
    </section>}
    <section className={styles.section} aria-labelledby={`${id}-safe`}>
      <h2 id={`${id}-safe`}>{t('安全のために')}</h2>
      <ul className={styles.safety}>
        {host && <li>{t('入力は {host} へ送られます。Noah が送るのは、あなたが入力した内容だけです。', { host })}</li>}
        <li>{t('Noah が作った物ではありません（提供: {provider}）。', { provider })}</li>
        <li>{t('つないだ後も、いつでもやめられます。')}</li>
      </ul>
    </section>
  </>;
}
