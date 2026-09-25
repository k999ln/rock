import './r5.css';

const menu = document.querySelector('.mobile-menu');
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { menu.open = false; }));

const items = document.querySelectorAll('.reveal');
if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  items.forEach((item) => item.classList.add('visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
  items.forEach((item) => observer.observe(item));
}
