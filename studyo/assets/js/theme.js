// Açık / karanlık tema. Seçim tarayıcıda saklanır; seçim yoksa işletim sisteminin ayarı izlenir.
import { h } from './ui.js';

const KEY = 'csfs-theme';
const listeners = new Set();
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function stored() {
  try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; }
}

export function currentTheme() {
  return stored() || (media?.matches ? 'dark' : 'light');
}

/** Monaco tema adı */
export function monacoTheme() {
  return currentTheme() === 'dark' ? 'vs-dark' : 'vs';
}

function apply() {
  const t = currentTheme();
  document.documentElement.dataset.theme = t;
  window.monaco?.editor?.setTheme(t === 'dark' ? 'vs-dark' : 'vs');
  for (const fn of listeners) { try { fn(t); } catch (e) { console.error(e); } }
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* yok */ }
  apply();
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Üst çubuktaki ay / güneş düğmesi */
export function themeButton() {
  const label = (t) => (t === 'dark' ? '☀️' : '\u{1F319}');
  const title = (t) => (t === 'dark' ? 'Açık temaya geç' : 'Karanlık temaya geç');
  const b = h('button', { class: 'btn btn-ghost theme-btn', title: title(currentTheme()), 'aria-label': 'Tema', onclick: () => toggleTheme() }, label(currentTheme()));
  const off = onThemeChange((t) => {
    if (!b.isConnected) { off(); return; }
    b.textContent = label(t);
    b.title = title(t);
  });
  return b;
}

media?.addEventListener?.('change', () => { if (!stored()) apply(); });
apply();
