'use client';
import OSHeader from '@/components/os-header';
import './game-companion.css';
export default function GameCompanion() {
  return <div className="game-companion">
    <OSHeader title="Game" />
    <main>
      <p className="game-eyebrow">ROCKSTAROS · WORLD BRIDGE</p>
      <h1>現実とゲームを、<br />ひとつの続きに。</h1>
      <p>現実で作ったものをゲーム内の端末へ。ゲームの中で生まれた依頼を、現実の作業へ。RockstarOSがカードと確認記録を引き継ぎます。</p>
      <section aria-labelledby="bridge-title">
        <h2 id="bridge-title">Macで境界を試す</h2>
        <p>現実側でカードを保存・承認し、ゲーム側の試験画面で確認。その記録を現実側で検収します。ゲーム側から依頼の下書きを返すこともできます。</p>
        <a className="game-primary" href="http://127.0.0.1:5216/" target="_blank" rel="noopener noreferrer">Macの往復試験を開く ↗</a>
        <p>このMacで開発用bridgeを起動している場合に使えます。起動コマンド: <code>npm run game:bridge</code></p>
        <p>ゲーム側はFiveM用と同じNUIを使う試験表示です。実FiveM・GTA VI・Mini／Pro実機は未受入です。試験用の仕事と履歴はローカルに保存し、本番Zemaや実サービスを実行しません。</p>
      </section>
      <section aria-labelledby="next-title">
        <h2 id="next-title">ゲーム世界への接続</h2>
        <p>FiveM用resourceは、管理者が指定したplayerだけにカードを届けます。現実側の承認、内容の一致、確認記録、停止を共通の接続契約で扱います。ゲームからの依頼は下書きに留め、現実の送信・支払い・機器操作へ自動変換しません。</p>
      </section>
    </main>
  </div>;
}
