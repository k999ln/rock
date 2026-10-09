import styles from './home-screen.module.css';

// A projected, woven torus. Decorative geometry only; never a runtime indicator.
const strands = Array.from({ length: 64 }, (_, row) => {
  const v = (row / 64) * Math.PI * 2;
  const points = Array.from({ length: 161 }, (_, i) => {
    const u = (i / 160) * Math.PI * 2;
    const radius = 137 + 49 * Math.cos(v + u * 2);
    const x = radius * Math.cos(u),
      y = radius * Math.sin(u),
      z = 49 * Math.sin(v + u * 2);
    const a = y * 0.57 - z * 0.82,
      b = y * 0.82 + z * 0.57;
    const c = x * 0.91 + b * 0.41,
      d = -x * 0.41 + b * 0.91;
    const scale = 520 / (520 - d);
    return `${(260 + (c * 0.93 - a * 0.37) * scale).toFixed(1)},${(260 + (c * 0.37 + a * 0.93) * scale).toFixed(1)}`;
  });
  return {
    path: `M${points.join('L')}Z`,
    opacity: 0.22 + 0.5 * ((Math.sin(v) + 1) / 2),
  };
});
export default function HomeField({ mode }: { mode: number }) {
  return (
    <div className={styles.field} data-mode={mode} aria-hidden="true">
      <div className={styles.fieldGrid} />
      <span className={styles.fieldCoordinate}>R / 001</span>
      <svg className={styles.sculpture} viewBox="0 0 520 520" fill="none">
        <defs>
          <linearGradient
            id="home-fiber"
            x1="70"
            y1="50"
            x2="450"
            y2="470"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#efffcf" />
            <stop offset=".5" stopColor="#c1ec82" />
            <stop offset="1" stopColor="#546c37" />
          </linearGradient>
        </defs>
        {strands.map((strand, i) => (
          <path
            key={i}
            d={strand.path}
            stroke="url(#home-fiber)"
            strokeWidth="0.85"
            opacity={strand.opacity}
          />
        ))}
      </svg>
      <span className={styles.fieldLabel}>
        {
          ['IDEA → POSSIBILITY', 'QUESTION → CLARITY', 'FRAGMENTS → ORDER'][
            mode
          ]
        }
      </span>
      <span className={styles.fieldCaption}>形になる、その手前。</span>
    </div>
  );
}
