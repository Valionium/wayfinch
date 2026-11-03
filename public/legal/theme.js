// The rider's theme choice from You, for the legal pages. Reads the one setting; a browser that won't say leaves the phone's own.
try {
  var t = JSON.parse(localStorage.getItem('copilot:settings') || 'null');
  if (t && (t.theme === 'light' || t.theme === 'dark')) document.documentElement.setAttribute('data-theme', t.theme);
} catch (e) { /* the phone's setting stays */ }
