// Sunucu (PHP) ile iletişim.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, route, body, opts = {}) {
  const url = `api/index.php?r=${encodeURI(route)}${opts.query ? '&' + new URLSearchParams(opts.query) : ''}`;
  const init = {
    method,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'csharp-ders' },
    keepalive: !!opts.keepalive,
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* boş yanıt */ }
  if (!res.ok) throw new ApiError(data?.error || `Sunucu hatası (${res.status})`, res.status, data);
  return data;
}

export const api = {
  info: () => request('GET', 'info'),
  me: () => request('GET', 'me'),
  listProjects: () => request('GET', 'projects'),
  getProject: (id) => request('GET', `projects/${id}`),
  createProject: (name, data) => request('POST', 'projects', { name, data }),
  saveProject: (id, data, version, opts = {}) => request('PUT', `projects/${id}`, { data, version, force: !!opts.force, name: opts.name }, { keepalive: opts.keepalive }),
  renameProject: (id, name) => request('POST', `projects/${id}/rename`, { name }),
  copyProject: (id, name) => request('POST', `projects/${id}/copy`, name ? { name } : {}),
  distributeProject: (id, opts) => request('POST', `projects/${id}/distribute`, opts),
  deleteProject: (id) => request('DELETE', `projects/${id}`),
  setNote: (id, note) => request('POST', `projects/${id}/note`, { note }),
  students: (sinif) => request('GET', 'teacher/students', undefined, { query: sinif ? { sinif } : null }),
  studentProjects: (id) => request('GET', `teacher/students/${id}/projects`),
};

/** Sunucunun UTC tarihini yerel saatle okunur biçime çevirir. */
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
