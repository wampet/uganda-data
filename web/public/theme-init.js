// Runs in <head> before first paint: apply the reader's saved light/dark choice.
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {}
