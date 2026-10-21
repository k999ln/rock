(() => {
  const root = document.documentElement;
  const body = document.body;
  root.classList.add('site-enhanced');

  const progress = document.createElement('div');
  progress.className = 'site-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', 'Page scroll progress');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.innerHTML = '<span></span>';
  body.prepend(progress);

  const headers = [...document.querySelectorAll('.site-header, .apple-home-nav, .rocket-nav, .launch-nav')];
  const internalLinks = [...document.querySelectorAll('a[href^="#"]')].filter((link) => link.getAttribute('href').length > 1);
  const linkedSections = internalLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter((section, index, sections) => section && sections.indexOf(section) === index);

  let ticking = false;
  const updateScrollState = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    root.style.setProperty('--site-scroll', ratio.toFixed(4));
    progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    headers.forEach((header) => header.classList.toggle('is-scrolled', window.scrollY > 18));
    ticking = false;
  };
  const requestScrollUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateScrollState);
    }
  };
  updateScrollState();
  addEventListener('scroll', requestScrollUpdate, { passive: true });
  addEventListener('resize', requestScrollUpdate, { passive: true });

  if ('IntersectionObserver' in window) {
    const revealTargets = [...document.querySelectorAll('main > section, .article > section, .home-tile, .preorder-card')];
    revealTargets.forEach((target) => target.classList.add('site-reveal'));
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach((target) => revealObserver.observe(target));

    const navigationObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        internalLinks.forEach((link) => {
          const active = link.getAttribute('href') === `#${entry.target.id}`;
          link.classList.toggle('is-current', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: 0 });
    linkedSections.forEach((section) => navigationObserver.observe(section));
  } else {
    document.querySelectorAll('main > section, .article > section, .home-tile, .preorder-card').forEach((target) => target.classList.add('site-reveal', 'is-visible'));
  }

  const menus = [...document.querySelectorAll('details.site-menu')];
  menus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      if (!menu.open) {
        if (!menus.some((item) => item.open)) body.classList.remove('has-open-menu');
        return;
      }
      menus.forEach((other) => { if (other !== menu) other.removeAttribute('open'); });
      body.classList.add('has-open-menu');
    });
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.removeAttribute('open')));
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('details.site-menu')) menus.forEach((menu) => menu.removeAttribute('open'));
    if (!menus.some((menu) => menu.open)) body.classList.remove('has-open-menu');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      menus.forEach((menu) => menu.removeAttribute('open'));
      body.classList.remove('has-open-menu');
    }
  });

  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const section = carousel.closest('section');
    const previous = section?.querySelector('[data-carousel-prev]');
    const next = section?.querySelector('[data-carousel-next]');
    const cards = [...carousel.children];
    const updateControls = () => {
      const max = Math.max(0, carousel.scrollWidth - carousel.clientWidth - 2);
      if (previous) previous.disabled = carousel.scrollLeft <= 2;
      if (next) next.disabled = carousel.scrollLeft >= max;
    };
    const move = (direction) => {
      const card = cards[0];
      const gap = Number.parseFloat(getComputedStyle(carousel).columnGap || '0');
      carousel.scrollBy({ left: direction * ((card?.getBoundingClientRect().width || carousel.clientWidth * 0.8) + gap), behavior: 'smooth' });
    };
    previous?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
    carousel.addEventListener('scroll', updateControls, { passive: true });
    addEventListener('resize', updateControls, { passive: true });
    updateControls();
  });

  const liveRegion = document.createElement('span');
  liveRegion.className = 'site-live-region';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  body.append(liveRegion);
  document.querySelectorAll('.currency-toggle-button').forEach((button) => {
    button.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const panel = button.closest('.price-panel, .pro-price-card, .preorder-card') || document;
        const displayed = panel.querySelector('.price-value, .preorder-price strong');
        liveRegion.textContent = `${button.textContent.trim()} selected${displayed ? `: ${displayed.textContent.trim()}` : ''}`;
      });
    });
  });

  if (matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    document.querySelectorAll('.home-promo, .pro-hero, .film-hero').forEach((hero) => {
      hero.addEventListener('pointermove', (event) => {
        const bounds = hero.getBoundingClientRect();
        hero.style.setProperty('--pointer-x', ((event.clientX - bounds.left) / bounds.width - 0.5).toFixed(3));
        hero.style.setProperty('--pointer-y', ((event.clientY - bounds.top) / bounds.height - 0.5).toFixed(3));
      });
      hero.addEventListener('pointerleave', () => {
        hero.style.setProperty('--pointer-x', '0');
        hero.style.setProperty('--pointer-y', '0');
      });
    });
  }
})();
