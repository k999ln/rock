import Link from 'next/link';
export default function NoahBusinessEntry() {
  return (
    <section
      aria-labelledby="business-si-title"
      style={{
        maxWidth: 960,
        margin: '20px auto',
        padding: '24px',
        border: '1px solid var(--border, #dedee4)',
        borderRadius: 16,
      }}
    >
      <p style={{ fontSize: 14, margin: '0 0 8px', opacity: 0.7 }}>
        法人の仕事を整理する
      </p>
      <h2 id="business-si-title" style={{ fontSize: 22, margin: '0 0 10px' }}>
        siの導入準備を、ここから。
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.8, margin: '0 0 16px' }}>
        作業の回数と時間から、業務の整理票と研修で聞くことを作ります。会員登録なし・無料で使えます。
      </p>
      <Link
        href="/noah/business-si"
        style={{
          display: 'inline-block',
          padding: '12px 18px',
          background: '#614595',
          color: '#fff',
          borderRadius: 10,
          textDecoration: 'none',
          fontSize: 16,
        }}
      >
        導入準備票をつくる
      </Link>
    </section>
  );
}
