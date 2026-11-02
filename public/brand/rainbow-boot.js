/* Decorative startup only: never gates mounting, focus, input or navigation. */
(() => {
  const launch = () => {
    const logo = document.querySelector('.os-header .os-brand img');
    if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (!logo || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (sessionStorage.getItem('rainbow-boot-20261025')) return;
      sessionStorage.setItem('rainbow-boot-20261025', 'seen');
    } catch { /* Storage is optional; the app remains usable. */ }

    const root = document.createElement('span');
    root.id = 'rainbow-boot-ui';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<canvas></canvas><style>#rainbow-boot-ui{position:absolute;pointer-events:none;overflow:hidden;background:#fff;contain:strict}#rainbow-boot-ui canvas{display:block;width:100%;height:100%}</style>';
    const host = logo.parentElement;
    const previousPosition = host.style.position;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(root);
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const image = new Image();
    const size = 96;
    const ink = document.createElement('canvas');
    ink.width = ink.height = size;
    const ic = ink.getContext('2d', { willReadFrequently: true });
    const tau = Math.PI * 2;
    const colors = ['#ffad06', '#ff2458', '#a80bd0', '#1757fb', '#129eae', '#21b846', '#e77718'];
    const rotations = colors.map((_, k) => [Math.cos(k * tau / 6), Math.sin(k * tau / 6)]);
    // Cache the seven soft light heads once; no per-segment blur/filter/shadow.
    const glows = colors.map(color => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 32;
      const context = sprite.getContext('2d');
      if (!context) return null;
      const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(.2, '#fffdf7');
      gradient.addColorStop(.48, color);
      gradient.addColorStop(1, color + '00');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
      return sprite;
    });
    const buckets = Array.from({ length: 85 }, () => []);
    let pixels, frame = 0, deadline = 0, start, last = -Infinity, revealed = -1, done = false;
    let width, height, observer;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const clamp = x => Math.max(0, Math.min(1, x));
    const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', finish);
      window.removeEventListener('pointerdown', finish, true);
      window.removeEventListener('keydown', finish, true);
      motion.removeEventListener('change', finish);
      image.onload = image.onerror = null;
      root.remove();
      host.style.position = previousPosition;
      pixels = null;
      buckets.length = 0;
    }
    function onVisibility() { if (document.hidden) finish(); }
    function resize() {
      if (!logo.isConnected) { finish(); return; }
      width = logo.clientWidth;
      height = logo.clientHeight;
      if (!width || !height) { finish(); return; }
      root.style.left = `${logo.offsetLeft}px`;
      root.style.top = `${logo.offsetTop}px`;
      root.style.width = `${width}px`;
      root.style.height = `${height}px`;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function curve(k, angle) {
      if (k === 6) return { x: .5 + .141 * Math.sin(angle), y: .494 - .141 * Math.cos(angle) };
      const [cos, sin] = rotations[k], x = .083 * Math.sin(angle), y = -.215 - .147 * Math.cos(angle);
      return { x: .5 + x * cos - y * sin, y: .494 + x * sin + y * cos };
    }
    function prepare() {
      ic.drawImage(image, 0, 0, size, size);
      const source = ic.getImageData(0, 0, size, size);
      pixels = ic.createImageData(size, size);
      // Compute arrival once, only for colored pixels. No full image scan in draw().
      for (let i = 0; i < size * size; i++) {
        const j = i * 4;
        if (!source.data[j + 3] || Math.min(source.data[j], source.data[j + 1], source.data[j + 2]) > 245) continue;
        const x = (i % size) / size, y = Math.floor(i / size) / size;
        const dx = x - .5, dy = y - .494;
        let best = Infinity, phase = 0;
        for (let k = 0; k < 7; k++) {
          const [cos, sin] = rotations[k];
          const u = k === 6 ? dx / .141 : (dx * cos + dy * sin) / .083;
          const v = k === 6 ? -dy / .141 : -(-dx * sin + dy * cos + .215) / .147;
          const angle = (Math.atan2(u, v) + tau) % tau, p = curve(k, angle);
          const distance = (p.x - x) ** 2 + (p.y - y) ** 2;
          if (distance < best) { best = distance; phase = angle / tau; }
        }
        pixels.data[j] = source.data[j];
        pixels.data[j + 1] = source.data[j + 1];
        pixels.data[j + 2] = source.data[j + 2];
        buckets[Math.min(84, Math.floor(phase * 84))].push([j, source.data[j + 3]]);
      }
      ic.clearRect(0, 0, size, size);
    }
    function point(k, angle, t, scale) {
      const p = curve(k, angle), m = smooth((t - 1.7) / 1.1), phase = angle + k * .67 + t * .6;
      const ox = Math.cos(phase) * (scale * .3 + k * scale * .01);
      const oy = Math.sin(phase) * scale * .32, oz = Math.sin(phase + .7) * scale * .3;
      const z = (oy * .71 + oz * .7) * (1 - m), perspective = 700 / (700 - z);
      return { x: width / 2 + (ox * (1 - m) + (p.x - .5) * scale * m) * perspective,
        y: height * .494 + ((oy * .7 - oz * .71) * (1 - m) + (p.y - .494) * scale * m) * perspective, z };
    }
    function draw(now) {
      if (done) return;
      if (!logo.isConnected || document.hidden) { finish(); return; }
      if (start === undefined) start = now;
      const t = (now - start) / 1000;
      if (t >= 6.8) { finish(); return; }
      frame = requestAnimationFrame(draw);
      if (now - last < 1000 / 30) return;
      last = now;
      const scale = Math.min(width, height), trace = clamp((t - 2.8) / 2.8);
      ctx.clearRect(0, 0, width, height);
      if (t >= 2.8) {
        const next = Math.floor(trace * 84);
        if (next > revealed) {
          for (let b = revealed + 1; b <= next; b++) for (const [j, alpha] of buckets[b]) pixels.data[j + 3] = alpha;
          revealed = next;
          ic.putImageData(pixels, 0, 0);
        }
        // The traced source pixels remain the logo; there is no separate logo fade-in.
        ctx.drawImage(trace === 1 ? image : ink, (width - scale) / 2, (height - scale) / 2, scale, scale);
      }
      const fade = 1 - smooth((t - 5.6) / .35);
      if (fade <= 0) return;
      const angle = t < 2.8 ? (t - 2.8) * 2.3 : trace * tau;
      const heads = colors.map((_, k) => ({ k, p: point(k, angle, t, scale) })).sort((a, b) => a.p.z - b.p.z);
      // Four continuous trail paths per light, rather than 602 filtered/shadowed strokes.
      for (const { k, p } of heads) {
        ctx.strokeStyle = colors[k];
        ctx.lineCap = 'round';
        for (let band = 3; band >= 0; band--) {
          ctx.globalAlpha = smooth(t / .6) * fade * (1 - band / 4) ** 2 * .65;
          ctx.lineWidth = Math.max(.6, scale * .014 * (1 - band * .17));
          ctx.beginPath();
          for (let j = 0; j <= 5; j++) {
            const q = point(k, angle - (band / 4 + j / 20) * .65, t, scale);
            if (!j) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = smooth(t / .6) * fade;
        const radius = Math.max(1.5, scale * .035);
        if (glows[k]) ctx.drawImage(glows[k], p.x - radius, p.y - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
    }
    if (!ctx || !ic) { finish(); return; }
    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    if (done) return;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', finish, { once: true });
    // Interacting dismisses decoration without cancelling or delaying that interaction.
    window.addEventListener('pointerdown', finish, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', finish, { once: true, capture: true });
    motion.addEventListener('change', finish);
    deadline = setTimeout(finish, 8500);
    image.onload = () => {
      if (done) return;
      try { prepare(); frame = requestAnimationFrame(draw); } catch { finish(); }
    };
    image.onerror = finish;
    image.src = '/brand/rainbow-logo-512.png';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
  else launch();
})();
