// Uygulama genelinde kullanılan küçük arayüz yardımcıları: iletişim kutuları, bildirimler.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastHost;
export function toast(message, kind = 'info', ms = 3500) {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts' }));
  const t = h('div', { class: `toast toast-${kind}` }, message);
  toastHost.appendChild(t);
  setTimeout(() => t.classList.add('hide'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/**
 * Basit modal iletişim kutusu.
 * @returns {Promise<string|null>} tıklanan düğmenin değeri, kapatılırsa null
 */
export function modal({ title, body, buttons = [{ text: 'Tamam', value: 'ok', primary: true }], width, onOpen, dismissable = true }) {
  return new Promise((resolve) => {
    const content = typeof body === 'string' ? h('div', { class: 'modal-text' }, body) : body;
    const footer = h('div', { class: 'modal-footer' });
    const box = h('div', { class: 'modal', style: width ? { width: width + 'px' } : null },
      h('div', { class: 'modal-head' }, h('span', {}, title || ''), dismissable ? h('button', { class: 'modal-x', title: 'Kapat', onclick: () => close(null) }, '✕') : null),
      h('div', { class: 'modal-body' }, content),
      footer);
    const shade = h('div', { class: 'modal-shade' }, box);
    let done = false;
    function close(value) {
      if (done) return;
      done = true;
      shade.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    }
    function onKey(e) {
      if (e.key === 'Escape' && dismissable) { e.preventDefault(); close(null); }
    }
    for (const b of buttons) {
      const btn = h('button', { class: 'btn ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : '') }, b.text);
      btn.onclick = async () => {
        if (b.validate) {
          const ok = await b.validate();
          if (!ok) return;
        }
        close(b.value);
      };
      footer.appendChild(btn);
    }
    shade.addEventListener('mousedown', (e) => { if (e.target === shade && dismissable) close(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(shade);
    onOpen?.(box, close);
    const first = box.querySelector('input, textarea, select') || footer.querySelector('.btn-primary');
    setTimeout(() => first?.focus(), 0);
  });
}

export async function confirmBox(title, text, okText = 'Evet', danger = false) {
  const r = await modal({
    title,
    body: text,
    buttons: [{ text: 'Vazgeç', value: null }, { text: okText, value: 'ok', primary: !danger, danger }],
  });
  return r === 'ok';
}

export async function promptBox(title, label, value = '', validate) {
  const input = h('input', { class: 'input', value, spellcheck: 'false' });
  const err = h('div', { class: 'field-error' });
  const body = h('div', { class: 'field' }, h('label', {}, label), input, err);
  let result = null;
  const check = () => {
    const v = input.value.trim();
    const msg = validate ? validate(v) : (v ? null : 'Boş bırakılamaz.');
    err.textContent = msg || '';
    if (!msg) result = v;
    return !msg;
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      body.closest('.modal').querySelector('.btn-primary').click();
    }
  });
  const r = await modal({ title, body, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true, validate: check }] });
  if (r !== 'ok') return null;
  return result;
}

export function download(filename, bytes, type = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
