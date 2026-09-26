const widget = document.querySelector('[data-post-toc]');
if (widget) {
  const toggle = widget.querySelector('.post-toc-toggle');
  const panel = widget.querySelector('.post-toc-panel');
  const close = widget.querySelector('.post-toc-close');
  const firstLink = panel?.querySelector('a[href^="#"]');

  if (toggle && panel && close) {
    const setOpen = (open, returnFocus = false) => {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) firstLink?.focus();
      else if (returnFocus) toggle.focus();
    };
    const revealAfterScroll = () => {
      const threshold = Math.max(180, Math.min(320, window.innerHeight * 0.28));
      if (window.scrollY < threshold) return;
      widget.hidden = false;
      window.removeEventListener('scroll', revealAfterScroll);
      window.removeEventListener('resize', revealAfterScroll);
    };

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false, true));
    panel.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a[href^="#"]')) setOpen(false);
    });
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false, true);
    });
    window.addEventListener('scroll', revealAfterScroll, { passive: true });
    window.addEventListener('resize', revealAfterScroll);
    requestAnimationFrame(revealAfterScroll);
  } else {
    widget.remove();
  }
}
