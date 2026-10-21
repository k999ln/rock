'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './sky-add-zoom-prototype.module.css';

const voiceLanguages = new Set(['en', 'zh', 'fr', 'ja', 'es', 'de', 'it', 'ar', 'pt']);
const suggestions = [
  ['en', '英語'], ['es', 'スペイン語'], ['fr', 'フランス語'], ['de', 'ドイツ語'],
  ['zh', '中国語'], ['pt', 'ポルトガル語'], ['ar', 'アラビア語'],
  ['ko', '韓国語'], ['hi', 'ヒンディー語'], ['vi', 'ベトナム語'],
];

export default function SkyZoomNativeTranslationGuide() {
  const [language, setLanguage] = useState('en');
  const target = language.trim().toLowerCase().split('-')[0];
  const voiceSupported = voiceLanguages.has(target);

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.mark}>✦</span><div><strong>Sky Zoom翻訳ガイド</strong><small>Zoom標準機能の設定案内</small></div></div><span className={styles.host}>Zoom側で設定</span></header>
    <section className={styles.hero}><p className={styles.eyebrow}>日本語で話す → 相手が言語を選ぶ</p><h1>Zoomの翻訳機能を使う</h1>
      <p>Zoomに翻訳字幕とVoice Translatorがあります。Skyから別の通訳音声を作って会議へ送る操作は不要です。まず会議とアカウントで利用できるかを確認します。</p></section>
    <div className={styles.content}>
      <section className={styles.work}><h2>1. 相手の言語を確認</h2>
        <label htmlFor="zoom-target-language">言語コード</label><input id="zoom-target-language" className={styles.labInput} list="zoom-target-languages" value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={20}/>
        <datalist id="zoom-target-languages">{suggestions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</datalist>
        <p>字幕はZoomの対応言語とホスト設定の組合せで決まります。音声は{voiceSupported ? 'Zoomが現在公表する対応言語に含まれます。' : 'Zoomが現在公表するVoice Translatorの対応言語には含まれません。'} 言語コードを入力しても利用権や対応は増えません。</p>
        <p><a href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060844" target="_blank" rel="noreferrer">翻訳字幕の対応言語と条件をZoomで確認</a> · <a href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0084896" target="_blank" rel="noreferrer">Voice Translatorの対応言語と条件をZoomで確認</a></p>
      </section>
      <section className={styles.work}><h2>2. あなたのZoomで設定</h2>
        <p>Zoom会議で字幕の「話す言語」を日本語にします。翻訳字幕はホストの対応プランまたは追加利用権と、有効な会議設定が必要です。Voice TranslatorにはLive Translation add-onまたはZoomMate等の利用権が必要です。Zoomデスクトップアプリの条件も確認します。</p>
        <p>このMacで見えたアカウント表示はBasicです。追加利用権があるかはまだ確認できていません。</p>
      </section>
      <section className={styles.work}><h2>3. 相手が言語を選ぶ</h2>
        <p>相手はZoomの「字幕を表示」から翻訳先を選びます。翻訳音声が利用可能な場合は、会議中の「その他」→「Voice Translator」で聞きたい言語を選びます。複数人はそれぞれ自分の設定を選べます。</p>
        <p>Zoomの翻訳音声にない言語は、会議を予約して正式な通訳チャンネルを使う方法を検討します。通訳者・会議プラン・対象言語が必要です。<a href="https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064768" target="_blank" rel="noreferrer">Zoomの言語通訳の条件</a></p>
      </section>
      <section className={styles.work}><h2>4. 二人で確認</h2>
        <p>短い日本語を一文話し、相手側で字幕の意味と翻訳音声の聞こえ方を確認します。片方だけ使えた場合は、会議の設定・利用権・対象言語をZoomで確認します。まだ実会議での受信は検証していません。全言語対応済みとは表示しません。</p>
      </section>
      <div className={styles.labActions}><Link href="/sky/add/zoom/device">Zoomの会議メモへ戻る</Link></div>
    </div>
  </div></main>;
}
