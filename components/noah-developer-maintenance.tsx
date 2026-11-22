import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  MessageCircle,
  GitPullRequest,
  ShieldCheck,
  Mail,
} from 'lucide-react';
import styles from './noah-developer-maintenance.module.css';
export default function NoahDeveloperMaintenance({
  initialAgent = '',
}: {
  initialAgent?: string;
}) {
  const agent = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(initialAgent)
    ? initialAgent
    : '';
  const email = 'smash@avoado.si';
  const mailHref = `mailto:${email}?subject=${encodeURIComponent('Noah Agent継続改善の相談')}&body=${encodeURIComponent(`${agent ? `対象Agent: ${agent}\n\n` : ''}ご相談内容:\n\n対象リポジトリ（任意）:\n`)}`;
  return (
    <main className={styles.page}>
      <nav>
        <Link href="/noah">← タイムライン</Link>
        <Link href="/noah/publisher">
          作者の管理画面 <ArrowUpRight size={14} />
        </Link>
      </nav>
      <header className={styles.hero}>
        <span>NOAH FOR DEVELOPERS</span>
        <h1>
          ユーザーの声を、
          <br />
          <em>次のアップデートへ。</em>
        </h1>
        <p>
          コメントを読み解き、改善を提案。
          <br />
          承認した変更を、検証済みのPRで届ける運用パッケージ。
        </p>
        <a href={mailHref}>
          メールで相談する <ArrowUpRight size={17} />
        </a>
        <small>
          ご相談・お見積もりはメールで。料金・作業範囲は個別に合意します。
        </small>
      </header>
      <section className={styles.steps} aria-label="パッケージに含む作業">
        {[
          {
            Icon: MessageCircle,
            title: '声を、改善の手がかりに。',
            text: 'コメント・王冠・利用人数を読み、ユーザーの目的とつまずきを整理します。',
          },
          {
            Icon: GitPullRequest,
            title: '承認した改善を、コードへ。',
            text: '意図を確認し、必要な機能改善とリファクタリングを分離ブランチで進めます。',
          },
          {
            Icon: ShieldCheck,
            title: '動作を確かめて、届ける。',
            text: '回帰試験、変更点、未対応事項をまとめ、レビューできるPRで納品します。',
          },
        ].map(({ Icon, title, text }, i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <Icon size={23} />
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className={styles.scope}>
        <h2>変える前に、意図を合わせる。</h2>
        <p>
          どの声を採用するか、何を変えるかは開発者と決めます。リポジトリへの権限確認と見積もりの承認後に着手。納品するPRを確認し、本番への反映は開発者が判断します。
        </p>
        <div>
          <span>
            <Check size={15} />
            改善提案と優先順位
          </span>
          <span>
            <Check size={15} />
            修正・リファクタリング
          </span>
          <span>
            <Check size={15} />
            試験結果・PR納品
          </span>
        </div>
      </section>
      <section id="contact" className={styles.contact}>
        <h2>ご相談は、メールで。</h2>
        <p>
          対象のAgentと、改善したい体験や気になっているコメントをお知らせください。
        </p>
        <a href={mailHref}>
          <Mail size={18} />
          {email}
          <ArrowUpRight size={16} />
        </a>
        <small>メールアプリが開きます。内容を確認して送信してください。</small>
      </section>
    </main>
  );
}
