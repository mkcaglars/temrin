// MySQL işlevlerinin SQLite üzerindeki karşılıkları ve yardımcıları.

const TR_FOLD = { 'ı': 'i', 'İ': 'i', 'I': 'i' };

/** utf8mb4_0900_ai_ci benzeri karşılaştırma anahtarı: büyük/küçük harf ve aksan duyarsız. */
export function fold(s) {
  return String(s)
    .replace(/[ıİI]/g, (c) => TR_FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fmtDateTime(d) {
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** MySQL tarih/zaman değerini {y,m,d,h,i,s} olarak çözer; geçersizse null. */
export function parseDateTime(v) {
  if (v == null) return null;
  let s = String(v).trim();
  let m;
  if (/^\d{8}$/.test(s)) s = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  else if (/^\d{14}$/.test(s)) s = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12)}`;
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d+)?)?)?$/.exec(s);
  if (!m) return null;
  const r = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), i: +(m[5] || 0), s: +(m[6] || 0), time: m[4] != null };
  if (r.m < 1 || r.m > 12 || r.d < 1 || r.h > 23 || r.i > 59 || r.s > 59) return null;
  const dim = new Date(r.y, r.m, 0).getDate();
  if (r.d > dim) return null;
  return r;
}

export function normDate(v) {
  const p = parseDateTime(v);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
}
export function normDateTime(v) {
  const p = parseDateTime(v);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.i)}:${pad(p.s)}` : null;
}
export function normTime(v) {
  if (v == null) return null;
  const m = /^(-?\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(v).trim());
  if (m) return `${m[1].padStart(2, '0')}:${pad(+m[2])}:${pad(+(m[3] || 0))}`;
  const p = parseDateTime(v);
  return p && p.time ? `${pad(p.h)}:${pad(p.i)}:${pad(p.s)}` : null;
}

function toDate(v) {
  const p = parseDateTime(v);
  return p ? new Date(p.y, p.m - 1, p.d, p.h, p.i, p.s) : null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateFormat(v, f) {
  const d = toDate(v);
  if (!d || f == null) return null;
  const map = {
    Y: () => d.getFullYear(), y: () => pad(d.getFullYear() % 100), m: () => pad(d.getMonth() + 1), c: () => d.getMonth() + 1,
    d: () => pad(d.getDate()), e: () => d.getDate(), H: () => pad(d.getHours()), h: () => pad(d.getHours() % 12 || 12), I: () => pad(d.getHours() % 12 || 12),
    i: () => pad(d.getMinutes()), s: () => pad(d.getSeconds()), S: () => pad(d.getSeconds()), p: () => (d.getHours() < 12 ? 'AM' : 'PM'),
    M: () => MONTH_NAMES[d.getMonth()], b: () => MONTH_NAMES[d.getMonth()].slice(0, 3), W: () => DAY_NAMES[d.getDay()], a: () => DAY_NAMES[d.getDay()].slice(0, 3),
    j: () => pad(Math.round((d - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1, 3), w: () => d.getDay(), T: () => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    '%': () => '%',
  };
  return String(f).replace(/%(.)/g, (all, k) => (map[k] ? String(map[k]()) : k));
}

function addInterval(v, n, unit) {
  const p = parseDateTime(v);
  if (!p || n == null) return null;
  const d = new Date(p.y, p.m - 1, p.d, p.h, p.i, p.s);
  n = Number(n);
  switch (String(unit).toUpperCase()) {
    case 'YEAR': d.setFullYear(d.getFullYear() + n); break;
    case 'QUARTER': d.setMonth(d.getMonth() + 3 * n); break;
    case 'MONTH': {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    }
    case 'WEEK': d.setDate(d.getDate() + 7 * n); break;
    case 'DAY': d.setDate(d.getDate() + n); break;
    case 'HOUR': d.setHours(d.getHours() + n); break;
    case 'MINUTE': d.setMinutes(d.getMinutes() + n); break;
    case 'SECOND': d.setSeconds(d.getSeconds() + n); break;
    default: return null;
  }
  return p.time || /HOUR|MINUTE|SECOND/i.test(unit) ? fmtDateTime(d) : fmtDate(d);
}

function timestampDiff(unit, a, b) {
  const x = toDate(a);
  const y = toDate(b);
  if (!x || !y) return null;
  const ms = y - x;
  switch (String(unit).toUpperCase()) {
    case 'SECOND': return Math.trunc(ms / 1e3);
    case 'MINUTE': return Math.trunc(ms / 6e4);
    case 'HOUR': return Math.trunc(ms / 36e5);
    case 'DAY': return Math.trunc(ms / 864e5);
    case 'WEEK': return Math.trunc(ms / 6048e5);
    case 'MONTH':
    case 'QUARTER':
    case 'YEAR': {
      let months = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
      const yRest = y.getDate() * 864e5 + (y - new Date(y.getFullYear(), y.getMonth(), y.getDate()));
      const xRest = x.getDate() * 864e5 + (x - new Date(x.getFullYear(), x.getMonth(), x.getDate()));
      if (months > 0 && yRest < xRest) months--;
      else if (months < 0 && yRest > xRest) months++;
      const u = String(unit).toUpperCase();
      return u === 'MONTH' ? months : u === 'QUARTER' ? Math.trunc(months / 3) : Math.trunc(months / 12);
    }
    default: return null;
  }
}

/** MySQL LIKE: büyük/küçük harf ve aksan duyarsız, varsayılan kaçış karakteri \ */
export function likeMatch(pattern, value, esc = '\\') {
  if (pattern == null || value == null) return null;
  const p = fold(pattern);
  const v = fold(value);
  let re = '^';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (esc && c === esc && i + 1 < p.length) { re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (c === '%') re += '[\\s\\S]*';
    else if (c === '_') re += '[\\s\\S]';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(re + '$', 'u').test(v) ? 1 : 0;
}

function num(x) {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(x, d) {
  const n = num(x);
  if (n == null) return null;
  d = Math.max(0, Math.min(30, Math.trunc(num(d) || 0)));
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}

/**
 * SQLite bağlantısına MySQL işlevlerini ekler.
 * ctx: { now(): Date, database(): string|null, version: string, user(): string }
 */
export function registerFunctions(db, ctx) {
  // sql.js, işlevin parametre sayısını fn.length'ten alır; isteğe bağlı/değişken
  // parametreli işlevler her parametre sayısı için ayrı kaydedilir.
  const f = (name, fn, min = fn.length, max = min) => {
    for (let n = min; n <= max; n++) {
      const w = (...a) => fn(...a);
      Object.defineProperty(w, 'length', { value: n });
      db.create_function(name, w);
    }
  };
  const now = () => ctx.now();
  f('m_now', () => fmtDateTime(now()));
  f('m_curdate', () => fmtDate(now()));
  f('m_curtime', () => fmtDateTime(now()).slice(11));
  f('m_date_ok', (v) => (v == null || normDate(v) ? 1 : 0));
  f('m_datetime_ok', (v) => (v == null || normDateTime(v) ? 1 : 0));
  f('m_time_ok', (v) => (v == null || normTime(v) ? 1 : 0));
  f('m_date_norm', normDate);
  f('m_datetime_norm', normDateTime);
  f('m_time_norm', normTime);
  f('m_year', (v) => parseDateTime(v)?.y ?? null);
  f('m_month', (v) => parseDateTime(v)?.m ?? null);
  f('m_day', (v) => parseDateTime(v)?.d ?? null);
  f('m_hour', (v) => { const t = normTime(v); return t ? parseInt(t, 10) : null; });
  f('m_minute', (v) => { const t = normTime(v); return t ? +t.split(':')[1] : null; });
  f('m_second', (v) => { const t = normTime(v); return t ? +t.split(':')[2] : null; });
  f('m_quarter', (v) => { const p = parseDateTime(v); return p ? Math.ceil(p.m / 3) : null; });
  f('m_dayname', (v) => { const d = toDate(v); return d ? DAY_NAMES[d.getDay()] : null; });
  f('m_monthname', (v) => { const d = toDate(v); return d ? MONTH_NAMES[d.getMonth()] : null; });
  f('m_dayofweek', (v) => { const d = toDate(v); return d ? d.getDay() + 1 : null; });
  f('m_dayofyear', (v) => { const d = toDate(v); return d ? Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1 : null; });
  f('m_datediff', (a, b) => {
    const x = parseDateTime(a);
    const y = parseDateTime(b);
    if (!x || !y) return null;
    return Math.round((Date.UTC(x.y, x.m - 1, x.d) - Date.UTC(y.y, y.m - 1, y.d)) / 864e5);
  });
  f('m_date_format', dateFormat);
  f('m_date_add', (v, n, u) => addInterval(v, n, u));
  f('m_date_sub', (v, n, u) => addInterval(v, n == null ? null : -n, u));
  f('m_timestampdiff', timestampDiff);
  f('m_concat', (...a) => (a.some((x) => x == null) ? null : a.map(str).join('')), 1, 32);
  f('m_concat_ws', (sep, ...a) => (sep == null ? null : a.filter((x) => x != null).map(str).join(str(sep))), 2, 32);
  f('m_left', (s, n) => (s == null || n == null ? null : [...str(s)].slice(0, Math.max(0, n)).join('')));
  f('m_right', (s, n) => (s == null || n == null ? null : n <= 0 ? '' : [...str(s)].slice(-n).join('')));
  f('m_locate', (sub, s, pos) => {
    if (sub == null || s == null) return null;
    const start = Math.max(1, pos == null ? 1 : Math.trunc(pos)) - 1;
    const i = fold(s).indexOf(fold(sub), start);
    return i + 1;
  }, 2, 3);
  f('m_instr', (s, sub) => (s == null || sub == null ? null : fold(s).indexOf(fold(sub)) + 1));
  f('upper', (s) => (s == null ? null : str(s).toUpperCase()));
  f('lower', (s) => (s == null ? null : str(s).toLowerCase()));
  f('m_reverse', (s) => (s == null ? null : [...str(s)].reverse().join('')));
  f('m_repeat', (s, n) => (s == null || n == null ? null : str(s).repeat(Math.max(0, Math.min(10000, n)))));
  f('m_space', (n) => (n == null ? null : ' '.repeat(Math.max(0, Math.min(10000, n)))));
  f('m_lpad', (s, n, p) => (s == null || n == null || p == null ? null : padStr(str(s), n, str(p), true)));
  f('m_rpad', (s, n, p) => (s == null || n == null || p == null ? null : padStr(str(s), n, str(p), false)));
  f('m_format', formatNumber, 2);
  f('m_truncate', (x, d) => { const n = num(x); if (n == null || d == null) return null; const k = 10 ** Math.trunc(d); return Math.trunc(n * k) / k; });
  f('m_round', (x, d) => {
    const n = num(x);
    if (n == null) return null;
    const k = 10 ** Math.trunc(d || 0);
    const r = Math.sign(n) * Math.round(Math.abs(n) * k + 1e-9) / k;
    return d ? r : Math.trunc(r);
  }, 1, 2);
  f('m_ceil', (x) => { const n = num(x); return n == null ? null : Math.ceil(n); });
  f('m_floor', (x) => { const n = num(x); return n == null ? null : Math.floor(n); });
  f('m_pow', (a, b) => (a == null || b == null ? null : Math.pow(num(a), num(b))));
  f('m_sqrt', (a) => (a == null || num(a) < 0 ? null : Math.sqrt(num(a))));
  f('m_exp', (a) => (a == null ? null : Math.exp(num(a))));
  f('m_ln', (a, b) => (b === undefined ? (a == null || num(a) <= 0 ? null : Math.log(num(a))) : (a == null || b == null || num(b) <= 0 || num(a) <= 0 ? null : Math.log(num(b)) / Math.log(num(a)))), 1, 2);
  f('m_log10', (a) => (a == null || num(a) <= 0 ? null : Math.log10(num(a))));
  f('m_mod', (a, b) => (a == null || b == null || num(b) === 0 ? null : num(a) % num(b)));
  f('m_sign', (a) => (a == null ? null : Math.sign(num(a))));
  f('m_pi', () => Math.PI);
  f('m_rand', () => Math.random(), 0, 1);
  f('m_isnull', (a) => (a == null ? 1 : 0));
  f('m_strcmp', (a, b) => (a == null || b == null ? null : Math.sign(fold(a).localeCompare(fold(b)))));
  f('m_database', () => ctx.database());
  f('m_version', () => ctx.version());
  f('m_user', () => ctx.user());
  f('m_uuid', () => crypto.randomUUID());
  f('m_sort', (v) => (typeof v === 'string' ? fold(v) : v));
  f('like', (p, v, e) => likeMatch(p, v, e === undefined ? '\\' : e), 2, 3);
  f('regexp', (p, v) => {
    if (p == null || v == null) return null;
    try { return new RegExp(str(p), 'iu').test(str(v)) ? 1 : 0; } catch { return 0; }
  });
}

function str(x) {
  if (x instanceof Uint8Array) return new TextDecoder().decode(x);
  if (typeof x === 'number' && !Number.isInteger(x)) return String(Number(x.toPrecision(15)));
  return String(x);
}

function padStr(s, n, p, left) {
  const chars = [...s];
  if (n < chars.length) return chars.slice(0, n).join('');
  if (!p) return null;
  let fill = '';
  while ([...fill].length < n - chars.length) fill += p;
  fill = [...fill].slice(0, n - chars.length).join('');
  return left ? fill + s : s + fill;
}
