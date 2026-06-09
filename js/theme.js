// js/theme.js
//
// Light/dark theme toggle binding, shared by the wizard (app.js) and the info
// page so the control works on both without pulling in the whole app. The
// no-flash init that sets data-theme BEFORE paint stays inline in each page's
// <head>; this only wires the toggle button and live OS-theme following.

// Browser-chrome color per theme. Mirrors --bg in css/styles.css; the values
// also live in each page's <meta name="theme-color"> tags (media-keyed to the
// OS preference), which syncThemeColorMeta overwrites because a manual toggle
// can disagree with the OS.
const THEME_BG = { light: '#fafaf9', dark: '#0d1117' };

function syncThemeColorMeta() {
  const theme = document.documentElement.getAttribute('data-theme');
  const color = THEME_BG[theme];
  if (!color) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', color);
  });
}

export function bindThemeToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;

  const setLabel = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  setLabel();
  // The head's no-flash init may have applied a stored manual theme that
  // disagrees with the OS-preference media queries on the meta tags.
  syncThemeColorMeta();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    setLabel();
    syncThemeColorMeta();
  });

  // If the user hasn't picked manually, follow OS theme changes live.
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      let stored = null;
      try { stored = localStorage.getItem('theme'); } catch {}
      if (stored === 'light' || stored === 'dark') return;
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      setLabel();
      syncThemeColorMeta();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}
