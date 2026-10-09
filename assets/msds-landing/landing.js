(() => {
  const root = document.getElementById('msdsLanding');
  if (!root) return;
  const scenes = [...root.querySelectorAll('.landing-scene')];
  const buttons = [...root.querySelectorAll('[data-landing-slide]')];
  const heading = root.querySelector('h1');
  const pause = root.querySelector('.landing-pause');
  const wording = ['세라믹 소재 기술력을 바탕으로 혁신을 선도하는 기업', '반도체 세라믹 부품 시장을 선도하는 기업', '다층 세라믹 기판 분야의 글로벌 강소기업'];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, timer = null, paused = motion.matches;
  function fit() {
    if (!document.body.classList.contains('msds-landing-open')) return;
    let size = Math.min(42, Math.max(11, root.clientWidth / 24));
    heading.style.fontSize = size + 'px';
    while (heading.scrollWidth > heading.parentElement.clientWidth && size > 10) {
      size -= .5; heading.style.fontSize = size + 'px';
    }
  }
  function show(n) {
    current = n;
    scenes.forEach((s, i) => s.classList.toggle('active', i === n));
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n)));
    heading.textContent = wording[n]; fit();
    root.querySelector('.landing-counter').textContent = String(n + 1).padStart(2, '0') + ' / 03';
  }
  function syncTimer() {
    clearInterval(timer); timer = null;
    pause.textContent = paused ? '재생' : '일시정지';
    pause.setAttribute('aria-label', paused ? '사진 자동 전환 재생' : '사진 자동 전환 일시정지');
    if (!paused && !document.hidden && document.body.classList.contains('msds-landing-open')) timer = setInterval(() => show((current + 1) % 3), 2500);
  }
  function route() {
    const landing = location.hash !== '#msds';
    document.body.classList.toggle('msds-landing-open', landing);
    root.setAttribute('aria-hidden', String(!landing));
    syncTimer(); fit();
    if (landing) root.querySelector('.landing-enter').focus({preventScroll: true});
    else {
      window.scrollTo(0, 0);
      const title = document.getElementById('browseTitle');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus({preventScroll: true}); }
    }
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => { show(i); syncTimer(); }));
  pause.addEventListener('click', () => { paused = !paused; syncTimer(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', syncTimer);
  motion.addEventListener('change', () => { paused = motion.matches; syncTimer(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(root);
  window.addEventListener('resize', fit);
  route();
})();
