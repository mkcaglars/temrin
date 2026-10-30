// C# Form Stüdyosu'nun (c-lesson) api.js modülünün Temrin uyarlaması.
// build.sh bu dosyayı studyo/assets/js/api.js olarak kopyalar; c-lesson'un editörü (ide.js) projeyi
// buradan açıp kaydeder. Proje = öğrencinin bu temrindeki çalışması (api/calisma.php).
import { TEMPLATES, toNamespace } from './templates.js';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const baglam = () => ({
  temrin: Number(document.body.dataset.temrin),
  ogrenci: document.body.dataset.ogrenci || '',
  csrf: document.querySelector('meta[name=csrf]')?.content || '',
});

export async function istek(method, govde, sorgu) {
  const url = '../api/calisma.php' + (sorgu ? '?' + new URLSearchParams(sorgu) : '');
  const init = { method, credentials: 'same-origin', headers: {} };
  if (govde !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.headers['X-CSRF-Token'] = baglam().csrf;
    init.body = JSON.stringify(govde);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* boş yanıt */ }
  if (!res.ok) throw new ApiError(data?.mesaj || `Sunucu hatası (${res.status})`, res.status, data);
  return data;
}

/** Sunucu zamanı (2026-11-02T07:15:00Z) → c-lesson'un beklediği "2026-11-02 07:15:00" (UTC). */
const cleZaman = (s) => (s || '').replace('T', ' ').replace('Z', '');

/** Sayfa açılışında bir kez yüklenen çalışma; temrin.js ve editör aynı yanıtı kullanır. */
let yuklenen = null;
export function calismaYukle() {
  if (!yuklenen) {
    const b = baglam();
    yuklenen = istek('GET', undefined, b.ogrenci ? { temrin_id: b.temrin, okul_no: b.ogrenci } : { temrin_id: b.temrin });
    yuklenen.catch(() => { yuklenen = null; });
  }
  return yuklenen;
}

const desteklenmiyor = () => Promise.reject(new ApiError('Bu işlem temrinde kullanılamaz.', 400));

export const api = {
  async getProject() {
    const r = await calismaYukle();
    const t = r.temrin;
    const ad = t.bilgi.proje_adi || `Temrin${t.bilgi.temrin_no}`;
    const data = r.calisma.veri || TEMPLATES[0].create(toNamespace(ad));
    const o = r.calisma.ogrenci;
    return {
      id: t.temrin_id,
      name: ad,
      version: r.calisma.surum,
      data,
      readonly: !!r.calisma.salt_okunur,
      note: '',
      owner: { id: 0, name: o ? o.ad_soyad : '', sinif: o ? o.sinif : '' },
      updated_at: cleZaman(r.calisma.guncellenme),
    };
  },
  async saveProject(_id, data, version, opts = {}) {
    try {
      const r = await istek('POST', { islem: 'kaydet', temrin_id: baglam().temrin, veri: data, surum: version, force: !!opts.force });
      return { version: r.surum, updated_at: cleZaman(r.guncellenme) };
    } catch (e) {
      if (e.status === 409 && e.data?.kod === 'CAKISMA') throw new ApiError(e.message, 409, { updated_at: cleZaman(e.data.guncellenme) });
      throw e;
    }
  },
  info: () => Promise.resolve({}),
  me: () => Promise.resolve({ user: { name: document.body.dataset.ad, role: document.body.dataset.rol } }),
  listProjects: desteklenmiyor,
  createProject: desteklenmiyor,
  renameProject: desteklenmiyor,
  copyProject: desteklenmiyor,
  distributeProject: desteklenmiyor,
  deleteProject: desteklenmiyor,
  setNote: desteklenmiyor,
  students: desteklenmiyor,
  studentProjects: desteklenmiyor,
};

/** Sunucunun UTC tarihini yerel saatle okunur biçime çevirir (c-lesson ile aynı). */
export function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return 'Bugün ' + time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Dün ' + time;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ' ' + time;
}
