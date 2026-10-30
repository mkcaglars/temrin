// Uygulamanın giriş noktası: oturum kontrolü ve sayfa yönlendirme.
import { api } from './api.js';
import { h } from './ui.js';
import { loadEngine } from './engine.js';
import { ProjectsView } from './projects.js';
import { TeacherView } from './teacher.js';
import { Ide } from './ide.js';

const app = document.getElementById('app');
const state = { user: null, info: null, view: null, engineProgress: 0 };

/** Motor arka planda yüklenir; IDE açıldığında hazır olur. */
export const enginePromise = new Promise((resolve, reject) => {
  state.startEngine = () => loadEngine((loaded, total) => {
    state.engineProgress = total ? loaded / total : 0;
    document.dispatchEvent(new CustomEvent('engine-progress', { detail: state.engineProgress }));
  }).then(resolve, reject);
});

async function boot() {
  try {
    state.info = await api.info();
  } catch {
    state.info = {};
  }
  try {
    const { user } = await api.me();
    state.user = user;
  } catch (e) {
    showLoginRequired(e);
    return;
  }
  state.startEngine();
  window.addEventListener('hashchange', route);
  route();
}

function showLoginRequired(e) {
  const portal = state.info?.portal_url;
  app.innerHTML = '';
  app.appendChild(h('div', { class: 'center-page' },
    h('div', { class: 'card login-card' },
      h('div', { class: 'brand big' }, h('span', { class: 'brand-logo' }, 'C#'), h('span', {}, 'Form Stüdyosu')),
      h('h2', {}, e?.status === 401 ? 'Oturum açılmamış' : 'Sunucuya bağlanılamadı'),
      h('p', {}, e?.status === 401
        ? 'Bu uygulamaya okul portalındaki bağlantı ile giriş yapılır. Lütfen portal üzerinden tekrar girin.'
        : (e?.message || 'Bilinmeyen hata')),
      portal ? h('a', { class: 'btn btn-primary', href: portal }, 'Okul portalına git') : null,
      state.info?.test_portal ? h('a', { class: 'btn', href: 'test-portal.php', style: { marginLeft: '8px' } }, 'Deneme girişi') : null,
    )));
}

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (state.view?.dispose) {
    const ok = await state.view.dispose();
    if (ok === false) return;
  }
  state.view = null;
  app.innerHTML = '';
  const ctx = { user: state.user, info: state.info, enginePromise, app };

  if (parts[0] === 'proje' && /^\d+$/.test(parts[1] || '')) {
    state.view = new Ide(ctx, Number(parts[1]));
  } else if (parts[0] === 'ogretmen' && state.user.role === 'ogretmen') {
    state.view = new TeacherView(ctx, parts[1] === 'ogrenci' ? Number(parts[2]) : null);
  } else {
    state.view = new ProjectsView(ctx);
  }
  await state.view.mount(app);
}

boot();
